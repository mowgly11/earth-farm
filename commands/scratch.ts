import { CommandInteraction, SlashCommandBuilder, MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder, EmbedBuilder } from "discord.js";
import database from "../database/methods.js";
import { userProfileCache } from "../services/profile_service.ts";
import schema from "../database/schema.ts";
import { logError } from "../utils/error_logger.ts";
import { join } from "path";
import { ERRORS, COLORS } from "../utils/constants.ts";
import { createNoProfileEmbed } from "../utils/onboarding.ts";
import { formatNumber, relativeTimestamp, beforeAfter, getRandomTip, formatDuration } from "../utils/ux.ts";
import { createScratchButtons } from "../utils/button_handler.ts";
import { SCRATCH_BUTTONS } from "../utils/buttons.ts";
import { getProfile, updateCache } from "../services/index.ts";

// Lazy-loaded AttachmentBuilder cache
let scratchImages: { before: AttachmentBuilder; gold: AttachmentBuilder; xp: AttachmentBuilder } | null = null;
function getScratchImages() {
    if (!scratchImages) {
        scratchImages = {
            before: new AttachmentBuilder(join(__dirname, '../assets', 'cards', 'scratching_card.png')),
            gold: new AttachmentBuilder(join(__dirname, '../assets', 'cards', 'scratching_card_gold.png')),
            xp: new AttachmentBuilder(join(__dirname, '../assets', 'cards', 'scratching_card_xp.png'))
        };
    }
    return scratchImages;
}

export const data = new SlashCommandBuilder()
    .setName("scratch")
    .setDescription("Scratch a card every 8 hours to earn gold or XP!")

export async function execute(interaction: CommandInteraction) {
    let user = interaction.options.get("farmer")?.user;
    if (user?.bot) return await interaction.reply({ content: "You can't interact with bots!", flags: MessageFlags.Ephemeral });

    let response = await interaction.deferReply({ withResponse: true });

    if (!user) user = interaction.user;

    // Get user profile (using ProfileService)
    const profileResult = await getProfile(user.id);
    if (!profileResult) return await interaction.editReply(createNoProfileEmbed(user.id));
    let userProfile = profileResult.profile;

    let timeLeft = userProfile.scratch - Date.now();

    // Not ready yet - show wait embed
    if (timeLeft > 0) {
        const waitEmbed = new EmbedBuilder()
            .setTitle("🎰 Scratch Card Not Ready")
            .setColor(COLORS.WARNING)
            .setDescription("You need to wait before scratching another card!")
            .addFields(
                { name: "⏳ Time Remaining", value: formatDuration(timeLeft), inline: true },
                { name: "📅 Available", value: relativeTimestamp(userProfile.scratch), inline: true }
            )
            .setFooter({ text: getRandomTip() })
            .setTimestamp();

        return await interaction.editReply({ embeds: [waitEmbed] });
    }

    // Generate rewards with better odds
    const goldReward = Math.floor(Math.random() * (150 - 50 + 1)) + 50;
    const xpReward = Math.floor(Math.random() * (25 - 5 + 1)) + 5;
    const isGold = Math.random() > 0.4; // 60% gold, 40% XP
    const reward = isGold ? `gold:${goldReward}` : `xp:${xpReward}`;

    // Create scratch button and initial embed
    let scratchBtn = SCRATCH_BUTTONS.scratch();

    let row = new ActionRowBuilder<ButtonBuilder>().addComponents(scratchBtn);

    const startEmbed = new EmbedBuilder()
        .setTitle("🎰 Scratch Card Ready!")
        .setColor(COLORS.PRIMARY)
        .setDescription("Click the button below to scratch your card and reveal your prize!")
        .addFields(
            { name: "🎁 Possible Rewards", value: "💰 **Gold** (50-150)\n⭐ **XP** (5-25)", inline: true },
            { name: "⏰ Cooldown", value: "8 hours", inline: true }
        )
        .setImage("attachment://scratching_card.png")
        .setFooter({ text: "You have 30 seconds to scratch!" });

    await interaction.editReply({
        embeds: [startEmbed],
        components: [row],
        files: [getScratchImages().before],
    });

    // Wait for user to click scratch button - wrapped in try/catch to prevent crash on timeout
    let collector;
    try {
        collector = await response.resource?.message?.awaitMessageComponent({
            filter: (i) => i.user.id === user.id,
            time: 30000, // 30 seconds
        });
    } catch (err) {
        // Timeout - awaitMessageComponent throws on timeout, handle gracefully
        scratchBtn.setDisabled(true).setLabel("⏰ Expired");
        row = new ActionRowBuilder<ButtonBuilder>().addComponents(scratchBtn);

        const expiredEmbed = new EmbedBuilder()
            .setTitle("⏰ Card Expired")
            .setColor(COLORS.ERROR)
            .setDescription("You didn't scratch in time! Use `/scratch` again when ready.")
            .setTimestamp();

        await interaction.editReply({ embeds: [expiredEmbed], components: [row], files: [] });
        return;
    }

    if (!collector || collector.customId !== "scratch") {
        // Invalid interaction
        return;
    }

    await collector.deferUpdate();

    // Parse reward
    let won = reward.split(":");
    const rewardType = won[0];
    const rewardAmount = parseInt(won[1]);

    // Store before values
    const goldBefore = userProfile.gold;
    const xpBefore = userProfile.xp;

    // Update cache immediately with deep clone to prevent race conditions
    const updatedProfile = JSON.parse(JSON.stringify(userProfile));
    updatedProfile.scratch = Date.now() + 1000 * 60 * 60 * 8; // 8h

    if (rewardType === "gold") {
        updatedProfile.gold += rewardAmount;
    } else {
        updatedProfile.xp += rewardAmount;
    }

    // Update cache
    userProfileCache.set(user.id, updatedProfile);

    // Hydrate the cached profile into a Mongoose document
    const dbProfile = schema.hydrate(updatedProfile);
    if (!dbProfile) {
        userProfileCache.del(user.id);
        return await interaction.editReply({ content: ERRORS.GENERIC });
    }

    try {
        dbProfile.markModified("scratch");
        dbProfile.markModified("gold");
        dbProfile.markModified("xp");
        await dbProfile.save();
    } catch (error) {
        logError(interaction.client, {
            path: 'scratch.ts',
            error
        });
        userProfileCache.del(user.id);
        return await interaction.editReply({ content: ERRORS.GENERIC });
    }

    // Disable button and change to celebration
    scratchBtn.setDisabled(true).setLabel("🎉 Revealed!").setStyle(ButtonStyle.Secondary);
    row = new ActionRowBuilder<ButtonBuilder>().addComponents(scratchBtn);

    // Show scratching animation
    const scratchingEmbed = new EmbedBuilder()
        .setTitle("✨ Scratching...")
        .setColor(COLORS.PRIMARY)
        .setDescription("Revealing your prize...")
        .setTimestamp();

    await interaction.editReply({ embeds: [scratchingEmbed], components: [], files: [] });

    // Wait a moment for suspense
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Create result embed
    const images = getScratchImages();
    const image = rewardType === "gold" ? images.gold : images.xp;
    const rewardEmoji = rewardType === "gold" ? "💰" : "⭐";
    const rewardName = rewardType === "gold" ? "Gold" : "XP";

    const resultEmbed = new EmbedBuilder()
        .setTitle("🎉 Scratch Card Revealed!")
        .setColor(COLORS.SUCCESS)
        .setDescription(`**${userProfile.username}** scratched and won!`)
        .addFields(
            {
                name: `${rewardEmoji} Prize`,
                value: `**+${formatNumber(rewardAmount)}** ${rewardName}`,
                inline: true
            },
            {
                name: "📊 Balance",
                value: rewardType === "gold"
                    ? beforeAfter(goldBefore, updatedProfile.gold, '💰')
                    : beforeAfter(xpBefore, updatedProfile.xp, '⭐'),
                inline: true
            }
        )
        .addFields(
            {
                name: "⏰ Next Scratch",
                value: relativeTimestamp(updatedProfile.scratch),
                inline: true
            }
        )
        .setImage(`attachment://scratching_card_${rewardType}.png`)
        .setThumbnail(user.displayAvatarURL({ size: 128 }))
        .setFooter({ text: getRandomTip() })
        .setTimestamp();

    // Add follow-up action buttons
    const actionButtons = createScratchButtons(user.id);

    await interaction.editReply({
        embeds: [resultEmbed],
        files: [image],
        components: [row, actionButtons],
    });
}