import { CommandInteraction, SlashCommandBuilder, MessageFlags } from "discord.js";
import marketItems from "../config/items/market_items.json";
import database from "../database/methods.ts";

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

    const userProfile: any = await database.findUser(userId);
    if (!userProfile) return interaction.editReply({ content: "Please make a profile using `/farmer` before trying to buy anything from the market." });

    if (!userProfile.storage.market_items.find((v: Record<string, string | number>) => v?.name === animal)
    ) return interaction.editReply({ content: `you can't deploy ${animal} as you don't own it.` });

    if (userProfile.farm.occupied_animal_slots.length >= userProfile.farm.available_animal_slots) return interaction.editReply({ content: `you can't plant ${animal}, all slots are occupied.` });

    const findItemInDatabase = marketItems.find(v => v.name === animal)!;

    await database.removeItemFromstorage(userProfile, animal, 1, "market_items");
    await database.deployAnimal(userProfile, findItemInDatabase);

    await database.saveNestedObject(userProfile, "farm");

    return interaction.editReply({ content: `successfully deployed ${animal}, it will produce goods every ${findItemInDatabase.ready_time/1000/60}mins` });
}

type ChoicesArray = {
    name: string;
    value: string;
}