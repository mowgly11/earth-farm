import { CommandInteraction, SlashCommandBuilder, MessageFlags, AttachmentBuilder, ButtonBuilder, ActionRowBuilder, EmbedBuilder } from "discord.js";
import database from "../database/methods.ts";
import { userProfileCache } from "../index.ts";
import Canvas, { type Image } from "canvas";
import { join } from "path";
import fs from "fs";
import type { FarmCanvasProperties } from "../types/commands_types.ts";
import getImage from "../utils/image_loading.ts";
import { BUTTONS } from "../utils/buttons.ts";
import { COLORS } from "../utils/constants.ts";
import { createNoProfileEmbed } from "../utils/onboarding.ts";

let assetsPath = join(__dirname, '../assets');
let allDirectories = fs.readdirSync(assetsPath).filter((dir) => dir !== "products" && dir !== "cards");

let imagesObj: Record<string, Image> = {};
let imagesLoaded = false;
let loadingPromise: Promise<void> | null = null;

/**
 * Ensures all farm images are loaded before proceeding
 * Uses lazy loading with a lock to prevent multiple concurrent loads
 */
async function ensureImagesLoaded(): Promise<void> {
    if (imagesLoaded) return;
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
        for (const dir of allDirectories) {
            const dirImages = fs.readdirSync(join(assetsPath, dir));
            for (const file of dirImages) {
                try {
                    const image = await getImage(join(assetsPath, dir, file));
                    imagesObj[file.replace(".png", "").replace(".jpeg", "")] = image;
                } catch (err) {
                    console.error(`Failed to load farm image: ${file}`, err);
                }
            }
        }
        imagesLoaded = true;
    })();

    return loadingPromise;
}


export const data = new SlashCommandBuilder()
    .setName("farm")
    .setDescription("View your farm with crops and animals!")
    .addUserOption(option =>
        option
            .setName("farmer")
            .setDescription("View another farmer's farm")
    )

export async function execute(interaction: CommandInteraction) {
    let user: any = interaction.options.get("farmer")?.user;
    if (!user) user = interaction.user;

    const isSelf = user.id === interaction.user.id;

    if (user.bot) return await interaction.reply({ content: "You can't view a bot's farm!", flags: MessageFlags.Ephemeral });
    await interaction.deferReply();

    // Ensure all images are loaded before proceeding
    await ensureImagesLoaded();

      let userProfile: any = userProfileCache.get(user.id);

      if (!userProfile) {
        const dbProfile = await database.findUser(user.id);
        if (!dbProfile) {
            if (isSelf) {
                // Rich onboarding embed for self
                return await interaction.editReply(createNoProfileEmbed(user.id));
            }
            // Simple embed for viewing others
            const embed = new EmbedBuilder()
                .setTitle("❌ Farm Not Found")
                .setColor(COLORS.ERROR)
                .setDescription(`**${user.username}** doesn't have a farm yet.`);
            return await interaction.editReply({ embeds: [embed] });
        }

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

    ctx.drawImage(imagesObj[farmProperties.barn], 165, 10, 120, 130); // X - Y - width - height drawing the barn image depending on the level

    let lastDrawnCropXandY = [170, 150];
    let lastDrawnAnimalXandY = [25, 170];

    if (farmProperties.crops.length > 0) {
        for (let i = 0; i < farmProperties.crops.length; i++) {
            const crop = farmProperties.crops[i];
            let cropImg: Image;

            if (Date.now() > crop.ready_at) cropImg = imagesObj[`full_${crop.name.toLowerCase().replace(" ", "")}`];
            else cropImg = imagesObj[`started_${crop.name.toLowerCase().replace(" ", "")}`];

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

    const farmInfo = stringifySlots(userProfile.farm) + "Here is a picture of " + user.username + "'s farm";

    // Add navigation buttons for self
    if (isSelf) {
        const hasReadyCrops = farmProperties.crops.some((c: any) => Date.now() > c.ready_at);
        const hasReadyAnimals = farmProperties.animals.some((a: any) => Date.now() > a.ready_at);
        const hasReady = hasReadyCrops || hasReadyAnimals;

        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            BUTTONS.harvest().setStyle(hasReady ? 3 : 2), // SUCCESS : SECONDARY
            BUTTONS.plant(),
            BUTTONS.dashboard()
        );

        return await interaction.editReply({ content: farmInfo, files: [attachment], components: [buttons] });
    }

    await interaction.editReply({ content: farmInfo, files: [attachment] });
}

function stringifySlots(farmDetails: any) {
    let strOfUserData: string = "";
    const now = Date.now();
    const actionsRaw = require("../config/data/actions.json");
    const actionsData = (actionsRaw.default || actionsRaw).actions;

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

                strOfUserData += `**Slot ${j + 1}:** ${val[j].name} - ${Date.now() - val[j].ready_at > 0 ? 'Ready' : ((val[j].ready_at - Date.now()) / 1000).toFixed(0) + 's left'}${val[j]?.lifetime ? ` - ${Date.now() - val[j].lifetime > 0 ? 'Deceased' : ((val[j].lifetime - Date.now()) / 1000 / 60 / 60).toFixed(0) + 'h Lifetime'}` : ""}\n`;
                // Add total boost display if it's an animal slot
                if (slotType === "animal") {
                    const totalBoost = val[j].total_boost || 0;
                    const boostExpiresAt = val[j].boost_expires_at;

                    if (totalBoost > 0 && boostExpiresAt) {
                        const timeLeft = Math.max(0, Math.ceil((boostExpiresAt - Date.now()) / 1000 / 60));
                        strOfUserData += `**total boost:** ${totalBoost}% (Expires in ${timeLeft} mins)\n`;
                    } else {
                        strOfUserData += `**total boost:** ${totalBoost}%\n`;
                    }
                }
                strOfUserData += "\n";
            }
        }
    }

    return strOfUserData;
}