/**
 * UX Helper Functions
 * Provides visual formatting utilities for Discord embeds
 */

/**
 * Create an ASCII progress bar
 * @param current - Current value
 * @param max - Maximum value
 * @param length - Bar length (default 10)
 * @returns Formatted progress bar string
 */
export function createProgressBar(current: number, max: number, length: number = 10): string {
    const percentage = Math.min(Math.max(current / max, 0), 1);
    const filled = Math.round(percentage * length);
    const empty = length - filled;

    const filledChar = '█';
    const emptyChar = '░';

    return `[${filledChar.repeat(filled)}${emptyChar.repeat(empty)}] ${Math.round(percentage * 100)}%`;
}

/**
 * Format a number with commas for readability
 * @param num - Number to format
 * @returns Formatted string (e.g., 1,234,567)
 */
export function formatNumber(num: number): string {
    return num.toLocaleString('en-US');
}

/**
 * Create a Discord timestamp that shows relative time
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Discord formatted timestamp string
 */
export function relativeTimestamp(timestamp: number): string {
    return `<t:${Math.floor(timestamp / 1000)}:R>`;
}

/**
 * Create a Discord timestamp that shows full date/time
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Discord formatted timestamp string
 */
export function fullTimestamp(timestamp: number): string {
    return `<t:${Math.floor(timestamp / 1000)}:F>`;
}

/**
 * Format duration in human readable format
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "2h 30m 15s")
 */
export function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

/**
 * Create a visual storage indicator
 * @param used - Used storage slots
 * @param total - Total storage capacity
 * @returns Formatted storage string
 */
export function storageIndicator(used: number, total: number): string {
    const percentage = Math.round((used / total) * 100);
    let emoji = '🟢'; // Green - plenty of space

    if (percentage >= 90) {
        emoji = '🔴'; // Red - almost full
    } else if (percentage >= 70) {
        emoji = '🟠'; // Orange - getting full
    } else if (percentage >= 50) {
        emoji = '🟡'; // Yellow - half full
    }

    return `${emoji} ${used}/${total} items`;
}

/**
 * Get emoji for item type
 * @param type - Item type string
 * @returns Appropriate emoji
 */
export function getItemEmoji(type: string): string {
    const emojis: Record<string, string> = {
        'seeds': '🌱',
        'crops': '🌾',
        'animals': '🐔',
        'animal_products': '🥚',
        'chicken': '🐔',
        'cow': '🐄',
        'pig': '🐷',
        'sheep': '🐑',
        'wheat': '🌾',
        'corn': '🌽',
        'carrot': '🥕',
        'potato': '🥔',
        'tomato': '🍅',
        'egg': '🥚',
        'milk': '🥛',
        'wool': '🧶',
        'gold': '🪙',
        'xp': '⭐'
    };

    return emojis[type.toLowerCase()] || '📦';
}

/**
 * Create a before/after comparison string
 * @param before - Value before change
 * @param after - Value after change
 * @param emoji - Emoji to use
 * @returns Formatted comparison string
 */
export function beforeAfter(before: number, after: number, emoji: string = '💰'): string {
    const diff = after - before;
    const sign = diff >= 0 ? '+' : '';
    return `${emoji} **${formatNumber(before)}** → **${formatNumber(after)}** (${sign}${formatNumber(diff)})`;
}

/**
 * Get a random tip for the footer
 * @returns Random farming tip string
 */
export function getRandomTip(): string {
    const tips = [
        '💡 Tip: Feed your animals daily to boost production!',
        '💡 Tip: Use /scratch every 8 hours for bonus gold!',
        '💡 Tip: Higher level farms have more storage space.',
        '💡 Tip: Pet your animals to increase their happiness!',
        '💡 Tip: Clean your animal areas for production boosts.',
        '💡 Tip: Check /market for the best deals!',
        '💡 Tip: Upgrade your farm to unlock more slots.',
        '💡 Tip: Harvest crops as soon as they\'re ready!',
        '💡 Tip: Trade with other farmers for rare items.',
        '💡 Tip: Daily rewards increase with your level!'
    ];

    return tips[Math.floor(Math.random() * tips.length)];
}

// Import market items for ready_time lookup
import marketItems from "../config/items/market_items.json";

interface GrowingItem {
    name: string;      // Item name (e.g., "Wheat", "Chicken")
    gives?: string;    // What it produces
    ready_at: number;  // Timestamp when ready
}

/**
 * Create a visual growing items progress list
 * Shows crops/animals with progress bars and time remaining
 * @param crops - Array of growing crops
 * @param animals - Array of growing animals  
 * @returns Formatted string with progress bars
 */
export function createGrowingList(
    crops: GrowingItem[],
    animals: GrowingItem[]
): string {
    const now = Date.now();
    const items: { name: string; emoji: string; progress: number; timeLeft: number; ready: boolean }[] = [];

    // Process crops (lookup by 'gives' field which matches crop name)
    for (const crop of crops) {
        const itemName = crop.gives || crop.name;
        const seedName = `${itemName} Seeds`;
        const marketItem = marketItems.find((m: any) =>
            m.name === seedName || m.gives === itemName
        );

        if (marketItem) {
            const readyTime = marketItem.ready_time;
            const plantedAt = crop.ready_at - readyTime;
            const elapsed = now - plantedAt;
            const progress = Math.min(Math.max(elapsed / readyTime, 0), 1);
            const timeLeft = Math.max(crop.ready_at - now, 0);

            items.push({
                name: itemName,
                emoji: getItemEmoji(itemName),
                progress,
                timeLeft,
                ready: now >= crop.ready_at
            });
        }
    }

    // Process animals (lookup by name)
    for (const animal of animals) {
        const marketItem = marketItems.find((m: any) => m.name === animal.name);

        if (marketItem) {
            const readyTime = marketItem.ready_time;
            const raisedAt = animal.ready_at - readyTime;
            const elapsed = now - raisedAt;
            const progress = Math.min(Math.max(elapsed / readyTime, 0), 1);
            const timeLeft = Math.max(animal.ready_at - now, 0);

            items.push({
                name: animal.name,
                emoji: getItemEmoji(animal.name),
                progress,
                timeLeft,
                ready: now >= animal.ready_at
            });
        }
    }

    if (items.length === 0) {
        return "No items growing";
    }

    // Sort: ready items first, then by time left (ascending)
    items.sort((a, b) => {
        if (a.ready !== b.ready) return a.ready ? -1 : 1;
        return a.timeLeft - b.timeLeft;
    });

    // Build display string
    const lines: string[] = [];
    const readyCount = items.filter(i => i.ready).length;
    const growingCount = items.length - readyCount;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const isLast = i === items.length - 1;
        const prefix = isLast ? '└' : '├';

        if (item.ready) {
            lines.push(`${prefix} ${item.emoji} **${item.name}** ✅ Ready!`);
        } else {
            const barLength = 8;
            const filled = Math.round(item.progress * barLength);
            const empty = barLength - filled;
            const bar = '█'.repeat(filled) + '░'.repeat(empty);
            const percent = Math.round(item.progress * 100);
            const timeStr = formatDuration(item.timeLeft);

            lines.push(`${prefix} ${item.emoji} ${item.name} ${bar} ${percent}% (${timeStr})`);
        }
    }

    // Header with counts
    let header = `🌱 **Growing** (${items.length})`;
    if (readyCount > 0) {
        header = `🌾 **Growing** (${growingCount} growing, ${readyCount} ready)`;
    }

    return header + '\n' + lines.join('\n');
}

