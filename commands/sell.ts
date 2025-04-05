import { ChatInputCommandInteraction, SlashCommandBuilder, MessageFlags } from "discord.js";
import marketItems from "../config/items/market_items.json";
import products from "../config/items/products.json";
import database from "../database/methods.ts";
import { logTransaction } from "../utils/transaction_logger.ts";
import { userProfileCache } from "../index.ts";
import schema from "../database/schema.ts";
import { logError } from "../utils/error_logger.ts";

// Prepare choices for both items and products
let itemChoices: Array<ChoicesArray> = marketItems.map(option => ({
    name: option.name,
    value: option.name
}));

let productChoices: Array<ChoicesArray> = products.map(option => ({
    name: option.name,
    value: option.name
}));

export const data = new SlashCommandBuilder()
    .setName("sell")
    .setDescription("Sell items or products from your storage")
    .addSubcommand(subcommand =>
        subcommand
            .setName("item")
            .setDescription("Sell a market item from your storage")
            .addStringOption(option =>
                option
                    .setName("name")
                    .setDescription("The name of the item you're trying to sell")
                    .setRequired(true)
                    .addChoices(...itemChoices)
            )
            .addNumberOption(option =>
                option
                    .setName("quantity")
                    .setDescription("How much quantity do you want to sell?")
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(100)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName("product")
            .setDescription("Sell a product from your storage")
            .addStringOption(option =>
                option
                    .setName("name")
                    .setDescription("The name of the product you're trying to sell")
                    .setRequired(true)
                    .addChoices(...productChoices)
            )
            .addNumberOption(option =>
                option
                    .setName("quantity")
                    .setDescription("How much quantity do you want to sell?")
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(100)
            )
    );

export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const subcommand = interaction.options.getSubcommand();
    const name = String(interaction.options.get("name")?.value)?.trim();
    const quantity = parseInt(String(interaction.options.get("quantity")?.value));
    const userId = interaction.user.id;

    // Check cache first
    let userProfile: any = userProfileCache.get(userId);
    
    // If not in cache, get from database and cache it
    if (!userProfile) {
        const dbProfile = await database.findUser(userId);
        if (!dbProfile) {
            return interaction.editReply({ content: "Please make a profile using `/farmer` before trying to sell anything from the market." });
        }
        
        // Cache the plain object
        userProfile = (dbProfile as any).toObject();
        userProfileCache.set(userId, userProfile);
    }

    // Hydrate the cached profile into a Mongoose document
    const dbProfile = schema.hydrate(userProfile);
    if (!dbProfile) {
        userProfileCache.del(userId);
        return interaction.editReply({ content: "An error occurred while processing your request." });
    }

    try {
        if (subcommand === "item") {
            // Handle market item selling
            if (!userProfile.storage.market_items.find((v: Record<string, string | number>) => v?.name === name && Number(v?.amount) >= quantity)) {
                return interaction.editReply({ content: `You can't sell ${name}. You either don't own it or don't own ${quantity} of it.` });
            }

            const findItemInDatabase = marketItems.find(v => v.name === name)!;
            const sellingPrice = Number(findItemInDatabase?.sell_price!) * quantity;

            const goldBefore = dbProfile.gold;
            await database.removeItemFromstorage(dbProfile, name, quantity, "market_items");
            await database.makePayment(dbProfile, sellingPrice);
            const goldAfter = dbProfile.gold;

            // Update cache with latest data
            const updatedProfile = (dbProfile as any).toObject();
            userProfileCache.set(userId, updatedProfile);

            // Log the transaction
            logTransaction(interaction.client, {
                type: "sell",
                initiator: interaction.user.id,
                initiatorUsername: interaction.user.username,
                item: name,
                quantity: quantity,
                price: sellingPrice,
                isProduct: false,
                initiatorGoldBefore: Number(goldBefore),
                initiatorGoldAfter: Number(goldAfter)
            });

            return interaction.editReply({ content: `Successfully sold ${quantity} of ${name} for a total price of ${sellingPrice} 🪙` });

        } else if (subcommand === "product") {
            // Handle product selling
            if (!userProfile.storage.products.find((v: Record<string, string | number>) => v?.name === name && Number(v?.amount) >= quantity)) {
                return interaction.editReply({ content: `You can't sell ${name}. You either don't own it or don't own ${quantity} of it.` });
            }

            const findItemInDatabase = products.find(v => v.name === name)!;
            const sellingPrice = Number(findItemInDatabase?.sell_price!) * quantity;

            const goldBefore = dbProfile.gold;
            await database.removeItemFromstorage(dbProfile, name, quantity, "products");
            await database.makePayment(dbProfile, sellingPrice);
            const goldAfter = dbProfile.gold;

            const updatedProfile = (dbProfile as any).toObject();
            userProfileCache.set(userId, updatedProfile);
            // Update cache with latest data

            // Log the transaction
            logTransaction(interaction.client, {
                type: "sell",
                initiator: interaction.user.id,
                initiatorUsername: interaction.user.username,
                item: name,
                quantity: quantity,
                price: sellingPrice,
                isProduct: true,
                initiatorGoldBefore: Number(goldBefore),
                initiatorGoldAfter: Number(goldAfter)
            });

            return interaction.editReply({ content: `Successfully sold ${quantity} of ${name} for a total price of ${sellingPrice} 🪙` });
        }
    } catch (error) {
        logError(interaction.client, {
            path: "sell.ts",
            error
        })
        userProfileCache.del(userId);
        return interaction.editReply({ content: "An error occurred while processing your request." });
    }
}

type ChoicesArray = {
    name: string;
    value: string;
}
