import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ComponentType, StringSelectMenuBuilder, MessageFlags } from "discord.js";
import marketItems from "../config/items/market_items.json";
import products from "../config/items/products.json";
import database from "../database/methods.ts";
import { logTransaction } from "../utils/transaction_logger.ts";
import { userProfileCache } from "../services/profile_service.ts";
import schema from "../database/schema.ts";
import { logError } from "../utils/error_logger.ts";
import { ERRORS, COLORS } from "../utils/constants.ts";
import { createNoProfileEmbed } from "../utils/onboarding.ts";
import { formatNumber, getRandomTip, storageIndicator } from "../utils/ux.ts";
import { BTN_STYLE, SELL_BUTTONS, BUTTONS } from "../utils/buttons.ts";
import { getProfile } from "../services/index.ts";

export const data = new SlashCommandBuilder()
    .setName("sell")
    .setDescription("Sell items from your storage with an interactive interface!");

export async function execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;

    // Get user profile (using ProfileService)
    const profileResult = await getProfile(userId);
    if (!profileResult) return await interaction.reply({ ...createNoProfileEmbed(userId), flags: MessageFlags.Ephemeral });
    let userProfile = profileResult.profile;

    // Track selected item
    let selectedItem: any = null;
    let selectedType: "market_items" | "products" = "products";

    // Send initial view
    const response = await interaction.reply({
        ...createSellView(userProfile, selectedItem, selectedType, userId),
        withResponse: true
    });

    // Collector
    const collector = response?.resource?.message?.createMessageComponentCollector({
        filter: (m) => m.user.id === userId,
        time: 300000
    });

    collector?.on("collect", async (i) => {
        // Refresh profile
        const dbProfile = await database.findUser(userId);
        if (!dbProfile) {
            await i.reply({ ...createNoProfileEmbed(i.user.id), flags: MessageFlags.Ephemeral });
            return;
        }
        userProfile = (dbProfile as any).toObject();

        if (i.isStringSelectMenu()) {
            await i.deferUpdate();
            const [type, itemName] = i.values[0].split("::");
            selectedType = type as "market_items" | "products";

            // Find the item in storage
            const storage = type === "products" ? userProfile.storage.products : userProfile.storage.market_items;
            selectedItem = storage.find((s: any) => s.name === itemName);

            // Get price info
            if (selectedItem) {
                if (type === "products") {
                    const productInfo = products.find(p => p.name === itemName);
                    selectedItem = { ...selectedItem, sell_price: productInfo?.sell_price || 0 };
                } else {
                    const itemInfo = marketItems.find(m => m.name === itemName);
                    selectedItem = { ...selectedItem, sell_price: itemInfo?.sell_price || 0 };
                }
            }

            const view = createSellView(userProfile, selectedItem, selectedType, userId);
            await interaction.editReply(view);

        } else if (i.isButton()) {
            const customId = i.customId;

            if (customId.startsWith("sellnow:")) {
                const amount = customId.split(":")[1];
                let sellAmount = amount === "all" ? selectedItem.amount : parseInt(amount);

                if (!selectedItem) {
                    await i.reply({ content: "❌ No item selected!", flags: MessageFlags.Ephemeral });
                    return;
                }

                if (sellAmount > selectedItem.amount) {
                    sellAmount = selectedItem.amount;
                }

                const totalValue = selectedItem.sell_price * sellAmount;
                const goldBefore = userProfile.gold;

                // Hydrate for database operations
                const hydratedProfile = schema.hydrate(userProfile);

                // Perform sale
                await database.removeItemFromstorage(hydratedProfile, selectedItem.name, sellAmount, selectedType);
                await database.makePayment(hydratedProfile, totalValue);

                const goldAfter = hydratedProfile.gold;

                // Update cache
                userProfile = (hydratedProfile as any).toObject();
                userProfileCache.set(userId, userProfile);

                // Log transaction
                logTransaction(interaction.client, {
                    type: "sell",
                    initiator: userId,
                    initiatorUsername: interaction.user.username,
                    item: selectedItem.name,
                    quantity: sellAmount,
                    price: totalValue,
                    isProduct: selectedType === "products",
                    initiatorGoldBefore: Number(goldBefore),
                    initiatorGoldAfter: Number(goldAfter)
                });

                const goldAfterNum = Number(goldAfter);
                await i.reply({
                    content: `✅ Sold **${sellAmount}x ${selectedItem.name}** for **${formatNumber(totalValue)}** 🪙!\n💰 Balance: **${formatNumber(goldBefore)}** → **${formatNumber(goldAfterNum)}** 🪙`,
                    flags: MessageFlags.Ephemeral
                });

                // Check if item is gone
                const remainingItem = userProfile.storage[selectedType].find((s: any) => s.name === selectedItem.name);
                if (remainingItem) {
                    const productInfo = selectedType === "products"
                        ? products.find(p => p.name === selectedItem.name)
                        : marketItems.find(m => m.name === selectedItem.name);
                    selectedItem = { ...remainingItem, sell_price: productInfo?.sell_price || 0 };
                } else {
                    selectedItem = null;
                }

                // Refresh view
                const view = createSellView(userProfile, selectedItem, selectedType, userId);
                await interaction.editReply(view);
            }
        }
    });

    collector?.on("end", async () => {
        const view = createSellView(userProfile, null, "products", userId);
        view.components.forEach((row: any) => {
            row.components.forEach((c: any) => {
                if (c.data) c.data.disabled = true;
                else if (c.setDisabled) c.setDisabled(true);
            });
        });
        await interaction.editReply(view).catch(() => { });
    });
}

function createSellView(profile: any, selectedItem: any, selectedType: string, userId: string) {
    // Calculate storage
    let storageCount = 0;
    profile.storage.market_items.forEach((v: any) => storageCount += v?.amount ?? 0);
    profile.storage.products.forEach((v: any) => storageCount += v?.amount ?? 0);

    // Combine all sellable items
    const allItems: any[] = [];

    // Add products (harvested items)
    profile.storage.products.forEach((item: any) => {
        if (item?.amount > 0) {
            const productInfo = products.find(p => p.name === item.name);
            allItems.push({
                name: item.name,
                amount: item.amount,
                type: "products",
                sell_price: productInfo?.sell_price || 0,
                emoji: "🥚"
            });
        }
    });

    // Add market items (seeds/animals in storage)
    profile.storage.market_items.forEach((item: any) => {
        if (item?.amount > 0) {
            const itemInfo = marketItems.find(m => m.name === item.name);
            allItems.push({
                name: item.name,
                amount: item.amount,
                type: "market_items",
                sell_price: itemInfo?.sell_price || 0,
                emoji: itemInfo?.type === "seeds" ? "🌱" : "🐔"
            });
        }
    });

    const embed = new EmbedBuilder()
        .setTitle("📦 Sell Items")
        .setColor(COLORS.PRIMARY)
        .setDescription(`💰 Your Gold: **${formatNumber(profile.gold)}** 🪙\n📦 Storage: ${storageIndicator(storageCount, profile.farm.storage_limit)}`)
        .setTimestamp();

    const components: any[] = [];

    if (allItems.length === 0) {
        embed.addFields({
            name: "📭 Storage Empty",
            value: "You don't have any items to sell!\nHarvest crops or animal products first.",
            inline: false
        });
        embed.setFooter({ text: "Use /harvest to collect items" });
    } else {
        // Create select menu with all items
        const selectOptions = allItems.slice(0, 25).map(item => ({
            label: `${item.name} (x${item.amount})`,
            description: `Sell for ${formatNumber(item.sell_price)} 🪙 each`,
            value: `${item.type}::${item.name}`,
            emoji: item.emoji
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId("select_item")
            .setPlaceholder("Select an item to sell...")
            .addOptions(selectOptions);

        components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));

        // If item selected, show details and sell buttons
        if (selectedItem) {
            const totalValue = selectedItem.sell_price * selectedItem.amount;

            embed.addFields(
                { name: "📦 Selected", value: `**${selectedItem.name}**`, inline: true },
                { name: "🔢 Amount", value: `${selectedItem.amount}x`, inline: true },
                { name: "💰 Price Each", value: `${formatNumber(selectedItem.sell_price)} 🪙`, inline: true }
            );
            embed.addFields({
                name: "💵 Total Value",
                value: `**${formatNumber(totalValue)}** 🪙`,
                inline: false
            });

            // Sell buttons
            const sellRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                SELL_BUTTONS.sellOne(userId),
                SELL_BUTTONS.sellFive(userId).setStyle(selectedItem.amount >= 5 ? 3 : 2)
                    .setDisabled(selectedItem.amount < 5),
                SELL_BUTTONS.sellAll(userId).setLabel(`Sell All (${selectedItem.amount})`)
            );
            components.push(sellRow);

            embed.setFooter({ text: getRandomTip() });
        } else {
            // Show summary of items
            const productCount = allItems.filter(i => i.type === "products").length;
            const itemCount = allItems.filter(i => i.type === "market_items").length;

            embed.addFields(
                { name: "🥚 Products", value: `${productCount} types`, inline: true },
                { name: "📦 Items", value: `${itemCount} types`, inline: true }
            );
            embed.setFooter({ text: "Select an item from the dropdown above" });
        }
    }

    // Add navigation row with dashboard button
    const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        BUTTONS.market().setLabel("Buy More"),
        BUTTONS.dashboard()
    );
    components.push(navRow);

    return { embeds: [embed], components };
}
