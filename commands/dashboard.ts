/**
 * Dashboard Command
 * Main entry point for the interactive farm dashboard
 */

import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import { logError } from "../utils/error_logger.ts";
import { ERRORS } from "../utils/constants.ts";
import { createNoProfileEmbed } from "../utils/onboarding.ts";
import { setCurrentView } from "../utils/nav_history.ts";
import { getProfile } from "../services/index.ts";
import { silentCatch } from "../utils/logger.ts";
import { createMainView } from "./dashboard/views.ts";
import { setupDashboardCollector } from "./dashboard/collector.ts";

// Re-export for external use
export { setupDashboardCollector } from "./dashboard/collector.ts";
export { createMainView, createActionButtons, createResultView, createBackRow } from "./dashboard/views.ts";
export { executeDailyAction, executeScratchAction, executeHarvestAction, executeSellAction } from "./dashboard/actions.ts";

export const data = new SlashCommandBuilder()
    .setName("dashboard")
    .setDescription("Open your interactive farm dashboard!")

export async function execute(interaction: CommandInteraction) {
    await interaction.deferReply();

    const userId = interaction.user.id;
    const username = interaction.user.username;
    const avatar = interaction.user.displayAvatarURL({ size: 128 });

    try {
        // Get user profile (using ProfileService)
        const profileResult = await getProfile(userId);
        if (!profileResult) {
            const welcome = createNoProfileEmbed(userId);
            return await interaction.editReply(welcome);
        }
        const userProfile = profileResult.profile;

        // Show main dashboard view
        const { embed, components } = createMainView(userProfile, username, avatar, userId);
        const response = await interaction.editReply({ embeds: [embed], components });

        // Track that user is now on dashboard view
        if (response.id) setCurrentView(userId, response.id, 'dashboard');

        // Use the shared collector from collector.ts (prevents duplicate handlers)
        setupDashboardCollector(response, userId, username, avatar, interaction.client);
    } catch (error) {
        logError(interaction.client, {
            path: 'dashboard.ts',
            error
        });
        await interaction.editReply({ content: ERRORS.GENERIC }).catch(silentCatch('dashboard:execute:errorReply'));
    }
}
