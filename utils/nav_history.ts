/**
 * Navigation History Manager
 * Tracks user navigation history per message/widget for back button functionality.
 * 
 * Key: "userId:messageId" → Isolated history per widget instance
 * Features: Max 10 entries, 30min TTL, periodic cleanup
 */

import { logger } from './logger.ts';
import { ActionRowBuilder, ButtonBuilder } from 'discord.js';
import { BUTTONS } from './buttons.ts';

// --- Types ---

export type ViewName =
    | 'dashboard'
    | 'farm'
    | 'barn'
    | 'leaderboard'
    | 'storage'
    | 'profile'
    | 'market'
    | 'harvest_result'
    | 'sell_result'
    | 'daily_result'
    | 'scratch_result';

interface HistoryEntry {
    stack: ViewName[];
    lastActivity: number;
}

// --- Configuration ---

const MAX_STACK_SIZE = 10;
const TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// --- State ---

const navHistory = new Map<string, HistoryEntry>();
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

// --- Key Generation ---

function getKey(userId: string, messageId: string): string {
    return `${userId}:${messageId}`;
}

// --- Core Functions ---

/**
 * Push current view to history before navigating away.
 * @returns New stack depth
 */
export function pushView(userId: string, messageId: string, view: ViewName): number {
    const key = getKey(userId, messageId);
    const now = Date.now();

    let entry = navHistory.get(key);
    if (!entry) {
        entry = { stack: [], lastActivity: now };
        navHistory.set(key, entry);
    }

    // Update activity timestamp
    entry.lastActivity = now;

    // Don't push duplicate consecutive views
    if (entry.stack[entry.stack.length - 1] !== view) {
        entry.stack.push(view);

        // Enforce max size (drop oldest)
        if (entry.stack.length > MAX_STACK_SIZE) {
            entry.stack.shift();
        }
    }

    return entry.stack.length;
}

/**
 * Pop and return previous view.
 * @returns Previous view name or null if stack is empty
 */
export function popView(userId: string, messageId: string): ViewName | null {
    const key = getKey(userId, messageId);
    const entry = navHistory.get(key);

    if (!entry || entry.stack.length === 0) {
        return null;
    }

    entry.lastActivity = Date.now();
    return entry.stack.pop() || null;
}

/**
 * Get current history depth for showing/hiding back button.
 */
export function getDepth(userId: string, messageId: string): number {
    const key = getKey(userId, messageId);
    const entry = navHistory.get(key);
    return entry?.stack.length || 0;
}

/**
 * Peek at current view without removing it.
 */
export function peekView(userId: string, messageId: string): ViewName | null {
    const key = getKey(userId, messageId);
    const entry = navHistory.get(key);
    if (!entry || entry.stack.length === 0) return null;
    return entry.stack[entry.stack.length - 1];
}

/**
 * Clear history for a specific widget (call on collector.on('end')).
 */
export function clearWidget(userId: string, messageId: string): void {
    const key = getKey(userId, messageId);
    navHistory.delete(key);
}

// --- Cleanup Functions ---

/**
 * Remove stale entries (older than TTL).
 * Called periodically by cleanup interval.
 */
function cleanupStale(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of navHistory) {
        if (now - entry.lastActivity > TTL_MS) {
            navHistory.delete(key);
            cleaned++;
        }
    }

    if (cleaned > 0) {
        logger.debug(`NavHistory: Cleaned ${cleaned} stale entries`, { remaining: navHistory.size });
    }
}

/**
 * Start periodic cleanup interval.
 * Call once on bot startup.
 */
export function startCleanupInterval(): void {
    if (cleanupInterval) return; // Already running

    cleanupInterval = setInterval(cleanupStale, CLEANUP_INTERVAL_MS);
    logger.info('NavHistory: Cleanup interval started');
}

/**
 * Stop cleanup interval.
 * Call on graceful shutdown.
 */
export function stopCleanupInterval(): void {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
        logger.info('NavHistory: Cleanup interval stopped');
    }
}

// --- Monitoring ---

/**
 * Get statistics for monitoring memory usage.
 */
export function getStats(): { widgetCount: number; totalEntries: number } {
    let totalEntries = 0;
    for (const entry of navHistory.values()) {
        totalEntries += entry.stack.length;
    }
    return {
        widgetCount: navHistory.size,
        totalEntries
    };
}

// --- Back Button Utility ---

/**
 * Add back button to components if history exists.
 * Call this when rendering any view that should support back navigation.
 * 
 * @param components - Existing component rows
 * @param userId - User ID for history lookup
 * @param messageId - Optional message ID (if undefined, no back button added)
 * @returns Components with back button added if history exists
 */
export function addBackButton(
    components: ActionRowBuilder<ButtonBuilder>[],
    userId: string,
    messageId?: string
): ActionRowBuilder<ButtonBuilder>[] {
    // No messageId = can't track history = no back button
    if (!messageId) return components;

    // No history = no back button
    const depth = getDepth(userId, messageId);
    if (depth <= 0) return components;

    const backBtn = BUTTONS.backHistory(userId, messageId);

    // Find a row with space (< 5 buttons) or create new row
    const lastRow = components[components.length - 1];

    if (lastRow && lastRow.components.length < 5) {
        // Clone the row and add back button
        const newRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            ...lastRow.components.map(c => ButtonBuilder.from(c.toJSON())),
            backBtn
        );
        return [...components.slice(0, -1), newRow];
    } else {
        // Add new row with just back button
        return [...components, new ActionRowBuilder<ButtonBuilder>().addComponents(backBtn)];
    }
}
