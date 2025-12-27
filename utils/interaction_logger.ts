import { Client, TextChannel, EmbedBuilder } from "discord.js";
import { logger } from "./logger.ts";

const INTERACTION_CHANNEL_ID = process.env.INTERACTION_LOG_CHANNEL_ID;

interface ButtonInteractionData {
    type: "button";
    customId: string;
    userId: string;
    username: string;
    guildName?: string;
    guildId?: string;
}

interface SelectInteractionData {
    type: "select";
    customId: string;
    selectedValue: string;
    userId: string;
    username: string;
    guildName?: string;
    guildId?: string;
}

type InteractionData = ButtonInteractionData | SelectInteractionData;

/**
 * Log button/select interactions to a Discord channel
 */
export async function logInteraction(client: Client, data: InteractionData) {
    // Skip if no channel configured
    if (!INTERACTION_CHANNEL_ID) return;

    try {
        const channel = await client.channels.fetch(INTERACTION_CHANNEL_ID) as TextChannel;
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTimestamp();

        if (data.type === "button") {
            // Parse button ID for better display
            const parts = data.customId.split(":");
            const action = parts[0] || "unknown";
            const subaction = parts[1] || "";

            embed
                .setTitle("🔘 Button Click")
                .setColor("#3498DB")
                .setDescription(
                    `**User:** ${data.username} (${data.userId})\n` +
                    `**Action:** ${action}${subaction ? ` → ${subaction}` : ""}\n` +
                    `**Full ID:** \`${data.customId}\`\n` +
                    `**Guild:** ${data.guildName || "DM"}`
                );
        } else if (data.type === "select") {
            embed
                .setTitle("📋 Select Menu")
                .setColor("#9B59B6")
                .setDescription(
                    `**User:** ${data.username} (${data.userId})\n` +
                    `**Menu:** \`${data.customId}\`\n` +
                    `**Selected:** ${data.selectedValue}\n` +
                    `**Guild:** ${data.guildName || "DM"}`
                );
        }

        await channel.send({ embeds: [embed] });
    } catch (error) {
        logger.error("Failed to log interaction to Discord", error);
    }
}

/**
 * Quick button log (used in handlers)
 */
export async function logButtonClick(
    client: Client,
    customId: string,
    userId: string,
    username: string,
    guildName?: string,
    guildId?: string
) {
    await logInteraction(client, {
        type: "button",
        customId,
        userId,
        username,
        guildName,
        guildId
    });
}

/**
 * Quick select menu log (used in handlers)
 */
export async function logSelectMenu(
    client: Client,
    customId: string,
    selectedValue: string,
    userId: string,
    username: string,
    guildName?: string,
    guildId?: string
) {
    await logInteraction(client, {
        type: "select",
        customId,
        selectedValue,
        userId,
        username,
        guildName,
        guildId
    });
}
