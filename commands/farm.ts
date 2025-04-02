import { CommandInteraction, SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import database from "../database/methods.ts";
import { userProfileCache } from "../index.ts";

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

    const farmerEmbed = new EmbedBuilder()
        .setTitle(`🌾 ${user.username}'s Farm`)
        .setColor("#FFD700")
        .setDescription(stringifySlots(userProfile.farm))
        .setThumbnail(user.displayAvatarURL())
        .setFooter({ text: `Farm Level ${userProfile.farm.level}` })
        .setTimestamp()
        .setImage("https://i.imgur.com/NiXXCZf.png");

    await interaction.editReply({ embeds: [farmerEmbed] });
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
    strOfUserData += `🍽️ Feeding (${actionsData.feeding.boost}% boost): ${feedCooldown > 0 ? Math.ceil(feedCooldown/1000/60) + ' mins' : 'Ready!'}\n`;
    
    // Petting status
    const petCooldown = ((farmDetails.actions?.lastPet || 0) + actionsData.petting.cooldown) - now;
    strOfUserData += `🤚 Petting (${actionsData.petting.boost}% boost): ${petCooldown > 0 ? Math.ceil(petCooldown/1000/60) + ' mins' : 'Ready!'}\n`;
    
    // Cleaning status
    const cleanCooldown = ((farmDetails.actions?.lastCleaned || 0) + actionsData.cleaning.cooldown) - now;
    strOfUserData += `🧹 Cleaning (${actionsData.cleaning.boost}% boost): ${cleanCooldown > 0 ? Math.ceil(cleanCooldown/1000/60) + ' mins' : 'Ready!'}\n\n`;

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