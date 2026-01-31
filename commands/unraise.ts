import { CommandInteraction, SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder } from "discord.js";
import marketItems from "../config/items/market_items.json";
import database from "../database/methods.ts";
import { userProfileCache } from "../services/profile_service.ts";
import schema from "../database/schema.ts";
import { logError } from "../utils/error_logger.ts";
import { getStorageCount, hasStorageCapacity } from "../utils/storage.ts";
import { ERRORS, COLORS } from "../utils/constants.ts";
import { createNoProfileEmbed } from "../utils/onboarding.ts";
import { BUTTONS } from "../utils/buttons.ts";
import { storageIndicator } from "../utils/ux.ts";
import { getProfile, updateCache } from "../services/index.ts";

export const data = new SlashCommandBuilder()
    .setName("unraise")
    .setDescription("Return an animal from barn back to storage!")
    .addIntegerOption(option =>
        option
            .setName("slot")
            .setDescription("The animal's slot number (1-20)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(20)
    )

export async function execute(interaction: CommandInteraction) {
    await interaction.deferReply();

    const slot: number = Number(interaction.options.get("slot")?.value);
    const userId = interaction.user.id;

    // Get user profile (using ProfileService)
    const profileResult = await getProfile(userId);
    if (!profileResult) return await interaction.editReply(createNoProfileEmbed(interaction.user.id));
    let userProfile = profileResult.profile;
    const dbProfile = profileResult.dbProfile;

    // Check if slot exists and has an animal
    if (!userProfile.farm.occupied_animal_slots[slot - 1]) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Empty Slot")
            .setColor(COLORS.ERROR)
            .setDescription(`There is no animal in slot **${slot}**.`)
            .addFields(
                { name: "🐔 Animals Raised", value: `${userProfile.farm.occupied_animal_slots.length}`, inline: true }
            );

        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            BUTTONS.viewBarn(),
            BUTTONS.raise()
        );

        return await interaction.editReply({ embeds: [embed], components: [buttons] });
    }

    // Check storage capacity BEFORE removing animal
    const storageCount = getStorageCount(userProfile.storage);
    if (!hasStorageCapacity(userProfile.storage, userProfile.farm.storage_limit)) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Storage Full")
            .setColor(COLORS.ERROR)
            .setDescription("Your storage is full! Sell some items first.")
            .addFields(
                { name: "📦 Storage", value: storageIndicator(storageCount, userProfile.farm.storage_limit), inline: true }
            );

        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            BUTTONS.sellItems(),
            BUTTONS.dashboard()
        );

        return await interaction.editReply({ embeds: [embed], components: [buttons] });
    }

    // Get the animal info from database config
    const animalInSlot = userProfile.farm.occupied_animal_slots[slot - 1];
    const animalConfig = marketItems.find(v => v.name === animalInSlot.name);

    if (!animalConfig) {
        return await interaction.editReply({ content: "An error occurred: animal configuration not found." });
    }

    // dbProfile already hydrated by ProfileService

    try {
        // Remove animal from farm (returns the removed animal)
        const removedAnimal = await database.undeployAnimal(dbProfile, slot);

        if (!removedAnimal) {
            return await interaction.editReply({ content: "Failed to remove animal from farm." });
        }

        // Prepare animal for storage (clean up farm-specific properties)
        const animalForStorage: Record<string, any> = {
            name: animalConfig.name,
            gives: animalConfig.gives,
            level: animalConfig.level,
            buy_price: animalConfig.buy_price,
            sell_price: animalConfig.sell_price,
            ready_time: animalConfig.ready_time,
            food: animalConfig.food,
            type: animalConfig.type,
            lifetime: animalConfig.lifetime,
            amount: 1
        };

        // Add animal back to storage
        await database.addItemToStorage(dbProfile, animalForStorage, 1, "market_items");

        // Save farm changes
        await database.saveNestedObject(dbProfile, "farm");

        // Update cache with latest data
        const updatedProfile = (dbProfile as any).toObject();
        userProfileCache.set(userId, updatedProfile);

        // Success embed
        const embed = new EmbedBuilder()
            .setTitle("🔄 Animal Returned")
            .setColor(COLORS.SUCCESS)
            .setDescription(`Successfully returned **${animalConfig.name}** to your storage!`)
            .addFields(
                { name: "🐔 Barn Slots", value: `${updatedProfile.farm.occupied_animal_slots.length}/${updatedProfile.farm.available_animal_slots}`, inline: true },
                { name: "📦 Storage", value: storageIndicator(getStorageCount(updatedProfile.storage), updatedProfile.farm.storage_limit), inline: true }
            )
            .setFooter({ text: "You can raise this animal again anytime!" })
            .setTimestamp();

        // Follow-up buttons
        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            BUTTONS.viewBarn(),
            BUTTONS.raiseAnother(),
            BUTTONS.dashboard()
        );

        return await interaction.editReply({ embeds: [embed], components: [buttons] });

    } catch (error) {
        logError(interaction.client, {
            path: 'unraise.ts',
            error
        });
        userProfileCache.del(userId);
        return await interaction.editReply({ content: ERRORS.GENERIC });
    }
}