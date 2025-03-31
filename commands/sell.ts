import { ChatInputCommandInteraction, SlashCommandBuilder, MessageFlags } from "discord.js";
import marketItems from "../config/items/market_items.json";
import products from "../config/items/products.json";
import database from "../database/methods.ts";
import { logTransaction } from "../utils/transaction_logger.ts";

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

    const userProfile: any = await database.findUser(userId);
    if (!userProfile) {
        return interaction.editReply({ content: "Please make a profile using `/farmer` before trying to sell anything from the market." });
    }

    if (subcommand === "item") {
        // Handle market item selling
        if (!userProfile.storage.market_items.find((v: Record<string, string | number>) => v?.name === name && Number(v?.amount) >= quantity)) {
            return interaction.editReply({ content: `You can't sell ${name}. You either don't own it or don't own ${quantity} of it.` });
        }

        const findItemInDatabase = marketItems.find(v => v.name === name)!;
        const sellingPrice = Number(findItemInDatabase?.sell_price!) * quantity;

        const goldBefore = userProfile.gold;
        await database.removeItemFromstorage(userProfile, name, quantity, "market_items");
        await database.makePayment(userProfile, sellingPrice);
        const goldAfter = userProfile.gold;

        // Log the transaction
        await logTransaction(interaction.client, {
            type: "sell",
            initiator: interaction.user.id,
            initiatorUsername: interaction.user.username,
            item: name,
            quantity: quantity,
            price: sellingPrice,
            isProduct: false,
            initiatorGoldBefore: goldBefore,
            initiatorGoldAfter: goldAfter
        });

        return interaction.editReply({ content: `Successfully sold ${quantity} of ${name} for a total price of ${sellingPrice} 🪙` });

    } else if (subcommand === "product") {
        // Handle product selling
        if (!userProfile.storage.products.find((v: Record<string, string | number>) => v?.name === name && Number(v?.amount) >= quantity)) {
            return interaction.editReply({ content: `You can't sell ${name}. You either don't own it or don't own ${quantity} of it.` });
        }

        const findItemInDatabase = products.find(v => v.name === name)!;
        const sellingPrice = Number(findItemInDatabase?.sell_price!) * quantity;

        const goldBefore = userProfile.gold;
        await database.removeItemFromstorage(userProfile, name, quantity, "products");
        await database.makePayment(userProfile, sellingPrice);
        const goldAfter = userProfile.gold;

        // Log the transaction
        await logTransaction(interaction.client, {
            type: "sell",
            initiator: interaction.user.id,
            initiatorUsername: interaction.user.username,
            item: name,
            quantity: quantity,
            price: sellingPrice,
            isProduct: true,
            initiatorGoldBefore: goldBefore,
            initiatorGoldAfter: goldAfter
        });

        return interaction.editReply({ content: `Successfully sold ${quantity} of ${name} for a total price of ${sellingPrice} 🪙` });
    }
}

type ChoicesArray = {
    name: string;
    value: string;
}
