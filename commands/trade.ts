import { ChatInputCommandInteraction, SlashCommandBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ActionRowBuilder, ComponentType } from "discord.js";
import database from "../database/methods.ts";
import marketItems from "../config/items/market_items.json";
import products from "../config/items/products.json";
import market from "../config/data/market.json";
import type { User } from "../types/database_types";
import { logTransaction } from "../utils/transaction_logger.ts";

type MarketCategory = 'seeds' | 'animals' | 'crops' | 'animal_products' | 'upgrades';

// Prepare choices for both items and products, limited to 25 choices
const allItems = [
    ...marketItems.slice(0, 12).map(item => ({ name: `${item.name} (Market Item)`, value: `market_items:${item.name}` })),
    ...products.slice(0, 13).map(item => ({ name: `${item.name} (Product)`, value: `products:${item.name}` }))
];

export const data = new SlashCommandBuilder()
    .setName("trade")
    .setDescription("Trade items with another player")
    .addUserOption(option =>
        option
            .setName("player")
            .setDescription("The player you want to trade with")
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName("offer_item")
            .setDescription("The item you want to offer")
            .setRequired(true)
            .addChoices(...allItems)
    )
    .addIntegerOption(option =>
        option
            .setName("offer_quantity")
            .setDescription("How many of the item you want to offer")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100)
    )
    .addStringOption(option =>
        option
            .setName("request_item")
            .setDescription("The item you want in return")
            .setRequired(true)
            .addChoices(...allItems)
    )
    .addIntegerOption(option =>
        option
            .setName("request_quantity")
            .setDescription("How many of the item you want in return")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100)
    );

// Helper function to get item level requirement
function getItemLevel(itemName: string): number {
    const categories: MarketCategory[] = ['seeds', 'animals', 'crops', 'animal_products', 'upgrades'];
    for (const category of categories) {
        const item = market.market[category].find((i: { name: string; level: number }) => i.name === itemName);
        if (item) return item.level;
    }
    return 1;
}

export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const targetUser = interaction.options.getUser("player");
    const offerItemFull = String(interaction.options.get("offer_item")?.value);
    const offerQuantity = Number(interaction.options.get("offer_quantity")?.value);
    const requestItemFull = String(interaction.options.get("request_item")?.value);
    const requestQuantity = Number(interaction.options.get("request_quantity")?.value);

    // Split the item strings into type and name
    const [offerType, offerItem] = offerItemFull.split(":");
    const [requestType, requestItem] = requestItemFull.split(":");

    // Validate users
    if (!targetUser) {
        return interaction.editReply({ content: "Invalid target user!" });
    }

    if (targetUser.id === interaction.user.id) {
        return interaction.editReply({ content: "You cannot trade with yourself!" });
    }

    if (targetUser.bot) {
        return interaction.editReply({ content: "You cannot trade with bots!" });
    }

    const initiatorProfile = (await database.findUser(interaction.user.id) as unknown) as User;
    const targetProfile = (await database.findUser(targetUser.id) as unknown) as User;

    if (!initiatorProfile || !targetProfile) {
        return interaction.editReply({ content: "Both players must have profiles to trade. Use `/farmer` to create one." });
    }

    // Check if initiator has enough of the offered item
    const initiatorItem = initiatorProfile.storage[offerType as keyof typeof initiatorProfile.storage].find((v) => v.name === offerItem);
    if (!initiatorItem || initiatorItem.amount < offerQuantity) {
        return interaction.editReply({ content: `You don't have enough ${offerItem} to make this trade!` });
    }

    // Check if target has enough of the requested item
    const targetItem = targetProfile.storage[requestType as keyof typeof targetProfile.storage].find((v) => v.name === requestItem);
    if (!targetItem || targetItem.amount < requestQuantity) {
        return interaction.editReply({ content: `${targetUser?.username} doesn't have enough ${requestItem} for this trade!` });
    }

    // Calculate current storage usage
    const initiatorCurrentStorage = Object.values(initiatorProfile.storage).reduce((total, items) =>
        total + items.reduce((sum, item) => sum + item.amount, 0), 0);
    const targetCurrentStorage = Object.values(targetProfile.storage).reduce((total, items) =>
        total + items.reduce((sum, item) => sum + item.amount, 0), 0);

    // Check if initiator has space for requested items
    if (initiatorCurrentStorage + requestQuantity > initiatorProfile.farm.storage_limit) {
        return interaction.editReply({
            content: `You don't have enough storage space to receive ${requestQuantity}x ${requestItem}! Your storage limit is ${initiatorProfile.farm.storage_limit} items.`
        });
    }

    // Check if target has space for offered items
    if (targetCurrentStorage + offerQuantity > targetProfile.farm.storage_limit) {
        return interaction.editReply({
            content: `${targetUser?.username} doesn't have enough storage space to receive ${offerQuantity}x ${offerItem}! Their storage limit is ${targetProfile.farm.storage_limit} items.`
        });
    }

    // Check level requirements
    const requestItemLevel = getItemLevel(requestItem);
    if (initiatorProfile.farm.level < requestItemLevel) {
        return interaction.editReply({
            content: `You need to be level ${requestItemLevel} to receive ${requestItem}!`
        });
    }

    const offerItemLevel = getItemLevel(offerItem);
    if (targetProfile.farm.level < offerItemLevel) {
        return interaction.editReply({
            content: `${targetUser?.username} needs to be level ${offerItemLevel} to receive ${offerItem}!`
        });
    }

    // Create trade confirmation embed
    const tradeEmbed = new EmbedBuilder()
        .setTitle("🤝 Trade Offer")
        .setDescription(`${interaction.user.username} wants to trade with you!`)
        .addFields(
            { name: "Offering", value: `${offerQuantity}x ${offerItem}`, inline: true },
            { name: "Requesting", value: `${requestQuantity}x ${requestItem}`, inline: true }
        )
        .setColor("#FFD700")
        .setTimestamp()
        .setFooter({ text: "This trade offer expires in 2 minutes" });

    // Create buttons
    const acceptBtn = new ButtonBuilder()
        .setCustomId("accept")
        .setLabel("Accept Trade")
        .setStyle(ButtonStyle.Success);

    const denyBtn = new ButtonBuilder()
        .setCustomId("deny")
        .setLabel("Deny Trade")
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(acceptBtn, denyBtn);

    const response = await interaction.editReply({
        content: `<@${targetUser?.id}>, you have a trade offer!`,
        embeds: [tradeEmbed],
        components: [row]
    });

    // Create collector for buttons
    const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 120000,
        filter: (i) => i.user.id === targetUser?.id
    });

    collector.on("collect", async (i) => {
        if (i.customId === "accept") {
            // Execute the trade
            const initiatorGoldBefore = (initiatorProfile as any).gold;
            const targetGoldBefore = (targetProfile as any).gold;

            await database.removeItemFromstorage(initiatorProfile, offerItem, offerQuantity, offerType as "market_items" | "products");
            await database.removeItemFromstorage(targetProfile, requestItem, requestQuantity, requestType as "market_items" | "products");
            await database.addItemTostorage(initiatorProfile, requestItem, requestQuantity, requestType as "market_items" | "products");
            await database.addItemTostorage(targetProfile, offerItem, offerQuantity, offerType as "market_items" | "products");

            const initiatorGoldAfter = (initiatorProfile as any).gold;
            const targetGoldAfter = (targetProfile as any).gold;

            // Log the transaction
            await logTransaction(i.client, {
                type: "trade",
                initiator: interaction.user.id,
                initiatorUsername: interaction.user.username,
                target: targetUser.id,
                targetUsername: targetUser.username,
                item: `${offerQuantity}x ${offerItem} for ${requestQuantity}x ${requestItem}`,
                quantity: 1,
                isProduct: offerType === "products" || requestType === "products",
                initiatorGoldBefore: initiatorGoldBefore,
                initiatorGoldAfter: initiatorGoldAfter,
                targetGoldBefore: targetGoldBefore,
                targetGoldAfter: targetGoldAfter
            });

            tradeEmbed.setColor("Green")
                .setDescription("✅ Trade completed successfully!")
                .setFooter(null);
        } else {
            tradeEmbed.setColor("Red")
                .setDescription("❌ Trade offer denied!")
                .setFooter(null);
        }

        row.components.forEach(button => button.setDisabled(true));
        await i.update({ embeds: [tradeEmbed], components: [row] });
    });

    collector.on("end", async (collected, reason) => {
        if (reason === "time" && collected.size === 0) {
            tradeEmbed.setColor("Red")
                .setDescription("❌ Trade offer expired!")
                .setFooter(null);

            row.components.forEach(button => button.setDisabled(true));
            await interaction.editReply({ embeds: [tradeEmbed], components: [row] });
        }
    });
}
