import { CommandInteraction, SlashCommandBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ActionRowBuilder, ComponentType, MessageFlags } from "discord.js";
import database from "../database/methods.ts";
import farmLevels from "../config/upgrades/farms.json";
import { userProfileCache } from "../services/profile_service.ts";
import schema from "../database/schema.ts";
import { logError } from "../utils/error_logger.ts";
import { COLORS } from "../utils/constants.ts";
import { CONFIRM_BUTTONS, BUTTONS } from "../utils/buttons.ts";
import { getProfile, updateCache } from "../services/index.ts";

export const data = new SlashCommandBuilder()
    .setName("upgradefarm")
    .setDescription("Upgrade your farm to the next level and gain its benefits.")

export async function execute(interaction: CommandInteraction) {
    await interaction.deferReply();

    const userId = interaction.user.id;

    // Get user profile (using ProfileService)
    const profileResult = await getProfile(userId);
    if (!profileResult) return await interaction.editReply({ content: "Please make a profile using `/farmer` before trying to upgrade your farm." });
    let userProfile = profileResult.profile;
    const dbProfile = profileResult.dbProfile;

    const nextLevelData = farmLevels.find(v => v.level === userProfile.farm.level + 1);
    if (!nextLevelData) return await interaction.editReply({ content: "You are at the max level!" });
    if (userProfile.gold < nextLevelData.price) return await interaction.editReply({ content: `You do not have enough gold to upgrade. The next farm level costs **${nextLevelData.price}** 🪙` });

    const confirmationEmbed = new EmbedBuilder()
        .setTitle(`⚡ Farm Upgrade to Level ${userProfile.farm.level + 1}`)
        .setDescription(`**Current Level:** ${userProfile.farm.level}\n**Next Level:** ${userProfile.farm.level + 1}\n**Cost:** **${nextLevelData.price}** 🪙\n\n**Benefits:**\n• +${nextLevelData.available_crop_slots - userProfile.farm.available_crop_slots} Crop Slots\n• +${nextLevelData.available_animal_slots - userProfile.farm.available_animal_slots} Animal Slots\n• +${nextLevelData.storage_limit - userProfile.farm.storage_limit} Storage Space\n\nAre you sure you want to upgrade?`)
        .setTimestamp()
        .setColor(COLORS.PRIMARY)
        .setThumbnail("https://i.imgur.com/KNAbCUO.png")
        .setFooter({ text: `Current Gold: ${userProfile.gold} 🪙` });

    const confirmBtn = CONFIRM_BUTTONS.confirm();
    const cancelBtn = CONFIRM_BUTTONS.cancel();

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(confirmBtn, cancelBtn, BUTTONS.dashboard());

    const response = await interaction.editReply({ embeds: [confirmationEmbed], components: [row] });

    let timeout = 60 * 1000;
    const collector = response.createMessageComponentCollector({ filter: (m) => m.user.id === interaction.user.id, componentType: ComponentType.Button, time: timeout });

    collector?.on("collect", async (col) => {
        await col.deferUpdate();

        try {
            // dbProfile already hydrated by ProfileService

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
                    confirmationEmbed.setDescription("Upgrade cancelled.").setColor(COLORS.ERROR)
                    break;
            }
        } catch (error) {
            logError(interaction.client, {
                path: "upgradefarm.ts",
                error
            })
            userProfileCache.del(userId);
            confirmationEmbed.setDescription("An error occurred during the upgrade.").setColor(COLORS.ERROR)
        }

        row.components.forEach(component => component.data.disabled = true);
        await interaction.editReply({ embeds: [confirmationEmbed], components: [row] });
    });

    collector?.on("end", async () => {
        row.components.forEach(component => component.data.disabled = true);
        await interaction.editReply({ components: [row] });
    })
}