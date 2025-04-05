import { CommandInteraction, SlashCommandBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ActionRowBuilder, ComponentType } from "discord.js";
import database from "../database/methods.ts";
import farmLevels from "../config/upgrades/farms.json";
import { userProfileCache } from "../index.ts";
import schema from "../database/schema.ts";
import { logError } from "../utils/error_logger.ts";

export const data = new SlashCommandBuilder()
    .setName("upgradefarm")
    .setDescription("Upgrade your farm to the next level and gain its benefits.")

export async function execute(interaction: CommandInteraction) {
    const userId = interaction.user.id;

    // Check cache first
    let userProfile: any = userProfileCache.get(userId);
    
    // If not in cache, get from database and cache it
    if (!userProfile) {
        const dbProfile = await database.findUser(userId);
        if (!dbProfile) return interaction.editReply({ content: "Please make a profile using `/farmer` before trying to buy anything from the market." });
        
        // Cache the plain object
        userProfile = (dbProfile as any).toObject();
        userProfileCache.set(userId, userProfile);
    }

    const nextLevelData = farmLevels.find(v => v.level === userProfile.farm.level + 1);
    if (!nextLevelData) return interaction.reply({ content: "you are at the max level." });
    if (userProfile.gold < nextLevelData.price) return interaction.reply({ content: `you do not have enough gold to upgrade. the next farm level is priced at **${nextLevelData.price}** 🪙` });

    const confirmationEmbed = new EmbedBuilder()
        .setTitle(`⚡ Farm Upgrade to Level ${userProfile.farm.level + 1}`)
        .setDescription(`**Current Level:** ${userProfile.farm.level}\n**Next Level:** ${userProfile.farm.level + 1}\n**Cost:** **${nextLevelData.price}** 🪙\n\n**Benefits:**\n• +${nextLevelData.available_crop_slots - userProfile.farm.available_crop_slots} Crop Slots\n• +${nextLevelData.available_animal_slots - userProfile.farm.available_animal_slots} Animal Slots\n• +${nextLevelData.storage_limit - userProfile.farm.storage_limit} Storage Space\n\nAre you sure you want to upgrade?`)
        .setTimestamp()
        .setColor("#FFD700")
        .setThumbnail("https://i.imgur.com/KNAbCUO.png")
        .setFooter({ text: `Current Gold: ${userProfile.gold} 🪙` });

    const confirmBtn = new ButtonBuilder().setCustomId("confirm").setLabel("Confirm").setStyle(ButtonStyle.Success);
    const cancelBtn = new ButtonBuilder().setCustomId("cancel").setLabel("Cancel").setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(confirmBtn, cancelBtn);

    const response = await interaction.reply({ embeds: [confirmationEmbed], components: [row], withResponse: true });

    let timeout = 60 * 1000;
    const collector = response?.resource?.message?.createMessageComponentCollector({ filter: (m) => m.user.id === interaction.user.id, componentType: ComponentType.Button, time: timeout });

    collector?.on("collect", async (col) => {
        await col.deferUpdate();

        try {
            // Hydrate the cached profile into a Mongoose document
            const dbProfile = schema.hydrate(userProfile);
            if (!dbProfile) {
                userProfileCache.del(userId);
                return col.reply({ content: "An error occurred while processing your request.", ephemeral: true });
            }

            switch (col.customId) {
                case "confirm":
                    await database.makePayment(dbProfile, -nextLevelData.price);
                    await database.upgradeFarm(dbProfile, nextLevelData);
                    
                    // Update cache with latest data
                    const updatedProfile = (dbProfile as any).toObject();
                    userProfileCache.set(userId, updatedProfile);
                    
                    confirmationEmbed.setDescription("✨ Yeehaaa!, your farm is now at level " + nextLevelData.level)
                    break;
                case "cancel":
                    confirmationEmbed.setDescription("Upgrade cancelled.").setColor("Red")
                    break;
            }
        } catch (error) {
            logError(interaction.client, {
                path: "upgradefarm.ts",
                error
            })
            userProfileCache.del(userId);
            confirmationEmbed.setDescription("An error occurred during the upgrade.").setColor("Red")
        }

        row.components.forEach(component => component.data.disabled = true);
        await interaction.editReply({ embeds: [confirmationEmbed], components: [row] });
    });

    collector?.on("end", async () => {
        row.components.forEach(component => component.data.disabled = true);
        await interaction.editReply({ components: [row] });
    })
}