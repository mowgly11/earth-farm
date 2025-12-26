/**
 * Centralized constants for Earth Farm bot
 * Reduces duplication and ensures consistency
 */

// ============ BOT INFO ============
export const BOT_VERSION = "0.0.6";

// ============ ERROR MESSAGES ============
export const ERRORS = {
    GENERIC: "An error occurred while processing your request.",
    NO_PROFILE: "Please create a profile first using `/farmer`!",
    STORAGE_FULL: "Your storage is full! Sell some items before continuing.",
    ITEM_NOT_FOUND: (item: string) => `You don't own any **${item}**.`,
    NOT_ENOUGH_ITEMS: (item: string, have: number, need: number) =>
        `Not enough **${item}**! You have **${have}** but need **${need}**.`,
    NOT_ENOUGH_GOLD: (price: number) =>
        `You don't have enough gold! This costs **${price}** 🪙`,
    SLOT_EMPTY: (slot: number) => `There is no animal in slot **${slot}**.`,
    SLOTS_FULL: "All slots are occupied!",
    LEVEL_REQUIRED: (level: number) =>
        `You need to be level **${level}** to use this!`,
};

// ============ SUCCESS MESSAGES ============
export const SUCCESS = {
    ITEM_BOUGHT: (item: string, quantity: number, price: number) =>
        `Successfully bought **${quantity}x ${item}** for **${price}** 🪙`,
    ITEM_SOLD: (item: string, quantity: number, price: number) =>
        `Successfully sold **${quantity}x ${item}** for **${price}** 🪙`,
    ANIMAL_RAISED: (animal: string, readyTime: number) =>
        `Successfully raised **${animal}**! It will produce goods every **${readyTime / 1000 / 60}** minutes.`,
    ANIMAL_UNRAISED: (animal: string) =>
        `Successfully returned **${animal}** to your storage.`,
    SEED_PLANTED: (seed: string, quantity: number) =>
        `Successfully planted **${quantity}x ${seed}**!`,
};

// ============ EMBED COLORS ============
export const COLORS = {
    PRIMARY: 0xFFD700,    // Gold - Main theme
    SUCCESS: 0x00FF00,    // Green - Success states
    ERROR: 0xFF0000,      // Red - Errors
    WARNING: 0xFFA500,    // Orange - Warnings
    INFO: 0x5865F2,       // Discord Blurple - Information
} as const;

// ============ EMOJIS ============
export const EMOJIS = {
    GOLD: "🪙",
    XP: "✨",
    LEVEL_UP: "🎉",
    FARM: "🌾",
    ANIMAL: "🐔",
    PLANT: "🌱",
    HARVEST: "🌾",
    WARNING: "⚠️",
    SUCCESS: "✅",
    ERROR: "❌",
} as const;

// ============ TIMEOUTS ============
export const TIMEOUTS = {
    BUTTON_COLLECTOR: 60000,      // 60 seconds
    TRADE_COLLECTOR: 120000,      // 2 minutes
    SCRATCH_COLLECTOR: 30000,     // 30 seconds
    CONFIRMATION: 30000,          // 30 seconds
} as const;
