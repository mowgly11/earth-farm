import { CommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import marketItems from "../config/items/market_items.json";
import database from "../database/methods.ts";
import { logTransaction } from "../utils/transaction_logger.ts";
import { userProfileCache } from "../services/profile_service.ts";
import { logError } from "../utils/error_logger.ts";
import { logger } from "../utils/logger.ts";
import { ERRORS, COLORS } from "../utils/constants.ts";
import { createNoProfileEmbed } from "../utils/onboarding.ts";
import { formatNumber, beforeAfter, storageIndicator, getItemEmoji, getRandomTip } from "../utils/ux.ts";
import { createBuyButtons } from "../utils/button_handler.ts";
import { getProfile } from "../services/index.ts";

let choices: Array<ChoicesArray> = [];
marketItems.map(option => {
    choices.push({
        name: option.name,
        value: option.name
    });
});

export const data = new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy an item from the market")
    .addStringOption(option =>
        option
            .setName("item")
            .setDescription("The item you want to buy")
            .setRequired(true)
            .addChoices(...choices)
    )
    .addIntegerOption(option =>
        option
            .setName("quantity")
            .setDescription("How many do you want to buy?")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100)
    )

export async function execute(interaction: CommandInteraction) {
    await interaction.deferReply();

    const item: string = String(interaction.options.get("item")?.value)?.trim();
    let quantity: number = interaction.options.get("quantity")?.value as number;
    const userId = interaction.user.id;

    // Get user profile (using ProfileService)
    const profileResult = await getProfile(userId);
    if (!profileResult) return await interaction.editReply(createNoProfileEmbed(interaction.user.id));
    let userProfile = profileResult.profile;
    const dbProfile = profileResult.dbProfile;

    const findItemInDatabase = marketItems.find(v => v.name === item)!;

    const itemPrice: number = findItemInDatabase?.buy_price!;
    const itemLevel = findItemInDatabase?.level!;
    const buyingPrice = itemPrice * quantity;

    // Level check with embed
    if (userProfile?.level < itemLevel) {
        const levelEmbed = new EmbedBuilder()
            .setTitle("🚫 Level Required")
            .setColor(COLORS.ERROR)
            .setDescription(`You need to reach **Level ${itemLevel}** to buy **${item}**.`)
            .addFields(
                { name: "📊 Your Level", value: `Level **${userProfile.level}**`, inline: true },
                { name: "📋 Required", value: `Level **${itemLevel}**`, inline: true }
            )
            .setFooter({ text: "Keep farming to level up!" })
            .setTimestamp();

        return await interaction.editReply({ embeds: [levelEmbed] });
    }

    // Gold check with embed
    if (buyingPrice > userProfile?.gold) {
        const goldEmbed = new EmbedBuilder()
            .setTitle("💸 Insufficient Gold")
            .setColor(COLORS.ERROR)
            .setDescription(`You don't have enough gold to buy **${quantity}x ${item}**.`)
            .addFields(
                { name: "💰 Your Gold", value: `**${formatNumber(userProfile.gold)}** 🪙`, inline: true },
                { name: "💵 Cost", value: `**${formatNumber(buyingPrice)}** 🪙`, inline: true },
                { name: "❌ Missing", value: `**${formatNumber(buyingPrice - userProfile.gold)}** 🪙`, inline: true }
            )
            .setFooter({ text: "Use /daily or /scratch to earn more gold!" })
            .setTimestamp();

        return await interaction.editReply({ embeds: [goldEmbed] });
    }

    // Storage check
    let storageCount = 0;
    userProfile.storage.market_items.forEach((v: any) => storageCount += v?.amount ?? 0);
    userProfile.storage.products.forEach((v: any) => storageCount += v?.amount ?? 0);
    const storageSpace = userProfile.farm.storage_limit - storageCount;

    if (storageSpace <= 0 || quantity > storageSpace) {
        const storageEmbed = new EmbedBuilder()
            .setTitle("📦 Storage Full")
            .setColor(COLORS.ERROR)
            .setDescription("You don't have enough storage space for this purchase!")
            .addFields(
                { name: "📦 Storage", value: storageIndicator(storageCount, userProfile.farm.storage_limit), inline: true },
                { name: "🛒 Trying to Buy", value: `**${quantity}** items`, inline: true },
                { name: "✅ Available Space", value: `**${Math.max(0, storageSpace)}** slots`, inline: true }
            )
            .setFooter({ text: "Sell some items or upgrade your farm!" })
            .setTimestamp();

        return await interaction.editReply({ embeds: [storageEmbed] });
    }

    const goldBefore = userProfile.gold;
    const storageBefore = storageCount;

    // dbProfile already hydrated by ProfileService

    try {
        // First update storage
        let jsonitem = { ...findItemInDatabase };
        if (jsonitem.type === "animals") jsonitem.lifetime = Date.now() + Number(jsonitem.lifetime);

        await database.addItemToStorage(dbProfile, jsonitem, quantity, "market_items");
        // Then update gold
        await database.makePayment(dbProfile, -buyingPrice);

        // Update cache with the latest data from the database document
        const updatedProfile = (dbProfile as any).toObject();
        userProfileCache.set(userId, updatedProfile);

        // Log the transaction
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

        // Create receipt embed
        const itemEmoji = getItemEmoji(findItemInDatabase.type);
        const storageAfter = storageBefore + quantity;

        const receiptEmbed = new EmbedBuilder()
            .setTitle("🛒 Purchase Complete!")
            .setColor(COLORS.SUCCESS)
            .setDescription(`Thank you for your purchase, **${interaction.user.username}**!`)
            .addFields(
                {
                    name: "📋 Order Details",
                    value: `${itemEmoji} **${item}**\nQuantity: **${quantity}**\nPrice each: **${formatNumber(itemPrice)}** 🪙\n─────────────\n**Total: ${formatNumber(buyingPrice)}** 🪙`,
                    inline: true
                },
                {
                    name: "💰 Gold Balance",
                    value: beforeAfter(goldBefore, updatedProfile.gold, '🪙'),
                    inline: true
                }
            )
            .addFields(
                {
                    name: "📦 Storage",
                    value: storageIndicator(storageAfter, userProfile.farm.storage_limit),
                    inline: true
                },
                {
                    name: "💡 Next Step",
                    value: findItemInDatabase.type === "animals"
                        ? "Use `/raise` to deploy your animal!"
                        : "Use `/plant` to plant your seeds!",
                    inline: true
                }
            )
            .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }))
            .setFooter({ text: getRandomTip() })
            .setTimestamp();

        // Add context-aware follow-up buttons
        const itemType = findItemInDatabase.type as "seeds" | "animals";
        const actionButtons = createBuyButtons(userId, itemType);

        return await interaction.editReply({ embeds: [receiptEmbed], components: [actionButtons] });

    } catch (error) {
        logger.error("Buy command error:", error);
        logError(interaction.client, {
            path: 'buy.ts',
            error,
        });
        // Invalidate cache on error
        userProfileCache.del(userId);
        return await interaction.editReply({ content: ERRORS.GENERIC });
    }
}

type ChoicesArray = {
    name: string;
    value: string;
}