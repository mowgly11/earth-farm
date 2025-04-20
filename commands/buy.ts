import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import marketItems from "../config/items/market_items.json";
import database from "../database/methods.ts";
import { logTransaction } from "../utils/transaction_logger.ts";
import { userProfileCache } from "../index.ts";
import schema from "../database/schema.ts";
import { logError } from "../utils/error_logger.ts";

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
    console.time("buy");
    await interaction.deferReply();

    const item: string = String(interaction.options.get("item")?.value)?.trim();
    let quantity: number = interaction.options.get("quantity")?.value as number;
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

    const findItemInDatabase = marketItems.find(v => v.name === item)!;
    
    const itemPrice: any = findItemInDatabase?.buy_price!;
    const itemLevel = findItemInDatabase?.level!;
    
    const buyingPrice = itemPrice * quantity;
    if (userProfile?.level < itemLevel) return await interaction.editReply({ content: `you need to be at level ${itemLevel} to be able to buy this item.` });
    if (buyingPrice > userProfile?.gold) return await interaction.editReply({ content: "you don't have enough gold to buy this item" });
    
    let storageCount = 0;
    userProfile.storage.market_items.forEach((v:any) => storageCount += v?.amount ?? 0);
    userProfile.storage.products.forEach((v:any) => storageCount += v?.amount ?? 0);

    if (userProfile.farm.storage_limit - storageCount <= 0 || quantity > userProfile.farm.storage_limit - storageCount) return await interaction.editReply({ content: "storage limit exceeded." });
    
    const goldBefore = userProfile.gold;

    // Hydrate the cached profile into a Mongoose document
    const dbProfile = schema.hydrate(userProfile);
    if (!dbProfile) {
        userProfileCache.del(userId);
        return await interaction.editReply({ content: "An error occurred while processing your request." });
    }

    try {
        // First update storage
        let jsonitem = Object.assign({}, findItemInDatabase);
        if(jsonitem.type === "animals") jsonitem.lifetime = Date.now() + Number(jsonitem.lifetime);
        
        await database.addItemToStorage(dbProfile, jsonitem, quantity, "market_items");
        // Then update gold
        await database.makePayment(dbProfile, -buyingPrice);
        
        // Update cache with the latest data from the database document
        const updatedProfile = (dbProfile as any).toObject();
        userProfileCache.set(userId, updatedProfile);
        
        // Log the transaction with the correct gold values from the updated profile
        logTransaction(interaction.client, {
            type: "buy",
            initiator: interaction.user.id,
            initiatorUsername: interaction.user.username,
            item: item,
            quantity: quantity,
            price: buyingPrice,
            isProduct: false,
            initiatorGoldBefore: goldBefore,
            initiatorGoldAfter: updatedProfile.gold
        });
    } catch (error) {
        console.log(error)
        logError(interaction.client, {
            path: 'buy.ts',
            error,
        });
        // Invalidate cache on error
        userProfileCache.del(userId);
        return await interaction.editReply({ content: "An error occurred while processing your request." });
    }

    return await interaction.editReply({ content: `Successfully bought **${quantity}** of **${item}** for a total price of **${buyingPrice}**.` });
}

type ChoicesArray = {
    name: string;
    value: string;
}