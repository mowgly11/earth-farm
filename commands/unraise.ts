import { CommandInteraction, SlashCommandBuilder, MessageFlags } from "discord.js";
import marketItems from "../config/items/market_items.json";
import database from "../database/methods.ts";
import { userProfileCache } from "../index.ts";
import schema from "../database/schema.ts";
import { logError } from "../utils/error_logger.ts";

let choices: Array<ChoicesArray> = [];
marketItems.map(option => {
    if (option.type === "animals") choices.push({
        name: option.name,
        value: option.name
    });
});

export const data = new SlashCommandBuilder()
    .setName("unraise")
    .setDescription("unraise an animal from the farm.")
    .addIntegerOption(option =>
        option
            .setName("slot")
            .setDescription("the animal's slot trying to unraise")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(20)
    )

export async function execute(interaction: CommandInteraction) {
    await interaction.deferReply();

    const slot: number = Number(interaction.options.get("slot")?.value);
    const userId = interaction.user.id;

    // Check cache first
    let userProfile: any = userProfileCache.get(userId);
    
    // If not in cache, get from database and cache it
    if (!userProfile) {
        const dbProfile = await database.findUser(userId);
        if (!dbProfile) return await interaction.editReply({ content: "Please make a profile using `/farmer` before trying to buy anything from the market." });
        
        // Cache the plain object
        userProfile = (dbProfile as any).toObject();
        userProfileCache.set(userId, userProfile);
    }

    if (userProfile.farm.occupied_animal_slots[slot-1] == null) 
        return await interaction.editReply({ content: `there are no animals in ${slot} slot.` });

    const findItemInDatabase = marketItems.find(v => v.name === userProfile.farm.occupied_animal_slots[slot-1].name)!;

    // Hydrate the cached profile into a Mongoose document
    const dbProfile = schema.hydrate(userProfile);
    if (!dbProfile) {
        userProfileCache.del(userId);
        return await interaction.editReply({ content: "An error occurred while processing your request." });
    }

    try {
        await database.undeployAnimal(dbProfile, slot);
        await database.saveNestedObject(dbProfile, "storage");

        // Update cache with latest data
        const updatedProfile = (dbProfile as any).toObject();
        userProfileCache.set(userId, updatedProfile);

        return await interaction.editReply({ content: `successfully removed **${findItemInDatabase.name}** from the farm.` });
    } catch (error) {
        logError(interaction.client, {
            path: 'unraise.ts',
            error
        })
        userProfileCache.del(userId);
        return await interaction.editReply({ content: "An error occurred while processing your request." });
    }
}

type ChoicesArray = {
    name: string;
    value: string;
}