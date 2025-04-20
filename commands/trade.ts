import { ChatInputCommandInteraction, SlashCommandBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ActionRowBuilder, ComponentType } from "discord.js";
import database from "../database/methods.ts";
import marketItems from "../config/items/market_items.json";
import products from "../config/items/products.json";
import market from "../config/data/market.json";
import { logTransaction } from "../utils/transaction_logger.ts";
import { userProfileCache } from "../index.ts";
import schema from "../database/schema.ts";
import { logError } from "../utils/error_logger.ts";

type MarketCategory = 'seeds' | 'animals' | 'crops' | 'animal_products' | 'upgrades';

// Prepare choices for both items and products, limited to 25 choices
const allItems = [
    ...marketItems.slice(0, 12).map(item => ({ name: `${item.name} (Market Item)`, value: `market_items:${item.name}` })),
    ...products.slice(0, 13).map(item => ({ name: `${item.name} (Product)`, value: `products:${item.name}` }))
];

const pendingOffers = new Set();

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
    const categories: MarketCategory[] = ['seeds', 'animals', 'crops', 'animal_products'];
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
        return await interaction.editReply({ content: "Invalid target user!" });
    }

    if(pendingOffers.has(targetUser.id)) {
        return await interaction.editReply({ content: "This user already has a pending offer, please wait until the offer is done." });
    }

    if (targetUser.id === interaction.user.id) {
        return await interaction.editReply({ content: "You cannot trade with yourself!" });
    }

    if (targetUser.bot) {
        return await interaction.editReply({ content: "You cannot trade with bots!" });
    }

    // Check cache for both users
    let initiatorProfile: any = userProfileCache.get(interaction.user.id);
    let targetProfile: any = userProfileCache.get(targetUser.id);
    
    // If not in cache, get from database and cache it
    if (!initiatorProfile) {
        const dbProfile = await database.findUser(interaction.user.id);
        if (!dbProfile) return await interaction.editReply({ content: "Both players must have profiles to trade. Use `/farmer` to create one." });
        initiatorProfile = (dbProfile as any).toObject();
        userProfileCache.set(interaction.user.id, initiatorProfile);
    }

    if (!targetProfile) {
        const dbProfile = await database.findUser(targetUser.id);
        if (!dbProfile) return await interaction.editReply({ content: "Both players must have profiles to trade. Use `/farmer` to create one." });
        targetProfile = (dbProfile as any).toObject();
        userProfileCache.set(targetUser.id, targetProfile);
    }

    // Check if initiator has enough of the offered item
    const initiatorItem = initiatorProfile.storage[offerType as keyof typeof initiatorProfile.storage].find((v: { name: string; amount: number }) => v.name === offerItem);
    if (!initiatorItem || initiatorItem.amount < offerQuantity) {
        return await interaction.editReply({ content: `You don't have enough ${offerItem} to make this trade!` });
    }

    // Check if target has enough of the requested item
    const targetItem = targetProfile.storage[requestType as keyof typeof targetProfile.storage].find((v: { name: string; amount: number }) => v.name === requestItem);
    if (!targetItem || targetItem.amount < requestQuantity) {
        return await interaction.editReply({ content: `${targetUser?.username} doesn't have enough ${requestItem} for this trade!` });
    }

    // Calculate current storage usage
    const initiatorCurrentStorage = Object.values(initiatorProfile.storage).reduce<number>((total, items) =>
        total + (items as any[]).reduce((sum, item) => sum + item.amount, 0), 0);
    const targetCurrentStorage = Object.values(targetProfile.storage).reduce<number>((total, items) =>
        total + (items as any[]).reduce((sum, item) => sum + item.amount, 0), 0);

    // Check if initiator has space for requested items
    if (initiatorCurrentStorage + requestQuantity > initiatorProfile.farm.storage_limit) {
        return await interaction.editReply({
            content: `You don't have enough storage space to receive ${requestQuantity}x ${requestItem}! Your storage limit is ${initiatorProfile.farm.storage_limit} items.`
        });
    }

    // Check if target has space for offered items
    if (targetCurrentStorage + offerQuantity > targetProfile.farm.storage_limit) {
        return await interaction.editReply({
            content: `${targetUser?.username} doesn't have enough storage space to receive ${offerQuantity}x ${offerItem}! Their storage limit is ${targetProfile.farm.storage_limit} items.`
        });
    }

    // Check level requirements
    const requestItemLevel = getItemLevel(requestItem);
    if (initiatorProfile.farm.level < requestItemLevel) {
        return await interaction.editReply({
            content: `You need to be level ${requestItemLevel} to receive ${requestItem}!`
        });
    }

    const offerItemLevel = getItemLevel(offerItem);
    if (targetProfile.farm.level < offerItemLevel) {
        return await interaction.editReply({
            content: `${targetUser?.username} needs to be level ${offerItemLevel} to receive ${offerItem}!`
        });
    }

    pendingOffers.add(targetUser.id);
    pendingOffers.add(interaction.user.id);

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
            try {
                // Hydrate both profiles into Mongoose documents
                const initiatorDbProfile: any = schema.hydrate(initiatorProfile);
                const targetDbProfile: any = schema.hydrate(targetProfile);
                
                if (!initiatorDbProfile || !targetDbProfile) {
                    userProfileCache.del(interaction.user.id);
                    userProfileCache.del(targetUser.id);
                    return i.reply({ content: "An error occurred while processing the trade.", ephemeral: true });
                }

                const initiatorGoldBefore = (initiatorProfile as any).gold;
                const targetGoldBefore = (targetProfile as any).gold;

                let reqItemObj = targetDbProfile.storage[requestType].find((v: { name: string; amount: number }) => v.name === requestItem);
                let offeredItemObj = initiatorDbProfile.storage[offerType].find((v: { name: string; amount: number }) => v.name === offerItem);
                
                await database.removeItemFromstorage(initiatorDbProfile, offerItem, offerQuantity, offerType as "market_items" | "products");
                await database.removeItemFromstorage(targetDbProfile, requestItem, requestQuantity, requestType as "market_items" | "products");
                await database.addItemToStorage(initiatorDbProfile, reqItemObj, requestQuantity, requestType as "market_items" | "products");
                await database.addItemToStorage(targetDbProfile, offeredItemObj, offerQuantity, offerType as "market_items" | "products");

                // Update cache for both users
                const updatedInitiatorProfile = (initiatorDbProfile as any).toObject();
                const updatedTargetProfile = (targetDbProfile as any).toObject();
                
                userProfileCache.set(interaction.user.id, updatedInitiatorProfile);
                userProfileCache.set(targetUser.id, updatedTargetProfile);

                const initiatorGoldAfter = (updatedInitiatorProfile as any).gold;
                const targetGoldAfter = (updatedTargetProfile as any).gold;

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
            } catch (error) {
                logError(interaction.client, {
                    path: 'trade.ts',
                    error
                });
                userProfileCache.del(interaction.user.id);
                userProfileCache.del(targetUser.id);
                tradeEmbed.setColor("Red")
                    .setDescription("❌ An error occurred during the trade!")
                    .setFooter(null);
            }
        } else {
            tradeEmbed.setColor("Red")
                .setDescription("❌ Trade offer denied!")
                .setFooter(null);
        }


        row.components.forEach(button => button.setDisabled(true));
        await i.update({ embeds: [tradeEmbed], components: [row] });
        pendingOffers.delete(targetUser.id);
        pendingOffers.delete(interaction.user.id);
    });

    collector.on("end", async (collected, reason) => {
        pendingOffers.delete(targetUser.id);
        pendingOffers.delete(interaction.user.id);
        if (reason === "time" && collected.size === 0) {
            tradeEmbed.setColor("Red")
                .setDescription("❌ Trade offer expired!")
                .setFooter(null);

            row.components.forEach(button => button.setDisabled(true));
            await interaction.editReply({ embeds: [tradeEmbed], components: [row] });
        }
    });
}
