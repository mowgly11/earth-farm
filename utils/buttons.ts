/**
 * Button Templates & Safe Collector Utilities
 * Centralizes button creation and provides safe collector wrappers.
 */

import { ButtonBuilder, ActionRowBuilder, Message, ComponentType, MessageFlags, ButtonStyle } from "discord.js";

// Button style constants (re-export for convenience)
export const BTN_STYLE = {
    PRIMARY: ButtonStyle.Primary,
    SUCCESS: ButtonStyle.Success,
    SECONDARY: ButtonStyle.Secondary,
    DANGER: ButtonStyle.Danger,
};

// --- Button Templates ---

export const BUTTONS = {
    // Navigation buttons (handled globally in index.ts)
    dashboard: () => new ButtonBuilder()
        .setCustomId("nav:dashboard")
        .setLabel("Dashboard")
        .setEmoji("📊")
        .setStyle(BTN_STYLE.SECONDARY),

    market: () => new ButtonBuilder()
        .setCustomId("nav:market")
        .setLabel("Market")
        .setEmoji("🛒")
        .setStyle(BTN_STYLE.PRIMARY),

    marketBuy: () => new ButtonBuilder()
        .setCustomId("nav:market")
        .setLabel("Buy Animals")
        .setEmoji("🛒")
        .setStyle(BTN_STYLE.PRIMARY),

    farm: () => new ButtonBuilder()
        .setCustomId("nav:farm")
        .setLabel("View Farm")
        .setEmoji("🌱")
        .setStyle(BTN_STYLE.PRIMARY),

    farmer: () => new ButtonBuilder()
        .setCustomId("nav:farmer")
        .setLabel("Create Profile")
        .setEmoji("👤")
        .setStyle(BTN_STYLE.SUCCESS),

    harvest: () => new ButtonBuilder()
        .setCustomId("nav:harvest")
        .setLabel("Harvest")
        .setEmoji("🌾")
        .setStyle(BTN_STYLE.SUCCESS),

    sell: () => new ButtonBuilder()
        .setCustomId("nav:sell")
        .setLabel("Sell")
        .setEmoji("💰")
        .setStyle(BTN_STYLE.SUCCESS),

    barn: () => new ButtonBuilder()
        .setCustomId("nav:barn")
        .setLabel("Barn")
        .setEmoji("🐔")
        .setStyle(BTN_STYLE.SECONDARY),

    leaderboard: () => new ButtonBuilder()
        .setCustomId("nav:leaderboard")
        .setLabel("Leaderboard")
        .setEmoji("🏆")
        .setStyle(BTN_STYLE.SECONDARY),

    plant: () => new ButtonBuilder()
        .setCustomId("nav:plant")
        .setLabel("Plant")
        .setEmoji("🌱")
        .setStyle(BTN_STYLE.PRIMARY),

    daily: () => new ButtonBuilder()
        .setCustomId("nav:daily")
        .setLabel("Daily")
        .setEmoji("🎁")
        .setStyle(BTN_STYLE.SUCCESS),

    scratch: () => new ButtonBuilder()
        .setCustomId("nav:scratch")
        .setLabel("Scratch")
        .setEmoji("🎰")
        .setStyle(BTN_STYLE.SUCCESS),

    help: () => new ButtonBuilder()
        .setCustomId("nav:help")
        .setLabel("Help")
        .setEmoji("❓")
        .setStyle(BTN_STYLE.SECONDARY),

    createFarm: (userId: string) => new ButtonBuilder()
        .setCustomId(`onboard:create:${userId}`)
        .setLabel("Create My Farm")
        .setEmoji("🌾")
        .setStyle(BTN_STYLE.SUCCESS),

    learnMore: () => new ButtonBuilder()
        .setCustomId("nav:help")
        .setLabel("Learn More")
        .setEmoji("❓")
        .setStyle(BTN_STYLE.SECONDARY),

    // Animal care buttons
    feed: () => new ButtonBuilder()
        .setCustomId("nav:feed")
        .setLabel("Feed")
        .setEmoji("🍖")
        .setStyle(BTN_STYLE.SUCCESS),

    feedInstead: () => new ButtonBuilder()
        .setCustomId("nav:feed")
        .setLabel("Feed Instead")
        .setEmoji("🍖")
        .setStyle(BTN_STYLE.SUCCESS),

    pet: () => new ButtonBuilder()
        .setCustomId("nav:pet")
        .setLabel("Pet")
        .setEmoji("❤️")
        .setStyle(BTN_STYLE.SUCCESS),

    petInstead: () => new ButtonBuilder()
        .setCustomId("nav:pet")
        .setLabel("Pet Instead")
        .setEmoji("❤️")
        .setStyle(BTN_STYLE.SUCCESS),

    clean: () => new ButtonBuilder()
        .setCustomId("nav:clean")
        .setLabel("Clean")
        .setEmoji("🧹")
        .setStyle(BTN_STYLE.SUCCESS),

    cleanInstead: () => new ButtonBuilder()
        .setCustomId("nav:clean")
        .setLabel("Clean Instead")
        .setEmoji("🧹")
        .setStyle(BTN_STYLE.SUCCESS),

    // Alternate labels
    viewBarn: () => new ButtonBuilder()
        .setCustomId("nav:barn")
        .setLabel("View Barn")
        .setEmoji("🐔")
        .setStyle(BTN_STYLE.PRIMARY),

    harvestNow: () => new ButtonBuilder()
        .setCustomId("nav:harvest")
        .setLabel("Harvest Now")
        .setEmoji("🌾")
        .setStyle(BTN_STYLE.SUCCESS),

    harvestFirst: () => new ButtonBuilder()
        .setCustomId("nav:harvest")
        .setLabel("Harvest First")
        .setEmoji("🌾")
        .setStyle(BTN_STYLE.SUCCESS),

    buySeeds: () => new ButtonBuilder()
        .setCustomId("nav:market")
        .setLabel("Buy Seeds")
        .setEmoji("🛒")
        .setStyle(BTN_STYLE.PRIMARY),

    upgradeFarm: () => new ButtonBuilder()
        .setCustomId("nav:upgradefarm")
        .setLabel("Upgrade Farm")
        .setEmoji("⏫")
        .setStyle(BTN_STYLE.PRIMARY),

    plantMore: () => new ButtonBuilder()
        .setCustomId("nav:plant")
        .setLabel("Plant More")
        .setEmoji("🌿")
        .setStyle(BTN_STYLE.SUCCESS),

    // Animal management
    raise: () => new ButtonBuilder()
        .setCustomId("nav:raise")
        .setLabel("Raise Animal")
        .setEmoji("🐄")
        .setStyle(BTN_STYLE.SUCCESS),

    raiseAnother: () => new ButtonBuilder()
        .setCustomId("nav:raise")
        .setLabel("Raise Another")
        .setEmoji("🐄")
        .setStyle(BTN_STYLE.SUCCESS),

    unraise: () => new ButtonBuilder()
        .setCustomId("nav:unraise")
        .setLabel("Remove Animal")
        .setEmoji("🔄")
        .setStyle(BTN_STYLE.PRIMARY),

    sellItems: () => new ButtonBuilder()
        .setCustomId("nav:sell")
        .setLabel("Sell Items")
        .setEmoji("💰")
        .setStyle(BTN_STYLE.SUCCESS),

    harvestXp: () => new ButtonBuilder()
        .setCustomId("nav:harvest")
        .setLabel("Harvest (XP)")
        .setEmoji("🌾")
        .setStyle(BTN_STYLE.SUCCESS),

    claimDaily: () => new ButtonBuilder()
        .setCustomId("nav:daily")
        .setLabel("Claim Daily")
        .setEmoji("🎁")
        .setStyle(BTN_STYLE.SUCCESS),

    dashboardRefresh: () => new ButtonBuilder()
        .setCustomId("dashboard:refresh")
        .setLabel("Refresh")
        .setEmoji("🔄")
        .setStyle(BTN_STYLE.SECONDARY),

    scratchReveal: (userId: string) => new ButtonBuilder()
        .setCustomId(`scratch_reveal:${userId}`)
        .setLabel("🎰 Scratch Card!")
        .setEmoji("✨")
        .setStyle(BTN_STYLE.SUCCESS),

    backDashboard: () => new ButtonBuilder()
        .setCustomId("nav:dashboard")
        .setLabel("← Back to Dashboard")
        .setEmoji("🏠")
        .setStyle(BTN_STYLE.PRIMARY),
};

// --- Dashboard Buttons (view:/care: prefixes) ---

export const DASHBOARD_BUTTONS = {
    // Action buttons (row 1)
    viewDaily: (userId: string) => new ButtonBuilder()
        .setCustomId(`view:daily:${userId}`)
        .setLabel("Daily").setEmoji("🎁")
        .setStyle(BTN_STYLE.SUCCESS),

    viewScratch: (userId: string) => new ButtonBuilder()
        .setCustomId(`view:scratch:${userId}`)
        .setLabel("Scratch").setEmoji("🎰")
        .setStyle(BTN_STYLE.SUCCESS),

    viewHarvest: (userId: string) => new ButtonBuilder()
        .setCustomId(`view:harvest:${userId}`)
        .setLabel("Harvest").setEmoji("🌾")
        .setStyle(BTN_STYLE.SUCCESS),

    viewSell: (userId: string) => new ButtonBuilder()
        .setCustomId(`view:sell:${userId}`)
        .setLabel("Sell").setEmoji("💰")
        .setStyle(BTN_STYLE.SUCCESS),

    // Navigation buttons (row 2)
    viewMarket: (userId: string) => new ButtonBuilder()
        .setCustomId(`view:market:${userId}`)
        .setLabel("Market").setEmoji("🛒")
        .setStyle(BTN_STYLE.PRIMARY),

    viewProfile: (userId: string) => new ButtonBuilder()
        .setCustomId(`view:profile:${userId}`)
        .setLabel("Profile").setEmoji("👨‍🌾")
        .setStyle(BTN_STYLE.PRIMARY),

    viewStorage: (userId: string) => new ButtonBuilder()
        .setCustomId(`view:storage:${userId}`)
        .setLabel("Storage").setEmoji("📦")
        .setStyle(BTN_STYLE.SECONDARY),

    viewRefresh: (userId: string) => new ButtonBuilder()
        .setCustomId(`view:refresh:${userId}`)
        .setLabel("Refresh").setEmoji("🔄")
        .setStyle(BTN_STYLE.SECONDARY),

    // Care buttons (row 3)
    careFeed: (userId: string) => new ButtonBuilder()
        .setCustomId(`care:feed:${userId}`)
        .setLabel("Feed All").setEmoji("🍖")
        .setStyle(BTN_STYLE.SUCCESS),

    carePet: (userId: string) => new ButtonBuilder()
        .setCustomId(`care:pet:${userId}`)
        .setLabel("Pet All").setEmoji("❤️")
        .setStyle(BTN_STYLE.SUCCESS),

    careClean: (userId: string) => new ButtonBuilder()
        .setCustomId(`care:clean:${userId}`)
        .setLabel("Clean All").setEmoji("🧹")
        .setStyle(BTN_STYLE.SUCCESS),

    // Extra navigation (row 4)
    viewFarm: (userId: string) => new ButtonBuilder()
        .setCustomId(`view:farm:${userId}`)
        .setLabel("Farm").setEmoji("🌱")
        .setStyle(BTN_STYLE.SECONDARY),

    viewBarn: (userId: string) => new ButtonBuilder()
        .setCustomId(`view:barn:${userId}`)
        .setLabel("Barn").setEmoji("🐔")
        .setStyle(BTN_STYLE.SECONDARY),

    viewLeaderboard: (userId: string) => new ButtonBuilder()
        .setCustomId(`view:leaderboard:${userId}`)
        .setLabel("Ranks").setEmoji("📊")
        .setStyle(BTN_STYLE.SECONDARY),

    viewUpgrade: (userId: string) => new ButtonBuilder()
        .setCustomId(`view:upgrade:${userId}`)
        .setLabel("Upgrade").setEmoji("⏫")
        .setStyle(BTN_STYLE.SECONDARY),

    // Main dashboard button
    viewMain: (userId: string) => new ButtonBuilder()
        .setCustomId(`view:main:${userId}`)
        .setLabel("Dashboard").setEmoji("🏠")
        .setStyle(BTN_STYLE.SECONDARY),
};

// --- Confirmation Buttons ---

export const CONFIRM_BUTTONS = {
    confirm: () => new ButtonBuilder()
        .setCustomId("confirm")
        .setLabel("Confirm")
        .setStyle(BTN_STYLE.SUCCESS),

    cancel: () => new ButtonBuilder()
        .setCustomId("cancel")
        .setLabel("Cancel")
        .setStyle(BTN_STYLE.DANGER),

    accept: () => new ButtonBuilder()
        .setCustomId("accept")
        .setLabel("Accept")
        .setEmoji("✅")
        .setStyle(BTN_STYLE.SUCCESS),

    deny: () => new ButtonBuilder()
        .setCustomId("deny")
        .setLabel("Deny")
        .setEmoji("❌")
        .setStyle(BTN_STYLE.DANGER),
};

// --- Pagination Buttons ---

export const PAGINATION_BUTTONS = {
    first: (disabled: boolean = false) => new ButtonBuilder()
        .setCustomId("page:first")
        .setLabel("◀◀")
        .setStyle(BTN_STYLE.SECONDARY)
        .setDisabled(disabled),

    prev: (disabled: boolean = false) => new ButtonBuilder()
        .setCustomId("page:prev")
        .setLabel("◀")
        .setStyle(BTN_STYLE.PRIMARY)
        .setDisabled(disabled),

    pageInfo: (current: number, total: number) => new ButtonBuilder()
        .setCustomId("page:info")
        .setLabel(`${current}/${total}`)
        .setStyle(BTN_STYLE.SECONDARY)
        .setDisabled(true),

    next: (disabled: boolean = false) => new ButtonBuilder()
        .setCustomId("page:next")
        .setLabel("▶")
        .setStyle(BTN_STYLE.PRIMARY)
        .setDisabled(disabled),

    last: (disabled: boolean = false) => new ButtonBuilder()
        .setCustomId("page:last")
        .setLabel("▶▶")
        .setStyle(BTN_STYLE.SECONDARY)
        .setDisabled(disabled),
};

// --- Leaderboard Pagination ---

export const LEADERBOARD_BUTTONS = {
    first: (disabled: boolean = false) => new ButtonBuilder()
        .setCustomId("lb_first")
        .setLabel("⏮️")
        .setStyle(BTN_STYLE.SECONDARY)
        .setDisabled(disabled),

    prev: (disabled: boolean = false) => new ButtonBuilder()
        .setCustomId("lb_prev")
        .setLabel("◀️ Prev")
        .setStyle(BTN_STYLE.PRIMARY)
        .setDisabled(disabled),

    pageInfo: (current: number, total: number) => new ButtonBuilder()
        .setCustomId("lb_page")
        .setLabel(`${current + 1} / ${total}`)
        .setStyle(BTN_STYLE.SECONDARY)
        .setDisabled(true),

    next: (disabled: boolean = false) => new ButtonBuilder()
        .setCustomId("lb_next")
        .setLabel("Next ▶️")
        .setStyle(BTN_STYLE.PRIMARY)
        .setDisabled(disabled),

    last: (disabled: boolean = false) => new ButtonBuilder()
        .setCustomId("lb_last")
        .setLabel("⏭️")
        .setStyle(BTN_STYLE.SECONDARY)
        .setDisabled(disabled),
};

// --- Market Buttons ---

export const MARKET_BUTTONS = {
    home: (active: boolean = false) => new ButtonBuilder()
        .setCustomId("main")
        .setLabel("Home").setEmoji("🏪")
        .setStyle(active ? BTN_STYLE.SUCCESS : BTN_STYLE.SECONDARY),

    animals: (active: boolean = false) => new ButtonBuilder()
        .setCustomId("animals")
        .setLabel("Animals").setEmoji("🐔")
        .setStyle(active ? BTN_STYLE.SUCCESS : BTN_STYLE.SECONDARY),

    seeds: (active: boolean = false) => new ButtonBuilder()
        .setCustomId("seeds")
        .setLabel("Seeds").setEmoji("🌱")
        .setStyle(active ? BTN_STYLE.SUCCESS : BTN_STYLE.SECONDARY),

    upgrades: (active: boolean = false) => new ButtonBuilder()
        .setCustomId("upgrades")
        .setLabel("Upgrades").setEmoji("⏫")
        .setStyle(active ? BTN_STYLE.SUCCESS : BTN_STYLE.SECONDARY),

    buyAmount: (amount: number | string, userId: string) => new ButtonBuilder()
        .setCustomId(`buy:${amount}:${userId}`)
        .setLabel(`Buy ${amount}`)
        .setEmoji("🛒")
        .setStyle(BTN_STYLE.SUCCESS),
};

// --- Sell Buttons ---

export const SELL_BUTTONS = {
    sellOne: (userId: string) => new ButtonBuilder()
        .setCustomId(`sellnow:1:${userId}`)
        .setLabel("Sell 1")
        .setEmoji("💰")
        .setStyle(BTN_STYLE.SUCCESS),

    sellFive: (userId: string) => new ButtonBuilder()
        .setCustomId(`sellnow:5:${userId}`)
        .setLabel("Sell 5")
        .setEmoji("💰")
        .setStyle(BTN_STYLE.SUCCESS),

    sellAll: (userId: string) => new ButtonBuilder()
        .setCustomId(`sellnow:all:${userId}`)
        .setLabel("Sell All")
        .setEmoji("💰")
        .setStyle(BTN_STYLE.PRIMARY),
};

// --- Help Buttons ---

export const HELP_BUTTONS = {
    economy: (userId: string, active: boolean = false) => new ButtonBuilder()
        .setCustomId(`help:economy:${userId}`)
        .setLabel("Economy")
        .setEmoji("💰")
        .setStyle(active ? BTN_STYLE.SUCCESS : BTN_STYLE.SECONDARY),

    farming: (userId: string, active: boolean = false) => new ButtonBuilder()
        .setCustomId(`help:farming:${userId}`)
        .setLabel("Farming")
        .setEmoji("🌱")
        .setStyle(active ? BTN_STYLE.SUCCESS : BTN_STYLE.SECONDARY),

    animals: (userId: string, active: boolean = false) => new ButtonBuilder()
        .setCustomId(`help:animals:${userId}`)
        .setLabel("Animals")
        .setEmoji("🐔")
        .setStyle(active ? BTN_STYLE.SUCCESS : BTN_STYLE.SECONDARY),

    stats: (userId: string, active: boolean = false) => new ButtonBuilder()
        .setCustomId(`help:stats:${userId}`)
        .setLabel("Stats")
        .setEmoji("📊")
        .setStyle(active ? BTN_STYLE.SUCCESS : BTN_STYLE.SECONDARY),

    other: (userId: string, active: boolean = false) => new ButtonBuilder()
        .setCustomId(`help:other:${userId}`)
        .setLabel("Other")
        .setEmoji("⚙️")
        .setStyle(active ? BTN_STYLE.SUCCESS : BTN_STYLE.SECONDARY),

    overview: (userId: string, active: boolean = false) => new ButtonBuilder()
        .setCustomId(`help:overview:${userId}`)
        .setLabel("Overview")
        .setEmoji("🏠")
        .setStyle(active ? BTN_STYLE.PRIMARY : BTN_STYLE.SECONDARY),
};

// --- Scratch Buttons ---

export const SCRATCH_BUTTONS = {
    scratch: () => new ButtonBuilder()
        .setCustomId("scratch")
        .setLabel("🎰 Scratch Card!")
        .setEmoji("✨")
        .setStyle(BTN_STYLE.SUCCESS),
};

// --- Views Market Buttons (market: prefix) ---

export const VIEWS_MARKET_BUTTONS = {
    home: (active: boolean = false) => new ButtonBuilder()
        .setCustomId("market:main")
        .setLabel("Home").setEmoji("🏪")
        .setStyle(active ? BTN_STYLE.SUCCESS : BTN_STYLE.SECONDARY),

    animals: (active: boolean = false) => new ButtonBuilder()
        .setCustomId("market:animals")
        .setLabel("Animals").setEmoji("🐔")
        .setStyle(active ? BTN_STYLE.SUCCESS : BTN_STYLE.SECONDARY),

    seeds: (active: boolean = false) => new ButtonBuilder()
        .setCustomId("market:seeds")
        .setLabel("Seeds").setEmoji("🌱")
        .setStyle(active ? BTN_STYLE.SUCCESS : BTN_STYLE.SECONDARY),

    upgrades: (active: boolean = false) => new ButtonBuilder()
        .setCustomId("market:upgrades")
        .setLabel("Upgrades").setEmoji("⏫")
        .setStyle(active ? BTN_STYLE.SUCCESS : BTN_STYLE.SECONDARY),

    buyAmount: (amount: number | string, userId: string) => new ButtonBuilder()
        .setCustomId(`market:buy:${amount}:${userId}`)
        .setLabel(`Buy ${amount}`)
        .setEmoji("🛒")
        .setStyle(BTN_STYLE.SUCCESS),
};

// --- Common Button Rows ---

/**
 * Standard navigation row: Dashboard, Market, Farm
 */
export function createNavRow() {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        BUTTONS.dashboard(),
        BUTTONS.market(),
        BUTTONS.farm()
    );
}

/**
 * Action row: Harvest, Sell, Dashboard
 */
export function createActionRow() {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        BUTTONS.harvest(),
        BUTTONS.sell(),
        BUTTONS.dashboard()
    );
}

/**
 * Farm action row: Harvest, Plant, Dashboard
 */
export function createFarmActionRow() {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        BUTTONS.harvest(),
        BUTTONS.plant(),
        BUTTONS.dashboard()
    );
}

/**
 * Barn action row: Harvest, Sell, Dashboard
 */
export function createBarnActionRow() {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        BUTTONS.harvest(),
        BUTTONS.sell(),
        BUTTONS.dashboard()
    );
}

// --- Safe Collector Utilities ---

export interface SafeCollectorOptions {
    message: Message;
    userId: string;
    time?: number;
    onCollect: (interaction: any) => Promise<void>;
    onEnd?: () => Promise<void>;
    disableOnEnd?: boolean;
}

/**
 * Creates a message component collector with built-in error handling.
 * 
 * Features:
 * - Catches errors in onCollect callback
 * - Always runs onEnd cleanup
 * - Optionally disables components on timeout
 * 
 * @example
 * createSafeCollector({
 *     message,
 *     userId: interaction.user.id,
 *     time: 300000,
 *     onCollect: async (i) => {
 *         await i.deferUpdate();
 *         // Handle interaction
 *     },
 *     onEnd: async () => {
 *         // Optional cleanup
 *     }
 * });
 */
export function createSafeCollector(options: SafeCollectorOptions) {
    const collector = options.message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === options.userId,
        time: options.time ?? 300000, // 5 min default
    });

    collector.on("collect", async (i) => {
        try {
            await options.onCollect(i);
        } catch (error) {
            console.error("[COLLECTOR ERROR]", error);
            // Don't crash - attempt ephemeral error reply
            if (!i.replied && !i.deferred) {
                await i.reply({
                    content: "❌ Something went wrong!",
                    flags: MessageFlags.Ephemeral
                }).catch(() => { });
            }
        }
    });

    // Always handle 'end' event
    collector.on("end", async () => {
        try {
            if (options.onEnd) {
                await options.onEnd();
            }
            // Remove/disable components on timeout
            if (options.disableOnEnd !== false) {
                await options.message.edit({ components: [] }).catch(() => { });
            }
        } catch (error) {
            console.error("[COLLECTOR END ERROR]", error);
        }
    });

    return collector;
}

/**
 * Safe wrapper for awaitMessageComponent.
 * Returns null on timeout instead of throwing.
 * 

 * 
 * @example
 * const interaction = await awaitComponentSafe(message, {
 *     userId: user.id,
 *     time: 30000
 * });
 * 
 * if (!interaction) {
 *     // Timeout - handle gracefully
 *     return;
 * }
 */
export async function awaitComponentSafe(
    message: Message,
    options: { userId: string; time?: number }
): Promise<any | null> {
    const filter = (i: any) => {
        i.deferUpdate().catch(() => { });
        return i.user.id === options.userId;
    };

    try {
        return await message.awaitMessageComponent({
            filter,
            time: options.time ?? 30000
        });
    } catch {
        // Timeout - return null
        return null;
    }
}

/**
 * Disables all buttons in an ActionRow.
 * 
 * @example
 * const disabledRow = disableRow(row);
 */
export function disableRow(row: ActionRowBuilder<ButtonBuilder>): ActionRowBuilder<ButtonBuilder> {
    row.components.forEach(button => {
        if ('setDisabled' in button) {
            button.setDisabled(true);
        }
    });
    return row;
}
