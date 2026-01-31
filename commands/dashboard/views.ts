/**
 * Dashboard View Creators
 * Creates embeds and button layouts for various dashboard views
 */

import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, AttachmentBuilder } from "discord.js";
import { createProfileImage } from "../profile.ts";
import { COLORS } from "../../utils/constants.ts";
import { formatNumber, storageIndicator, createProgressBar, relativeTimestamp, getRandomTip, getItemEmoji, createGrowingList } from "../../utils/ux.ts";
import { DASHBOARD_BUTTONS, BUTTONS, BTN_STYLE } from "../../utils/buttons.ts";
import { addBackButton } from "../../utils/nav_history.ts";
import levels from "../../config/data/levels.json";
import marketItems from "../../config/items/market_items.json";
import type { UserProfile, StorageItem, OccupiedCropSlot, OccupiedAnimalSlot } from "../../types/database_types.ts";

/**
 * Creates the main dashboard view with stats and action buttons
 */
export function createMainView(profile: UserProfile, username: string, avatar: string, userId: string) {
    // Calculate stats
    let storageCount = 0;
    profile.storage.market_items.forEach((v: StorageItem) => storageCount += v?.amount ?? 0);
    profile.storage.products.forEach((v: StorageItem) => storageCount += v?.amount ?? 0);

    const currentLevel = levels.find((l) => l.level === profile.level);
    const xpToNext = currentLevel?.xp_to_upgrade || 1000;
    const xpProgress = createProgressBar(profile.xp, xpToNext, 10);

    const now = Date.now();
    const cropsReady = profile.farm.occupied_crop_slots?.filter((c: OccupiedCropSlot) => c.ready_at <= now).length || 0;
    const animalsReady = profile.farm.occupied_animal_slots?.filter((a: OccupiedAnimalSlot) => a.ready_at <= now).length || 0;
    const totalReady = cropsReady + animalsReady;

    const dailyReady = (profile.daily || 0) <= now;
    const scratchReady = (profile.scratch || 0) <= now;

    // Calculate next item ready time
    let nextReadyStr = "";
    const growingCrops = profile.farm.occupied_crop_slots?.filter((c: OccupiedCropSlot) => c.ready_at > now) || [];
    const growingAnimals = profile.farm.occupied_animal_slots?.filter((a: OccupiedAnimalSlot) => a.ready_at > now) || [];
    const allGrowing = [...growingCrops, ...growingAnimals].sort((a, b) => a.ready_at - b.ready_at);

    if (allGrowing.length > 0) {
        const nextItem = allGrowing[0];
        const minsLeft = Math.ceil((nextItem.ready_at - now) / 60000);
        nextReadyStr = `⏳ Next ready in **${minsLeft}m**`;
    }

    // Products with sell value
    let productCount = 0;
    profile.storage.products.forEach((v: StorageItem) => productCount += v?.amount ?? 0);

    const embed = new EmbedBuilder()
        .setTitle("🌾 EARTH FARM DASHBOARD")
        .setColor(COLORS.PRIMARY)
        .setThumbnail(avatar)
        .setDescription(`Welcome, **${username}**!\n\n${xpProgress} ${profile.xp}/${xpToNext} XP`)
        .addFields(
            { name: "⭐ Level", value: `**${profile.level}**`, inline: true },
            { name: "💰 Gold", value: `**${formatNumber(profile.gold)}**`, inline: true },
            { name: "📦 Storage", value: storageIndicator(storageCount, profile.farm.storage_limit), inline: true }
        )
        .addFields(
            { name: "🎁 Daily", value: dailyReady ? "✅ **READY**" : `⏰ ${relativeTimestamp(profile.daily)}`, inline: true },
            { name: "🎰 Scratch", value: scratchReady ? "✅ **READY**" : `⏰ ${relativeTimestamp(profile.scratch)}`, inline: true },
            { name: "🌾 Harvest", value: totalReady > 0 ? `✅ **${totalReady} ready** (${cropsReady}🌱 ${animalsReady}🥚)` : nextReadyStr || "⏳ Nothing growing", inline: true }
        );

    // Add growing items progress list if there are any growing items
    const totalGrowing = growingCrops.length + growingAnimals.length;
    if (totalGrowing > 0 || totalReady > 0) {
        const crops = profile.farm.occupied_crop_slots || [];
        const animals = profile.farm.occupied_animal_slots || [];
        const growingListStr = createGrowingList(crops, animals);
        embed.addFields({ name: "\u200B", value: growingListStr, inline: false });
    }

    embed.setFooter({ text: getRandomTip() })
        .setTimestamp();

    // Check if user has animals for care buttons
    const hasAnimals = (profile.farm.occupied_animal_slots?.length || 0) > 0;
    const hasProducts = productCount > 0;

    // Create button rows - IMPROVED LAYOUT
    // Row 1: Quick Actions - Only show ready actions
    const row1Buttons: ButtonBuilder[] = [];

    if (dailyReady) {
        row1Buttons.push(DASHBOARD_BUTTONS.viewDaily(userId));
    }

    if (scratchReady) {
        row1Buttons.push(DASHBOARD_BUTTONS.viewScratch(userId));
    }

    row1Buttons.push(
        DASHBOARD_BUTTONS.viewHarvest(userId)
            .setLabel(totalReady > 0 ? `Harvest (${totalReady})` : "Harvest")
            .setStyle(totalReady > 0 ? 3 : 2)
    );

    row1Buttons.push(
        DASHBOARD_BUTTONS.viewSell(userId)
            .setLabel(hasProducts ? `Sell (${productCount})` : "Sell")
            .setStyle(hasProducts ? 3 : 2)
    );

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(...row1Buttons);

    // Row 2: Navigation
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        DASHBOARD_BUTTONS.viewMarket(userId),
        DASHBOARD_BUTTONS.viewProfile(userId),
        DASHBOARD_BUTTONS.viewStorage(userId),
        DASHBOARD_BUTTONS.viewRefresh(userId)
    );

    // Row 3: Animal care
    const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        DASHBOARD_BUTTONS.careFeed(userId).setStyle(hasAnimals ? 1 : 2).setDisabled(!hasAnimals),
        DASHBOARD_BUTTONS.carePet(userId).setStyle(hasAnimals ? 1 : 2).setDisabled(!hasAnimals),
        DASHBOARD_BUTTONS.careClean(userId).setStyle(hasAnimals ? 1 : 2).setDisabled(!hasAnimals)
    );

    // Row 4: Visual commands + Upgrade
    const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        DASHBOARD_BUTTONS.viewFarm(userId),
        DASHBOARD_BUTTONS.viewBarn(userId),
        DASHBOARD_BUTTONS.viewLeaderboard(userId),
        DASHBOARD_BUTTONS.viewUpgrade(userId)
    );

    return { embed, components: [row1, row2, row3, row4] };
}

/**
 * Create simple navigation buttons (used on sub-views for back navigation)
 * Daily/Scratch are only on main dashboard, not on sub-views
 */
export function createActionButtons(userId: string, messageId?: string): ActionRowBuilder<ButtonBuilder>[] {
    // Sub-views only get back/dashboard navigation, not action buttons
    return addBackButton([], userId, messageId);
}

/**
 * Create result view with action buttons
 */
export function createResultView(embed: EmbedBuilder, userId: string, emoji: string, messageId?: string) {
    embed.setFooter({ text: getRandomTip() });
    const buttons = createActionButtons(userId, messageId);
    return { embed, components: buttons };
}

/**
 * Create profile view with user stats and profile image
 */
export async function createProfileView(
    profile: any,
    username: string,
    avatar: string,
    userId: string,
    messageId?: string
): Promise<{ embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[]; attachment: AttachmentBuilder }> {
    // Generate the canvas profile image
    const attachment = await createProfileImage(username, avatar, profile);

    const currentLevel = levels.find((l: any) => l.level === profile.level);
    const xpToNext = currentLevel?.xp_to_upgrade || 1000;

    let storageCount = 0;
    profile.storage.market_items.forEach((v: any) => storageCount += v?.amount ?? 0);
    profile.storage.products.forEach((v: any) => storageCount += v?.amount ?? 0);

    const embed = new EmbedBuilder()
        .setTitle(`👨‍🌾 ${username}'s Profile`)
        .setColor(COLORS.PRIMARY)
        .setImage('attachment://profile.png')
        .addFields(
            { name: "⭐ Level", value: `**${profile.level ?? 1}**`, inline: true },
            { name: "✨ XP", value: `**${formatNumber(profile.xp ?? 0)}** / ${formatNumber(xpToNext)}`, inline: true },
            { name: "💰 Gold", value: `**${formatNumber(profile.gold ?? 0)}**`, inline: true }
        )
        .addFields(
            { name: "🌱 Farm Level", value: `**${profile.farm?.level ?? 1}**`, inline: true },
            { name: "📦 Storage", value: storageIndicator(storageCount, profile.farm?.storage_limit ?? 50), inline: true },
            { name: "🌾 Crop Slots", value: `**${profile.farm?.available_crop_slots ?? 0}**`, inline: true }
        )
        .addFields(
            { name: "🐔 Animal Slots", value: `**${profile.farm?.available_animal_slots ?? 0}**`, inline: true }
        )
        .setTimestamp();

    return { embed, components: createActionButtons(userId, messageId), attachment };
}

/**
 * Create market preview view
 */
export function createMarketView(profile: any, userId: string, messageId?: string) {
    const seeds = marketItems.filter(i => i.type === "seeds").slice(0, 5);
    const animals = marketItems.filter(i => i.type === "animals").slice(0, 5);

    const seedsList = seeds.map(s => `${getItemEmoji('seeds')} **${s.name}** - ${formatNumber(s.buy_price)} 🪙`).join('\n');
    const animalsList = animals.map(a => `${getItemEmoji('animals')} **${a.name}** - ${formatNumber(a.buy_price)} 🪙`).join('\n');

    const embed = new EmbedBuilder()
        .setTitle("🛒 Market Preview")
        .setColor(COLORS.PRIMARY)
        .setDescription(`💰 Your Gold: **${formatNumber(profile.gold)}** 🪙\n\nUse \`/buy <item>\` to purchase!`)
        .addFields(
            { name: "🌱 Seeds", value: seedsList || "None available", inline: true },
            { name: "🐔 Animals", value: animalsList || "None available", inline: true }
        )
        .setFooter({ text: "Use /market for full list with details" });

    return { embed, components: createActionButtons(userId, messageId) };
}

/**
 * Create storage view with inventory
 */
export function createStorageView(profile: any, userId: string, messageId?: string) {
    const products = profile.storage.products || [];
    const marketItemsStorage = profile.storage.market_items || [];

    let storageCount = 0;
    products.forEach((v: any) => storageCount += v?.amount ?? 0);
    marketItemsStorage.forEach((v: any) => storageCount += v?.amount ?? 0);

    const productsList = products
        .filter((p: any) => p && p.amount > 0)
        .map((p: any) => `• **${p.amount}x** ${p.name}`)
        .join('\n') || "No products";

    const itemsList = marketItemsStorage
        .filter((i: any) => i && i.amount > 0)
        .map((i: any) => `• **${i.amount}x** ${i.name}`)
        .join('\n') || "No items";

    const productsConfigRaw = require("../../config/items/products.json");
    const productsConfig = productsConfigRaw.default || productsConfigRaw;
    let totalSellValue = 0;
    products.forEach((p: any) => {
        const config = productsConfig.find((c: any) => c.name === p?.name);
        if (config && p?.amount) totalSellValue += config.sell_price * p.amount;
    });

    const embed = new EmbedBuilder()
        .setTitle("📦 Storage")
        .setColor(COLORS.PRIMARY)
        .setDescription(`**${storageCount}** / **${profile.farm.storage_limit}** items\n${storageIndicator(storageCount, profile.farm.storage_limit)}`)
        .addFields(
            { name: "🌾 Products", value: productsList, inline: true },
            { name: "🛒 Market Items", value: itemsList, inline: true }
        )
        .addFields(
            { name: "💰 Total Sell Value", value: `**${formatNumber(totalSellValue)}** 🪙`, inline: false }
        )
        .setFooter({ text: "Use Sell button to sell all products" });

    return { embed, components: createActionButtons(userId, messageId) };
}

/**
 * Create upgrade view with farm level info AND upgrade button
 */
export function createUpgradeView(profile: any, userId: string, messageId?: string) {
    const upgradesRaw = require("../../config/upgrades/farms.json");
    const upgrades = upgradesRaw.default || upgradesRaw;
    const currentLevel = profile.farm.level || 1;
    const nextUpgrade = upgrades.find((u: any) => u.level === currentLevel + 1);
    const currentUpgrade = upgrades.find((u: any) => u.level === currentLevel);

    let description = "";
    const canAfford = nextUpgrade && profile.gold >= nextUpgrade.price;

    if (!nextUpgrade) {
        description = "🎉 **MAX LEVEL!** Your farm is fully upgraded!";
    } else {
        description = `💰 Your Gold: **${formatNumber(profile.gold)}** 🪙\n\n`;
        description += canAfford
            ? "✅ **You can upgrade!** Click the button below!"
            : `❌ Need **${formatNumber(nextUpgrade.price - profile.gold)}** more gold`;
    }

    const embed = new EmbedBuilder()
        .setTitle("⏫ Farm Upgrades")
        .setColor(COLORS.PRIMARY)
        .setDescription(description);

    if (currentUpgrade) {
        embed.addFields({
            name: `📍 Current: Level ${currentLevel}`,
            value: `🌱 ${currentUpgrade.available_crop_slots} crop slots\n🐔 ${currentUpgrade.available_animal_slots} animal slots\n📦 ${currentUpgrade.storage_limit} storage`,
            inline: true
        });
    }

    if (nextUpgrade) {
        embed.addFields({
            name: `⏫ Next: Level ${currentLevel + 1} (${formatNumber(nextUpgrade.price)} 🪙)`,
            value: `🌱 ${nextUpgrade.available_crop_slots} crop slots (+${nextUpgrade.available_crop_slots - currentUpgrade.available_crop_slots})\n🐔 ${nextUpgrade.available_animal_slots} animal slots (+${nextUpgrade.available_animal_slots - currentUpgrade.available_animal_slots})\n📦 ${nextUpgrade.storage_limit} storage (+${nextUpgrade.storage_limit - currentUpgrade.storage_limit})`,
            inline: true
        });
    }

    embed.setFooter({ text: canAfford ? "Click Upgrade Now to confirm!" : "Earn more gold to upgrade" });

    // Create action buttons with Upgrade Now if affordable
    const components = createActionButtons(userId, messageId);

    // Add Upgrade Now button if user can afford
    if (canAfford && nextUpgrade) {
        const upgradeBtn = new ButtonBuilder()
            .setCustomId(`upgrade:confirm:${userId}`)
            .setLabel(`Upgrade to Level ${currentLevel + 1}`)
            .setEmoji("⬆️")
            .setStyle(BTN_STYLE.SUCCESS);

        // Add to first row if space, otherwise create new row
        if (components.length > 0 && components[0].components.length < 5) {
            components[0].components.unshift(upgradeBtn);
        } else {
            components.unshift(new ActionRowBuilder<ButtonBuilder>().addComponents(upgradeBtn));
        }
    }

    return { embed, components };
}

/**
 * Create navigation view (fallback)
 */
export function createNavView(command: string, userId: string, messageId?: string) {
    const commandInfo: Record<string, { title: string; desc: string; emoji: string }> = {};

    const info = commandInfo[command] || { title: `/${command}`, desc: `Use \`/${command}\` to access this feature!`, emoji: "📋" };

    const embed = new EmbedBuilder()
        .setTitle(info.title)
        .setColor(COLORS.PRIMARY)
        .setDescription(info.desc)
        .setFooter({ text: "These features require visual rendering" });

    return { embed, components: createActionButtons(userId, messageId) };
}

/**
 * Create back row with dashboard button
 */
export function createBackRow(userId: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        BUTTONS.backDashboard()
    );
}
