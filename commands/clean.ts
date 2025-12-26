import { CommandInteraction, SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder } from "discord.js";
import database from "../database/methods.ts";
import actions from "../config/data/actions.json";
import { userProfileCache } from "../index.ts";
import schema from "../database/schema.ts";
import { logError } from "../utils/error_logger.ts";
import { ERRORS, COLORS } from "../utils/constants.ts";
import { createNoProfileEmbed } from "../utils/onboarding.ts";
import { BUTTONS } from "../utils/buttons.ts";
import { relativeTimestamp, createProgressBar } from "../utils/ux.ts";

export const data = new SlashCommandBuilder()
    .setName("clean")
    .setDescription("Clean an animal's area for a production boost!")
    .addIntegerOption(option =>
        option.setName("slot")
            .setDescription("The animal slot number to clean")
            .setRequired(true)
            .setMinValue(1));

export async function execute(interaction: CommandInteraction) {
    await interaction.deferReply();

    const userId = interaction.user.id;

      let userProfile: any = userProfileCache.get(userId);

      if (!userProfile) {
        const dbProfile = await database.findUser(userId);
        if (!dbProfile) return await interaction.editReply(createNoProfileEmbed(interaction.user.id));

        userProfile = (dbProfile as any).toObject();
        userProfileCache.set(userId, userProfile);
    }

    const slotNumber = interaction.options.get("slot")?.value as number;

    // No animals
    if (!userProfile.farm.occupied_animal_slots.length) {
        const embed = new EmbedBuilder()
            .setTitle("❌ No Animals")
            .setColor(COLORS.ERROR)
            .setDescription("You don't have any animals to clean!");

        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            BUTTONS.marketBuy(),
            BUTTONS.dashboard()
        );

        return await interaction.editReply({ embeds: [embed], components: [buttons] });
    }

    // Invalid slot
    if (slotNumber > userProfile.farm.occupied_animal_slots.length) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Invalid Slot")
            .setColor(COLORS.ERROR)
            .setDescription(`Slot **${slotNumber}** doesn't exist!`)
            .addFields(
                { name: "🐔 Animals", value: `${userProfile.farm.occupied_animal_slots.length} raised`, inline: true }
            );

        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            BUTTONS.viewBarn()
        );

        return await interaction.editReply({ embeds: [embed], components: [buttons] });
    }

    const now = Date.now();
    const lastCleaned = userProfile.actions?.lastCleaned || 0;
    const cooldown = actions.actions.cleaning.cooldown;

    // Cooldown check
    if (lastCleaned + cooldown > now) {
        const nextAvailable = lastCleaned + cooldown;
        const embed = new EmbedBuilder()
            .setTitle("⏰ Cooldown Active")
            .setColor(COLORS.WARNING)
            .setDescription(`You already cleaned recently!`)
            .addFields(
                { name: "🕐 Try Again", value: relativeTimestamp(nextAvailable), inline: true }
            );

        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            BUTTONS.feedInstead(),
            BUTTONS.petInstead(),
            BUTTONS.dashboard()
        );

        return await interaction.editReply({ embeds: [embed], components: [buttons] });
    }

    const boost = actions.actions.cleaning.boost;
    const animalSlot = userProfile.farm.occupied_animal_slots[slotNumber - 1];
    const timeLeft = animalSlot.ready_at - now;

    // Already ready
    if (timeLeft <= 0) {
        const embed = new EmbedBuilder()
            .setTitle("✅ Already Ready!")
            .setColor(COLORS.SUCCESS)
            .setDescription(`The animal in slot **${slotNumber}** is ready to harvest!`);

        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            BUTTONS.harvestNow(),
            BUTTONS.dashboard()
        );

        return await interaction.editReply({ embeds: [embed], components: [buttons] });
    }

    // Update cache immediately with deep clone
    const updatedProfile = JSON.parse(JSON.stringify(userProfile));

    // Check if previous boost has expired
    if (animalSlot.boost_expires_at && now > animalSlot.boost_expires_at) {
        animalSlot.total_boost = 0;
    }

    // Update total boost and set expiration
    if (!animalSlot.total_boost) animalSlot.total_boost = 0;
    const previousBoost = animalSlot.total_boost;
    animalSlot.total_boost += boost;
    animalSlot.boost_expires_at = now + (2 * 60 * 60 * 1000); // 2 hours

    // Apply boost to production time
    const originalTime = timeLeft;
    const boostDecimal = boost * Math.pow(10, -2);
    const reduction = originalTime * boostDecimal;
    animalSlot.ready_at = Math.floor(now + (originalTime - reduction));

    if (!updatedProfile.actions) updatedProfile.actions = {};
    updatedProfile.actions.lastCleaned = now;

    // Update cache
    userProfileCache.set(userId, updatedProfile);

    // Hydrate the cached profile into a Mongoose document
    const dbProfile = schema.hydrate(updatedProfile);
    if (!dbProfile) {
        userProfileCache.del(userId);
        return await interaction.editReply({ content: ERRORS.GENERIC });
    }

    try {
        await database.saveNestedObject(dbProfile, "farm");
        await database.saveNestedObject(dbProfile, "actions");
    } catch (error) {
        logError(interaction.client, {
            path: "clean.ts",
            error
        });
        userProfileCache.del(userId);
        return await interaction.editReply({ content: ERRORS.GENERIC });
    }

    // Success embed
    const newTimeLeft = animalSlot.ready_at - now;
    const boostBar = createProgressBar(animalSlot.total_boost, 100, 10);

    const embed = new EmbedBuilder()
        .setTitle("🧹 Area Cleaned!")
        .setColor(COLORS.SUCCESS)
        .setDescription(`Successfully cleaned area for **${animalSlot.name}** in slot **${slotNumber}**!`)
        .addFields(
            { name: "⚡ Boost Applied", value: `+${boost}%`, inline: true },
            { name: "📊 Total Boost", value: `${animalSlot.total_boost}%`, inline: true },
            { name: "⏱️ Time Saved", value: `${Math.round(reduction / 1000 / 60)}m`, inline: true }
        )
        .addFields(
            { name: "🔋 Boost Bar", value: boostBar, inline: false },
            { name: "🕐 Ready", value: relativeTimestamp(animalSlot.ready_at), inline: true }
        )
        .setFooter({ text: "Boosts stack! Feed and pet for more speed." })
        .setTimestamp();

    // Follow-up buttons
    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        BUTTONS.feed(),
        BUTTONS.pet(),
        BUTTONS.dashboard()
    );

    return await interaction.editReply({ embeds: [embed], components: [buttons] });
}
