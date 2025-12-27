/**
 * Onboarding utilities for new users
 * Provides rich embeds and helpers for guiding new players
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder } from "discord.js";
import { COLORS } from "./constants.ts";
import { BUTTONS } from "./buttons.ts";

/**
 * Create a rich "No Profile" embed that encourages users to create their farm
 * Used when a user tries any command without a profile
 */
export function createNoProfileEmbed(userId: string) {
    const embed = new EmbedBuilder()
        .setTitle("🌾 Welcome to Earth Farm!")
        .setColor(COLORS.PRIMARY)
        .setDescription(
            "Looks like you're new here! Create your farm to start your farming adventure.\n\n" +
            "**🎮 How to Play:**\n" +
            "Plant seeds → Wait → Harvest → Sell for gold!"
        )
        .addFields(
            {
                name: "✨ Starter Bonus",
                value: "• **200 Gold** to start\n• **3x Wheat Seeds** FREE\n• **3 Crop Slots**\n• **2 Animal Slots**",
                inline: true
            },
            {
                name: "📈 Your Goals",
                value: "• Grow crops & raise animals\n• Earn gold & XP\n• Upgrade your farm\n• Climb the leaderboard!",
                inline: true
            }
        )
        .setFooter({ text: "Click below to start your journey!" })
        .setTimestamp();

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        BUTTONS.createFarm(userId),
        BUTTONS.learnMore()
    );

    return { embeds: [embed], components: [buttons] };
}

/**
 * Create the welcome message shown after profile creation
 * Includes guided first steps
 */
export function createWelcomeEmbed(username: string, userId: string) {
    const embed = new EmbedBuilder()
        .setTitle("🎉 Welcome to Earth Farm!")
        .setColor(COLORS.SUCCESS)
        .setDescription(
            `Hey there, **${username}**! Your farm has been created!\n\n` +
            "**You received:**\n" +
            "✅ **200 Gold** added to your wallet\n" +
            "✅ **3x Wheat Seeds** in your storage\n\n" +
            "**🚀 Let's get started!**"
        )
        .addFields(
            {
                name: "Step 1️⃣",
                value: "**Claim your daily reward** for bonus gold!",
                inline: true
            },
            {
                name: "Step 2️⃣",
                value: "**Plant your free seeds** to start growing!",
                inline: true
            },
            {
                name: "Step 3️⃣",
                value: "**Wait 2 min** then harvest your crops!",
                inline: true
            }
        )
        .setFooter({ text: "💡 Tip: Use /dashboard for quick access to all actions!" })
        .setTimestamp();

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        BUTTONS.claimDaily(),
        BUTTONS.plant(),
        BUTTONS.dashboard()
    );

    return { embeds: [embed], components: [buttons] };
}

/**
 * Starter bonus configuration
 */
export const STARTER_BONUS = {
    gold: 200,
    seeds: [
        { name: "Wheat Seeds", amount: 3 }
    ]
};
