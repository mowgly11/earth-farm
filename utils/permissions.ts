/**
 * Permission Utilities
 * Shared utilities for checking and reporting bot permissions
 */

import { ButtonInteraction, CommandInteraction, PermissionFlagsBits, MessageFlags } from "discord.js";
import type { GuildTextBasedChannel } from "discord.js";

/**
 * Required permissions for the bot to function properly
 */
export const REQUIRED_PERMISSIONS = [
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
export function getMissingPermissions(interaction: ButtonInteraction | CommandInteraction): string[] {
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

/**
 * Check if an error is a Missing Access error (Discord code 50001)
 */
export function isMissingAccessError(error: any): boolean {
    return error?.code === 50001 || error?.message?.includes('Missing Access');
}

/**
 * Build a user-friendly message listing missing permissions
 */
export function buildMissingPermissionsMessage(interaction: ButtonInteraction | CommandInteraction): string {
    const missingPerms = getMissingPermissions(interaction);
    const permsList = missingPerms.length > 0
        ? missingPerms.map(p => `• ${p}`).join('\n')
        : "• Unable to determine specific permissions";

    return `⚠️ **Missing Permissions**\n\nI don't have the required permissions in this channel.\n\n**Missing permissions:**\n${permsList}\n\nPlease ask a server admin to fix my permissions!\n\n💡 Use \`/dashboard\` to return to your farm.`;
}

/**
 * Handle Missing Access error by sending ephemeral reply
 * Returns true if this was a Missing Access error that was handled
 */
export async function handleMissingAccessError(
    error: any,
    interaction: ButtonInteraction | CommandInteraction
): Promise<boolean> {
    if (!isMissingAccessError(error)) {
        return false;
    }

    const message = buildMissingPermissionsMessage(interaction);

    // Try multiple response methods since interaction state can vary
    // Priority: reply (if not acknowledged) > followUp (if replied) > editReply (if deferred with update)
    try {
        if (!interaction.replied && !interaction.deferred) {
            // Fresh interaction - use reply
            await interaction.reply({
                content: message,
                flags: MessageFlags.Ephemeral
            });
        } else if (interaction.replied) {
            // Already replied - use followUp
            await interaction.followUp({
                content: message,
                flags: MessageFlags.Ephemeral
            });
        } else {
            // Deferred (could be deferReply or deferUpdate)
            // Try followUp first, fall back to editReply
            try {
                await interaction.followUp({
                    content: message,
                    flags: MessageFlags.Ephemeral
                });
            } catch {
                // If followUp fails (e.g., after deferUpdate), just log silently
                // We can't send ephemeral message after deferUpdate
            }
        }
    } catch {
        // If all response methods fail, silently ignore
        // This is error handling code, we don't want to cause more errors
    }

    return true;
}
