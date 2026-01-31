/**
 * Dashboard Command
 * Main entry point for the interactive farm dashboard
 */

import { CommandInteraction, SlashCommandBuilder, EmbedBuilder, ComponentType, ButtonInteraction, ButtonBuilder, ActionRowBuilder, MessageFlags, AttachmentBuilder, StringSelectMenuBuilder, PermissionFlagsBits } from "discord.js";
import type { GuildTextBasedChannel } from "discord.js";
import { join } from "path";
import { userProfileCache } from "../services/profile_service.ts";
import { logError } from "../utils/error_logger.ts";
import { COLORS } from "../utils/constants.ts";
import { relativeTimestamp } from "../utils/ux.ts";
import { parseButtonId, isButtonOwner } from "../utils/button_handler.ts";
import { BUTTONS } from "../utils/buttons.ts";
import { createNoProfileEmbed } from "../utils/onboarding.ts";
import { createFarmView } from "./farm.ts";
import { createBarnView } from "./barn.ts";
import { setCurrentView, pushCurrentView } from "../utils/nav_history.ts";
import { getProfile } from "../services/index.ts";
import { silentCatch } from "../utils/logger.ts";
import actions from "../config/data/actions.json";

// Import from dashboard submodules
import {
    createMainView,
    createActionButtons,
    createResultView,
    createProfileView,
    createMarketView,
    createStorageView,
    createUpgradeView,
    createNavView,
    createBackRow
} from "./dashboard/views.ts";

import {
    executeDailyAction,
    executeScratchAction,
    executeHarvestAction,
    executeSellAction
} from "./dashboard/actions.ts";

import { setupDashboardCollector } from "./dashboard/collector.ts";

// Re-export for external use
export { setupDashboardCollector } from "./dashboard/collector.ts";
export { createMainView, createActionButtons, createResultView, createBackRow } from "./dashboard/views.ts";
export { executeDailyAction, executeScratchAction, executeHarvestAction, executeSellAction } from "./dashboard/actions.ts";

/**
 * Required permissions for the bot to function properly
 */
const REQUIRED_PERMISSIONS = [
    { flag: PermissionFlagsBits.SendMessages, name: "Send Messages" },
    { flag: PermissionFlagsBits.EmbedLinks, name: "Embed Links" },
    { flag: PermissionFlagsBits.AttachFiles, name: "Attach Files" },
    { flag: PermissionFlagsBits.UseExternalEmojis, name: "Use External Emojis" },
    { flag: PermissionFlagsBits.ViewChannel, name: "View Channel" },
    { flag: PermissionFlagsBits.ReadMessageHistory, name: "Read Message History" }
];

/**
 * Get list of missing permissions for the bot in a channel
 */
function getMissingPermissions(interaction: ButtonInteraction): string[] {
    try {
        const channel = interaction.channel as GuildTextBasedChannel | null;
        const botMember = interaction.guild?.members.me;

        if (!channel || !botMember) {
            return ["Unable to check permissions"];
        }

        const permissions = channel.permissionsFor(botMember);
        if (!permissions) {
            return ["Unable to check permissions"];
        }

        return REQUIRED_PERMISSIONS
            .filter(p => !permissions.has(p.flag))
            .map(p => p.name);
    } catch {
        return ["Unable to check permissions"];
    }
}

export const data = new SlashCommandBuilder()
    .setName("dashboard")
    .setDescription("Open your interactive farm dashboard!")

export async function execute(interaction: CommandInteraction) {
    await interaction.deferReply();

    const userId = interaction.user.id;
    const username = interaction.user.username;
    const avatar = interaction.user.displayAvatarURL({ size: 128 });

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
    // This was previously 400+ lines of inline collector code that duplicated collector.ts
    setupDashboardCollector(response, userId, username, avatar, interaction.client);
}
