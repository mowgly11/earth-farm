import { CommandInteraction, SlashCommandBuilder, MessageFlags, EmbedBuilder } from "discord.js";
import { userProfileCache } from "../services/profile_service.ts";
import schema from "../database/schema.ts";
import { logError } from "../utils/error_logger.ts";
import { ERRORS, COLORS } from "../utils/constants.ts";
import { formatNumber, relativeTimestamp, beforeAfter, getRandomTip, formatDuration } from "../utils/ux.ts";
import { createDailyButtons } from "../utils/button_handler.ts";
import { createNoProfileEmbed } from "../utils/onboarding.ts";
import { getProfile } from "../services/index.ts";

export const data = new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Collect your daily gold reward!")

export async function execute(interaction: CommandInteraction) {
    let user = interaction.options.get("farmer")?.user;
    if (user?.bot) return await interaction.reply({ content: "You can't interact with bots!", flags: MessageFlags.Ephemeral });
    await interaction.deferReply();
    if (!user) user = interaction.user;

    // Get user profile (using ProfileService)
    const profileResult = await getProfile(user.id);
    if (!profileResult) return await interaction.editReply(createNoProfileEmbed(user.id));
    let userProfile = profileResult.profile;

    let timeLeft = userProfile.daily - Date.now();

    // Not ready yet - show wait embed
    if (timeLeft > 0) {
        const waitEmbed = new EmbedBuilder()
            .setTitle("⏰ Daily Reward Not Ready")
            .setColor(COLORS.WARNING)
            .setDescription(`You need to wait a bit longer before claiming your next reward!`)
            .addFields(
                { name: "⏳ Time Remaining", value: formatDuration(timeLeft), inline: true },
                { name: "📅 Available", value: relativeTimestamp(userProfile.daily), inline: true }
            )
            .setFooter({ text: getRandomTip() })
            .setTimestamp();

        return await interaction.editReply({ embeds: [waitEmbed] });
    }

    // Calculate reward (base + level bonus)
    const baseReward = Math.floor(Math.random() * (200 - 100 + 1)) + 100;
    const levelBonus = userProfile.level * 10;
    const reward = baseReward + levelBonus;
    const goldBefore = userProfile.gold;

    // Update cache immediately with deep clone to prevent race conditions
    const updatedProfile = JSON.parse(JSON.stringify(userProfile));
    updatedProfile.daily = Date.now() + 1000 * 60 * 60 * 24; // 24h
    updatedProfile.gold += reward;

    // Update cache
    userProfileCache.set(user.id, updatedProfile);

    // Hydrate the cached profile into a Mongoose document
    const dbProfile = schema.hydrate(updatedProfile);
    if (!dbProfile) {
        userProfileCache.del(user.id);
        return await interaction.editReply({ content: ERRORS.GENERIC });
    }

    try {
        dbProfile.markModified("daily");
        dbProfile.markModified("gold");
        await dbProfile.save();
    } catch (error) {
        logError(interaction.client, {
            path: 'daily.ts',
            error
        });
        userProfileCache.del(user.id);
        return await interaction.editReply({ content: ERRORS.GENERIC });
    }

    // Create rich reward embed
    const successEmbed = new EmbedBuilder()
        .setTitle("🎁 Daily Reward Claimed!")
        .setColor(COLORS.SUCCESS)
        .setDescription(`**${userProfile.username}** collected their daily reward!`)
        .addFields(
            {
                name: "💰 Reward Breakdown",
                value: `Base: **${formatNumber(baseReward)}** 🪙\nLevel Bonus: **+${formatNumber(levelBonus)}** 🪙\n─────────────\nTotal: **${formatNumber(reward)}** 🪙`,
                inline: true
            },
            {
                name: "📊 Gold Balance",
                value: beforeAfter(goldBefore, updatedProfile.gold, '🪙'),
                inline: true
            }
        )
        .addFields(
            {
                name: "⏰ Next Reward",
                value: relativeTimestamp(updatedProfile.daily),
                inline: true
            },
            {
                name: "⭐ Current Level",
                value: `Level **${userProfile.level}**`,
                inline: true
            }
        )
        .setThumbnail(user.displayAvatarURL({ size: 128 }))
        .setFooter({ text: getRandomTip() })
        .setTimestamp();

    // Add follow-up action buttons
    const actionButtons = createDailyButtons(user.id);

    return await interaction.editReply({ embeds: [successEmbed], components: [actionButtons] });
}