import { CommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder } from "discord.js";
import database from "../database/methods.ts";
import actions from "../config/data/actions.json";
import { userProfileCache } from "../index.ts";
import schema from "../database/schema.ts";
import { logError } from "../utils/error_logger.ts";
import { ERRORS, COLORS } from "../utils/constants.ts";
import { createNoProfileEmbed } from "../utils/onboarding.ts";
import { formatDuration, createProgressBar, relativeTimestamp, getRandomTip } from "../utils/ux.ts";
import { BUTTONS } from "../utils/buttons.ts";
import { getProfile, updateCache } from "../services/index.ts";

export const data = new SlashCommandBuilder()
    .setName("feed")
    .setDescription("Feed your animal to boost production speed! 🍖")
    .addIntegerOption(option =>
        option.setName("slot")
            .setDescription("The animal slot number to feed")
            .setRequired(true)
            .setMinValue(1));

export async function execute(interaction: CommandInteraction) {
    await interaction.deferReply();

    const userId = interaction.user.id;

    // Get user profile (using ProfileService)
    const profileResult = await getProfile(userId);
    if (!profileResult) return await interaction.editReply(createNoProfileEmbed(interaction.user.id));
    let userProfile = profileResult.profile;
    const dbProfile = profileResult.dbProfile;

    const slotNumber = interaction.options.get("slot")?.value as number;

    // No animals error
    if (!userProfile.farm.occupied_animal_slots.length) {
        const noAnimalsEmbed = new EmbedBuilder()
            .setTitle("🐔 No Animals")
            .setColor(COLORS.WARNING)
            .setDescription("You don't have any animals to feed!")
            .addFields(
                { name: "💡 Tip", value: "Use `/buy` to purchase animals from the market, then `/raise` to deploy them!", inline: false }
            )
            .setFooter({ text: "Start your animal farm today!" })
            .setTimestamp();

        return await interaction.editReply({ embeds: [noAnimalsEmbed] });
    }

    // Invalid slot error
    if (slotNumber > userProfile.farm.occupied_animal_slots.length) {
        const invalidSlotEmbed = new EmbedBuilder()
            .setTitle("❌ Invalid Slot")
            .setColor(COLORS.ERROR)
            .setDescription(`Slot **${slotNumber}** doesn't exist!`)
            .addFields(
                { name: "📊 Your Animals", value: `You have **${userProfile.farm.occupied_animal_slots.length}** animal(s)`, inline: true },
                { name: "✅ Valid Slots", value: `1 to ${userProfile.farm.occupied_animal_slots.length}`, inline: true }
            )
            .setTimestamp();

        return await interaction.editReply({ embeds: [invalidSlotEmbed] });
    }

    const now = Date.now();
    const lastFed = userProfile.actions?.lastFed || 0;
    const cooldown = actions.actions.feeding.cooldown;

    // Cooldown check
    if (lastFed + cooldown > now) {
        const timeLeft = lastFed + cooldown - now;
        const cooldownEmbed = new EmbedBuilder()
            .setTitle("⏰ Feeding Cooldown")
            .setColor(COLORS.WARNING)
            .setDescription("You need to wait before feeding again!")
            .addFields(
                { name: "⏳ Time Remaining", value: formatDuration(timeLeft), inline: true },
                { name: "📅 Available", value: relativeTimestamp(lastFed + cooldown), inline: true }
            )
            .setFooter({ text: "Try /pet or /clean while waiting!" })
            .setTimestamp();

        return await interaction.editReply({ embeds: [cooldownEmbed] });
    }

    // Update cache immediately with deep clone
    const updatedProfile = JSON.parse(JSON.stringify(userProfile));

    // Apply boost to specific animal
    const boost = actions.actions.feeding.boost;
    const animalSlot = updatedProfile.farm.occupied_animal_slots[slotNumber - 1];
    const animalName = animalSlot.name || "Animal";
    const timeLeft = animalSlot.ready_at - now;

    // Already ready check
    if (timeLeft <= 0) {
        const readyEmbed = new EmbedBuilder()
            .setTitle("✅ Already Ready!")
            .setColor(COLORS.SUCCESS)
            .setDescription(`The **${animalName}** in slot **${slotNumber}** is ready to harvest!`)
            .addFields(
                { name: "🌾 Action", value: "Use `/harvest` to collect your products!", inline: false }
            )
            .setTimestamp();

        return await interaction.editReply({ embeds: [readyEmbed] });
    }

    // Reset boost if expired
    const boostBefore = animalSlot.total_boost || 0;
    if (animalSlot.boost_expires_at && now > animalSlot.boost_expires_at) {
        animalSlot.total_boost = 0;
    }

    // Update total boost and set expiration
    if (!animalSlot.total_boost) animalSlot.total_boost = 0;
    animalSlot.total_boost += boost;
    animalSlot.boost_expires_at = now + (2 * 60 * 60 * 1000); // 2 hours

    // Apply boost to production time
    const originalTime = timeLeft;
    const boostDecimal = boost * Math.pow(10, -2);
    const reduction = originalTime * boostDecimal;
    const timeBefore = animalSlot.ready_at;
    animalSlot.ready_at = Math.floor(now + (originalTime - reduction));

    // Update cooldown
    if (!updatedProfile.actions) updatedProfile.actions = {};
    updatedProfile.actions.lastFed = now;

    // Update cache
    userProfileCache.set(userId, updatedProfile);

    // dbProfile already hydrated by ProfileService

    try {
        await database.saveMultipleFields(dbProfile, "farm", "actions");
    } catch (error) {
        logError(interaction.client, {
            path: "feed.ts",
            error
        });
        userProfileCache.del(userId);
        return await interaction.editReply({ content: ERRORS.GENERIC });
    }

    // Create success embed with visual boost display
    const boostBar = createProgressBar(animalSlot.total_boost, 100, 10);
    const timeSaved = Math.round(reduction / 1000 / 60); // minutes saved

    const successEmbed = new EmbedBuilder()
        .setTitle("🍖 Animal Fed!")
        .setColor(COLORS.SUCCESS)
        .setDescription(`You fed the **${animalName}** in slot **${slotNumber}**!`)
        .addFields(
            {
                name: "⚡ Speed Boost Applied",
                value: `+**${boost}%** boost added\n${boostBar}`,
                inline: false
            },
            {
                name: "📊 Total Boost",
                value: `**${boostBefore}%** → **${animalSlot.total_boost}%**`,
                inline: true
            },
            {
                name: "⏰ Time Saved",
                value: `**${timeSaved}** minutes`,
                inline: true
            }
        )
        .addFields(
            {
                name: "🥚 Ready In",
                value: relativeTimestamp(animalSlot.ready_at),
                inline: true
            },
            {
                name: "⏱️ Boost Expires",
                value: relativeTimestamp(animalSlot.boost_expires_at),
                inline: true
            }
        )
        .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }))
        .setFooter({ text: getRandomTip() })
        .setTimestamp();

    // Navigation buttons
    const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        BUTTONS.barn().setLabel("Back to Barn"),
        BUTTONS.dashboard()
    );

    return await interaction.editReply({ embeds: [successEmbed], components: [navRow] });
}
