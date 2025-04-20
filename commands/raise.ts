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
    .setName("raise")
    .setDescription("raise an animal to start producing.")
    .addStringOption(option =>
        option
            .setName("animal")
            .setDescription("the animal you're trying to raise")
            .setRequired(true)
            .addChoices(...choices)
    )

export async function execute(interaction: CommandInteraction) {
    await interaction.deferReply();

    const animal: string = String(interaction.options.get("animal")?.value)?.trim();
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

    if (!userProfile.storage.market_items.find((v: Record<string, string | number>) => v?.name === animal)
    ) return await interaction.editReply({ content: `you can't raise **${animal}** as you don't own it.` });

    if (userProfile.farm.occupied_animal_slots.length >= userProfile.farm.available_animal_slots) 
        return await interaction.editReply({ content: `you can't raise **${animal}**, all slots are occupied.` });

    const jsonitem = userProfile.storage.market_items.find((v: any) => v.name === animal)!;

    // Hydrate the cached profile into a Mongoose document
    const dbProfile = schema.hydrate(userProfile);
    if (!dbProfile) {
        userProfileCache.del(userId);
        return await interaction.editReply({ content: "An error occurred while processing your request." });
    }

    try {
        await database.removeItemFromstorage(dbProfile, animal, 1, "market_items");
        await database.deployAnimal(dbProfile, Object.assign({}, jsonitem));
        await database.saveNestedObject(dbProfile, "farm");

        // Update cache with latest data
        const updatedProfile = (dbProfile as any).toObject();
        userProfileCache.set(userId, updatedProfile);

        return await interaction.editReply({ content: `successfully raised **${animal}**, it will produce goods every **${jsonitem.ready_time/1000/60}mins**` });
    } catch (error) {
        logError(interaction.client, {
            path: 'raise.ts',
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