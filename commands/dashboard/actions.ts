/**
 * Dashboard Action Executors
 * Handles daily, scratch, harvest, and sell actions
 */

import { EmbedBuilder } from "discord.js";
import database from "../../database/methods.ts";
import { COLORS } from "../../utils/constants.ts";
import { formatNumber, relativeTimestamp, beforeAfter } from "../../utils/ux.ts";
import { logger } from "../../utils/logger.ts";
import type { UserProfile, StorageItem } from "../../types/database_types.ts";

/**
 * Execute daily reward claim action
 */
export async function executeDailyAction(profile: UserProfile, dbProfile: any, userId: string) {
    const now = Date.now();

    if (profile.daily > now) {
        return {
            success: false,
            embed: new EmbedBuilder()
                .setTitle("⏰ Daily Not Ready")
                .setColor(COLORS.WARNING)
                .setDescription(`Come back ${relativeTimestamp(profile.daily)}`)
                .addFields({ name: "💰 Current Gold", value: `**${formatNumber(profile.gold)}** 🪙`, inline: true })
        };
    }

    // Calculate reward
    const baseReward = Math.floor(Math.random() * (200 - 100 + 1)) + 100;
    const levelBonus = profile.level * 10;
    const reward = baseReward + levelBonus;
    const goldBefore = profile.gold;

    // Update database
    dbProfile.daily = now + 1000 * 60 * 60 * 24;
    dbProfile.gold += reward;
    dbProfile.markModified("daily");
    dbProfile.markModified("gold");
    await dbProfile.save();

    // Log action and economy change
    logger.action("daily", userId, "success", { reward, levelBonus });
    logger.econ("gold", userId, reward, goldBefore, dbProfile.gold, "daily");

    return {
        success: true,
        embed: new EmbedBuilder()
            .setTitle("🎁 Daily Reward Claimed!")
            .setColor(COLORS.SUCCESS)
            .setDescription(`You earned **${formatNumber(reward)}** 🪙!`)
            .addFields(
                { name: "📊 Breakdown", value: `Base: ${baseReward}\nLevel Bonus: +${levelBonus}`, inline: true },
                { name: "💰 Balance", value: beforeAfter(goldBefore, dbProfile.gold, '🪙'), inline: true }
            )
    };
}

/**
 * Execute scratch card action
 */
export async function executeScratchAction(profile: any, dbProfile: any, userId: string) {
    const now = Date.now();

    if (profile.scratch > now) {
        return {
            success: false,
            embed: new EmbedBuilder()
                .setTitle("⏰ Scratch Not Ready")
                .setColor(COLORS.WARNING)
                .setDescription(`Come back ${relativeTimestamp(profile.scratch)}`)
        };
    }

    // Generate reward
    const isGold = Math.random() > 0.4;
    const goldReward = Math.floor(Math.random() * (150 - 50 + 1)) + 50;
    const xpReward = Math.floor(Math.random() * (25 - 5 + 1)) + 5;
    // Atomic $inc: dbProfile was hydrated before the 30s wait, so a plain save would overwrite gold/xp changed since
    const fresh = await database.atomicUpdate(dbProfile, {
        $set: { scratch: now + 1000 * 60 * 60 * 8 },
        $inc: isGold ? { gold: goldReward } : { xp: xpReward }
    });
    const goldBefore = fresh.gold - (isGold ? goldReward : 0);
    const xpBefore = fresh.xp - (isGold ? 0 : xpReward);

    // Log action and economy change
    logger.action("scratch", userId, "success", { isGold, reward: isGold ? goldReward : xpReward });
    if (isGold) {
        logger.econ("gold", userId, goldReward, goldBefore, dbProfile.gold, "scratch");
    } else {
        logger.econ("xp", userId, xpReward, xpBefore, dbProfile.xp, "scratch");
    }

    const emoji = isGold ? "💰" : "⭐";
    const value = isGold ? goldReward : xpReward;
    const name = isGold ? "Gold" : "XP";

    return {
        success: true,
        embed: new EmbedBuilder()
            .setTitle("🎰 Scratch Card Revealed!")
            .setColor(COLORS.SUCCESS)
            .setDescription(`You won **${value}** ${emoji} ${name}!`)
            .addFields({
                name: "📊 Balance",
                value: isGold ? beforeAfter(goldBefore, dbProfile.gold, '💰') : beforeAfter(xpBefore, dbProfile.xp, '⭐'),
                inline: true
            })
    };
}

/**
 * Execute harvest action
 */
export async function executeHarvestAction(profile: UserProfile, dbProfile: any, userId: string) {
    // Calculate storage
    let storageCount = 0;
    profile.storage.market_items.forEach((v: StorageItem) => storageCount += v?.amount ?? 0);
    profile.storage.products.forEach((v: StorageItem) => storageCount += v?.amount ?? 0);
    const storageLeft = profile.farm.storage_limit - storageCount;

    if (storageLeft <= 0) {
        return {
            success: false,
            embed: new EmbedBuilder()
                .setTitle("📦 Storage Full!")
                .setColor(COLORS.ERROR)
                .setDescription("Sell some items first with `/sell`!")
        };
    }

    // Harvest
    const harvestedPlants = await database.harvestReadyPlants(dbProfile, storageLeft);
    const harvestedAnimals = await database.gatherReadyProducts(dbProfile, storageLeft - harvestedPlants.length);
    const total = harvestedPlants.length + harvestedAnimals.length;

    if (total === 0) {
        return {
            success: false,
            embed: new EmbedBuilder()
                .setTitle("🌾 Nothing Ready")
                .setColor(COLORS.WARNING)
                .setDescription("No crops or products are ready yet!")
        };
    }

    await database.checkAndRemoveDeadAnimals(dbProfile);
    await database.checkEligibleForlevelUp(dbProfile);

    const xpGained = [...harvestedPlants, ...harvestedAnimals].reduce((sum: number, i: any) => sum + (i.xp_gain || 0), 0);

    // Log action
    logger.action("harvest", userId, "success", { crops: harvestedPlants.length, animals: harvestedAnimals.length, xpGained });

    return {
        success: true,
        embed: new EmbedBuilder()
            .setTitle("🌾 Harvest Complete!")
            .setColor(COLORS.SUCCESS)
            .setDescription(`You harvested **${total}** items!`)
            .addFields(
                { name: "🌱 Crops", value: `${harvestedPlants.length}`, inline: true },
                { name: "🥚 Products", value: `${harvestedAnimals.length}`, inline: true },
                { name: "⭐ XP", value: `+${xpGained}`, inline: true }
            )
    };
}

/**
 * Execute sell all products action
 */
export async function executeSellAction(profile: UserProfile, dbProfile: any, userId: string) {
    const productsModule = require("../../config/items/products.json");
    const productsConfig = productsModule.default || productsModule;
    const products = profile.storage.products || [];

    // Calculate total value and count
    let totalValue = 0;
    let totalCount = 0;
    const soldItems: string[] = [];

    products.forEach((p: any) => {
        if (!p || !p.amount || p.amount <= 0) return;
        const config = productsConfig.find((c: any) => c.name === p.name);
        if (config) {
            const itemValue = config.sell_price * p.amount;
            totalValue += itemValue;
            totalCount += p.amount;
            soldItems.push(`• **${p.amount}x** ${p.name} = ${formatNumber(itemValue)} 🪙`);
        }
    });

    if (totalCount === 0) {
        return {
            success: false,
            embed: new EmbedBuilder()
                .setTitle("📦 Nothing to Sell")
                .setColor(COLORS.WARNING)
                .setDescription("You don't have any products to sell!\n\nHarvest crops and collect animal products first.")
        };
    }

    // Update database
    const goldBefore = dbProfile.gold;
    dbProfile.gold += totalValue;
    dbProfile.storage.products = []; // Clear products
    dbProfile.markModified("gold");
    dbProfile.markModified("storage.products");
    await dbProfile.save();

    // Log action and economy change
    logger.action("sell", userId, "success", { totalCount, totalValue });
    logger.econ("gold", userId, totalValue, goldBefore, dbProfile.gold, "sell");

    return {
        success: true,
        embed: new EmbedBuilder()
            .setTitle("💰 Sold All Products!")
            .setColor(COLORS.SUCCESS)
            .setDescription(`Sold **${totalCount}** items for **${formatNumber(totalValue)}** 🪙!`)
            .addFields(
                { name: "📦 Items Sold", value: soldItems.slice(0, 5).join('\n') + (soldItems.length > 5 ? `\n...and ${soldItems.length - 5} more` : ''), inline: false },
                { name: "💰 Balance", value: beforeAfter(goldBefore, dbProfile.gold, '🪙'), inline: true }
            )
    };
}
