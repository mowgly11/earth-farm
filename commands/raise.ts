import { CommandInteraction, SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder } from "discord.js";
import marketItems from "../config/items/market_items.json";
import database from "../database/methods.ts";
import { userProfileCache } from "../services/profile_service.ts";
import schema from "../database/schema.ts";
import { logError } from "../utils/error_logger.ts";
import { ERRORS, COLORS } from "../utils/constants.ts";
import { createNoProfileEmbed } from "../utils/onboarding.ts";
import { BUTTONS } from "../utils/buttons.ts";
import { relativeTimestamp } from "../utils/ux.ts";
import { getProfile, updateCache } from "../services/index.ts";

let choices: Array<ChoicesArray> = [];
marketItems.map(option => {
    if (option.type === "animals") choices.push({
        name: option.name,
        value: option.name
    });
});

export const data = new SlashCommandBuilder()
    .setName("raise")
    .setDescription("Raise an animal to start producing!")
    .addStringOption(option =>
        option
            .setName("animal")
            .setDescription("The animal you want to raise")
            .setRequired(true)
            .addChoices(...choices)
    )

export async function execute(interaction: CommandInteraction) {
    await interaction.deferReply();

    const animal: string = String(interaction.options.get("animal")?.value)?.trim();
    const userId = interaction.user.id;

    // Get user profile (using ProfileService)
    const profileResult = await getProfile(userId);
    if (!profileResult) return await interaction.editReply(createNoProfileEmbed(interaction.user.id));
    let userProfile = profileResult.profile;
    const dbProfile = profileResult.dbProfile;

    // Check if user has the animal
    const animalInStorage = userProfile.storage.market_items.find((v: any) => v?.name === animal);
    if (!animalInStorage) {
        const embed = new EmbedBuilder()
            .setTitle("❌ No Animal in Storage")
            .setColor(COLORS.ERROR)
            .setDescription(`You don't have any **${animal}** in storage.`);

        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            BUTTONS.marketBuy(),
            BUTTONS.dashboard()
        );

        return await interaction.editReply({ embeds: [embed], components: [buttons] });
    }

    // Check available slots
    if (userProfile.farm.occupied_animal_slots.length >= userProfile.farm.available_animal_slots) {
        const embed = new EmbedBuilder()
            .setTitle("❌ No Animal Slots")
            .setColor(COLORS.ERROR)
            .setDescription(`All **${userProfile.farm.available_animal_slots}** animal slots are occupied.`)
            .addFields(
                { name: "🐔 Occupied", value: `${userProfile.farm.occupied_animal_slots.length}`, inline: true },
                { name: "📊 Total", value: `${userProfile.farm.available_animal_slots}`, inline: true }
            );

        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            BUTTONS.unraise(),
            BUTTONS.upgradeFarm().setStyle(3) // SUCCESS
        );

        return await interaction.editReply({ embeds: [embed], components: [buttons] });
    }

    const jsonitem = userProfile.storage.market_items.find((v: any) => v.name === animal)!;
    const animalInfo = marketItems.find(m => m.name === animal);

    // dbProfile already hydrated by ProfileService

    try {
        await database.removeItemFromstorage(dbProfile, animal, 1, "market_items");
        await database.deployAnimal(dbProfile, { ...jsonitem });
        await database.saveNestedObject(dbProfile, "farm");

        // Update cache with latest data
        const updatedProfile = (dbProfile as any).toObject();
        userProfileCache.set(userId, updatedProfile);

        // Calculate ready time
        const readyAt = Date.now() + (jsonitem.ready_time || 0);
        const readyMins = Math.round((jsonitem.ready_time || 0) / 1000 / 60);

        // Success embed
        const embed = new EmbedBuilder()
            .setTitle("🐔 Animal Raised!")
            .setColor(COLORS.SUCCESS)
            .setDescription(`Successfully raised **${animal}** in your barn!`)
            .addFields(
                { name: "⏱️ Produces Every", value: `${readyMins} minutes`, inline: true },
                { name: "🕐 First Product", value: relativeTimestamp(readyAt), inline: true },
                { name: "🎁 Produces", value: animalInfo?.gives || "Products", inline: true }
            )
            .addFields(
                { name: "🐔 Barn Slots", value: `${updatedProfile.farm.occupied_animal_slots.length}/${updatedProfile.farm.available_animal_slots}`, inline: true },
                { name: "📦 Remaining", value: `${(animalInStorage.amount || 1) - 1}x in storage`, inline: true }
            )
            .setFooter({ text: "Feed, pet, and clean your animals for bonus production!" })
            .setTimestamp();

        // Follow-up buttons
        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            BUTTONS.viewBarn(),
            BUTTONS.feed(),
            BUTTONS.dashboard()
        );

        return await interaction.editReply({ embeds: [embed], components: [buttons] });

    } catch (error) {
        logError(interaction.client, {
            path: 'raise.ts',
            error
        });
        userProfileCache.del(userId);
        return await interaction.editReply({ content: ERRORS.GENERIC });
    }
}

type ChoicesArray = {
    name: string;
    value: string;
}