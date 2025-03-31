import { CommandInteraction, SlashCommandBuilder, MessageFlags } from "discord.js";
import marketItems from "../config/items/market_items.json";
import database from "../database/methods.ts";
import { logTransaction } from "../utils/transaction_logger.ts";

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
    .addIntegerOption(option =>
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
    let quantity: number = interaction.options.get("quantity")?.value as number;

    const userId = interaction.user.id;

    const userProfile: any = await database.findUser(userId);
    if (!userProfile) return interaction.editReply({ content: "Please make a profile using `/farmer` before trying to buy anything from the market." });

    const findItemInDatabase = marketItems.find(v => v.name === item)!;
    
    const itemPrice: any = findItemInDatabase?.buy_price!;
    const itemLevel = findItemInDatabase?.level!;
    
    const buyingPrice = itemPrice * quantity;
    if (userProfile?.level < itemLevel) return interaction.editReply({ content: `you need to be at level ${itemLevel} to be able to buy this item.` });
    if (buyingPrice > userProfile?.gold) return interaction.editReply({ content: "you don't have enough gold to buy this item" });
    
    let storageCount = 0;
    
    userProfile.storage.market_items.forEach((v:any) => storageCount += v?.amount ?? 0);
    userProfile.storage.products.forEach((v:any) => storageCount += v?.amount ?? 0);

    if (userProfile.farm.storage_limit - storageCount <= 0 || quantity > userProfile.farm.storage_limit - storageCount) return interaction.editReply({ content: "storage limit exceeded." });
    
    const goldBefore = (userProfile as any).gold;
    await database.addItemTostorage(userProfile, String(findItemInDatabase?.name), quantity, findItemInDatabase?.type);
    await database.makePayment(userProfile, -buyingPrice);
    const goldAfter = (userProfile as any).gold;

    // Log the transaction
    await logTransaction(interaction.client, {
        type: "buy",
        initiator: interaction.user.id,
        initiatorUsername: interaction.user.username,
        item: item,
        quantity: quantity,
        price: buyingPrice,
        isProduct: false,
        initiatorGoldBefore: goldBefore,
        initiatorGoldAfter: goldAfter
    });

    return interaction.editReply({ content: `Successfully bought ${quantity} of ${item} for a total price of ${buyingPrice}.` });
}

type ChoicesArray = {
    name: string;
    value: string;
}