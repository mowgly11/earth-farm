import { CommandInteraction, SlashCommandBuilder, EmbedBuilder, MessageFlags, AttachmentBuilder } from "discord.js";
import database from "../database/methods.ts";
import { userProfileCache } from "../index.ts";
import Canvas, { type Image } from "canvas";
import { join } from "path";
import fs from "fs";
import type { FarmCanvasProperties } from "../types/commands_types.ts";
import getImage from "../utils/image_loading.ts";

let assetsPath = join(__dirname, '../assets');
let allDirectories = fs.readdirSync(assetsPath);

let imagesObj: Record<string, Image> = {};

allDirectories.forEach((dir) => {
    let dirImages = fs.readdirSync(join(assetsPath, dir));
    dirImages.forEach(async (file) => {
        const image = await getImage(join(assetsPath, dir, file));
        imagesObj[file.replace(".png", "")] = image;
    });
});

export const data = new SlashCommandBuilder()
    .setName("farm")
    .setDescription("check your farm stats and occupied crop & animal slots")
    .addUserOption(option =>
        option
            .setName("farmer")
            .setDescription("check another farmer's farm stats")
    )

export async function execute(interaction: CommandInteraction) {
    let user: any = interaction.options.get("farmer")?.user;
    if (!user) user = interaction.user;

    if (user.bot) return interaction.reply({ content: "you can't interact with bots!", flags: MessageFlags.Ephemeral });
    await interaction.deferReply();

    // Check cache first
    let userProfile: any = userProfileCache.get(user.id);

    // If not in cache, get from database and cache it
    if (!userProfile) {
        const dbProfile = await database.findUser(user.id);
        if (!dbProfile) return interaction.editReply({ content: `${user.username}'s farm wasn't found.` });

        // Cache the plain object
        userProfile = (dbProfile as any).toObject();
        userProfileCache.set(user.id, userProfile);
    }

    let farmProperties: FarmCanvasProperties = {
        barn: "level_1_barn",
        crops: [],
        animals: []
    };

    farmProperties.barn = `level_${userProfile.farm.level}_barn`;

    farmProperties.crops = userProfile.farm.occupied_crop_slots.map((crop: Record<string, string | number>) => {
        return {
            name: crop.gives,
            ready_at: crop.ready_at
        };
    });

    farmProperties.animals = userProfile.farm.occupied_animal_slots.map((animal: Record<string, string | number>) => {
        return {
            name: animal.name,
            ready_at: animal.ready_at
        };
    });

    const canvas = Canvas.createCanvas(300, 300);
    const ctx = canvas.getContext("2d");

    ctx.drawImage(imagesObj["base"], 0, 0, canvas.width, canvas.height); // drawing the base image

    ctx.drawImage(imagesObj[farmProperties.barn], 160, 10, 130, 130); // X - Y - width - height drawing the barn image depending on the level

    let lastDrawnCropXandY = [170, 150];
    let lastDrawnAnimalXandY = [25, 170];

    if (farmProperties.crops.length > 0) {
        for (let i = 0; i < farmProperties.crops.length; i++) {
            const crop = farmProperties.crops[i];
            let cropImg: Image;
            if (Date.now() > crop.ready_at) cropImg = imagesObj[`full_${crop.name.toLowerCase()}`];
            else cropImg = imagesObj[`started_${crop.name.toLowerCase()}`];

            let cropX = lastDrawnCropXandY[0];
            let cropY = lastDrawnCropXandY[1];

            if (i > 0 && i % 4 === 0) {
                cropX = 170;
                cropY += 25;
            }

            ctx.drawImage(cropImg, cropX, cropY, 25, 25);
            lastDrawnCropXandY = [cropX + 30, cropY];
        }
    }

    if (farmProperties.animals.length > 0) {
        for (let i = 0; i < farmProperties.animals.length; i++) {
            const animal = farmProperties.animals[i];
            let animalImg: Image;
            if (Date.now() > animal.ready_at) animalImg = imagesObj[`ready_${animal.name.split(" ").join("").toLowerCase()}`];
            else animalImg = imagesObj[`${animal.name.split(" ").join("").toLowerCase()}`];

            let animalX = lastDrawnAnimalXandY[0];
            let animalY = lastDrawnAnimalXandY[1];

            if (i > 0 && i % 3 === 0) {
                animalX = 25;
                animalY += 32;
            }

            ctx.drawImage(animalImg, animalX, animalY, 25, 30);
            lastDrawnAnimalXandY = [animalX + 35, animalY];
        }
    }

    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: "farm.png" });

    await interaction.editReply({ content: stringifySlots(userProfile.farm) + "Here is a picture of your farm", files: [attachment] });
}

function stringifySlots(farmDetails: any) {
    let strOfUserData: string = "";
    const now = Date.now();
    const actionsData = require("../config/data/actions.json").actions;

    // Check and reset expired boosts
    if (farmDetails.farm?.occupied_animal_slots) {
        for (const animalSlot of farmDetails.farm.occupied_animal_slots) {
            if (animalSlot.boost_expires_at && now > animalSlot.boost_expires_at) {
                animalSlot.total_boost = 0;
                animalSlot.boost_expires_at = 0;
            }
        }
    }

    // Add action cooldowns section
    strOfUserData += "**🔄 Animal Care Actions:**\n";

    // Feeding status
    const feedCooldown = ((farmDetails.actions?.lastFed || 0) + actionsData.feeding.cooldown) - now;
    strOfUserData += `🍽️ Feeding (${actionsData.feeding.boost}% boost): ${feedCooldown > 0 ? Math.ceil(feedCooldown / 1000 / 60) + ' mins' : 'Ready!'}\n`;

    // Petting status
    const petCooldown = ((farmDetails.actions?.lastPet || 0) + actionsData.petting.cooldown) - now;
    strOfUserData += `🤚 Petting (${actionsData.petting.boost}% boost): ${petCooldown > 0 ? Math.ceil(petCooldown / 1000 / 60) + ' mins' : 'Ready!'}\n`;

    // Cleaning status
    const cleanCooldown = ((farmDetails.actions?.lastCleaned || 0) + actionsData.cleaning.cooldown) - now;
    strOfUserData += `🧹 Cleaning (${actionsData.cleaning.boost}% boost): ${cleanCooldown > 0 ? Math.ceil(cleanCooldown / 1000 / 60) + ' mins' : 'Ready!'}\n\n`;

    // Rest of farm information
    const keys = Object.keys(farmDetails);
    for (let i = 0; i < keys.length; i++) {
        const val = farmDetails[keys[i]];
        if (typeof val !== "object") strOfUserData += `**${keys[i].replace(/_/g, " ")}:** ${String(val)}\n`;
        else {
            strOfUserData += "\n";
            for (let j = 0; j < val.length; j++) {
                let slotType = keys[i] === "occupied_crop_slots" ? "plant" : "animal";
                let objKeys = Object.keys(val[j]);
                for (let k = 0; k < objKeys.length; k++) {
                    // Skip boost-related fields and other fields we don't want to show
                    if (objKeys[k] === "gives" ||
                        objKeys[k] === "ready_time" ||
                        objKeys[k] === "boost_expires_at" ||
                        objKeys[k] === "total_boost") continue;

                    strOfUserData += `**Slot ${j + 1} ${slotType} ${objKeys[k].replace(/_/g, " ")}:** ${objKeys[k] === "ready_at" ? String(((val[j][objKeys[k]] - Date.now()) / 1000) < 0 ? "Ready!" : ((val[j][objKeys[k]] - Date.now()) / 1000).toFixed(0) + 's') : val[j][objKeys[k]]}\n`;
                }
                // Add total boost display if it's an animal slot
                if (slotType === "animal") {
                    const totalBoost = val[j].total_boost || 0;
                    const boostExpiresAt = val[j].boost_expires_at;

                    if (totalBoost > 0 && boostExpiresAt) {
                        const timeLeft = Math.max(0, Math.ceil((boostExpiresAt - Date.now()) / 1000 / 60));
                        strOfUserData += `**Slot ${j + 1} total boost:** ${totalBoost}% (Expires in ${timeLeft} mins)\n`;
                    } else {
                        strOfUserData += `**Slot ${j + 1} total boost:** ${totalBoost}%\n`;
                    }
                }
                strOfUserData += "\n";
            }
        }
    }

    return strOfUserData;
}