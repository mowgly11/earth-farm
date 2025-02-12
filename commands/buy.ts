import { CommandInteraction, SlashCommandBuilder, MessageFlags } from "discord.js";
import marketItems from "../config/items/market_items.json";
import database from "../database/methods.ts";

let choices: Array<ChoicesArray> = [];
marketItems.map(option => {
    choices.push({
        name: option.name,
        value: option.name
    });
});

export const data = new SlashCommandBuilder()
    .setName("buy")
    .setDescription("buy an item from the market")
    .addStringOption(option =>
        option
            .setName("item")
            .setDescription("the name of the item you're trying to buy")
            .setRequired(true)
            .addChoices(...choices)
    )
    .addNumberOption(option =>
        option
            .setName("quantity")
            .setDescription("how much quantity do you want to buy?")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100)
    )

export async function execute(interaction: CommandInteraction) {
    await interaction.deferReply();

    const item: string = String(interaction.options.get("item")?.value)?.trim();
    let quantity: any = interaction.options.get("quantity")?.value;
    quantity = parseInt(quantity);

    const userId = interaction.user.id;

    const userProfile: any = await database.findUser(userId);
    if (!userProfile) return interaction.editReply({ content: "Please make a profile using `/farmer` before trying to buy anything from the market." })

    const findItemInDatabase = marketItems.find(v => v.name === item)!;

    const itemPrice: any = findItemInDatabase?.buy_price!;
    const itemLevel = findItemInDatabase?.level!;

    const buyingPrice = itemPrice * quantity;
    if (userProfile?.level < itemLevel) return interaction.editReply({ content: `you need to be at level ${itemLevel} to be able to buy this item.` });
    if (buyingPrice > userProfile?.gold) return interaction.editReply({ content: "you don't have enough gold to buy this item" });

    await database.addItemToInventory(userProfile, String(findItemInDatabase?.name), quantity, findItemInDatabase?.type);
    await database.makePayment(userProfile, -buyingPrice);

    return interaction.editReply({ content: `Successfully bought ${quantity} of ${item} for a total price of ${buyingPrice}.` });
}

type ChoicesArray = {
    name: string;
    value: string;
}