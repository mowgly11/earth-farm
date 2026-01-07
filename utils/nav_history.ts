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
    | 'scratch_result'
    | 'plant'
    | 'raise';

interface ViewState {
    view: ViewName;
    state?: Record<string, any>; // e.g., { page: 2, sortBy: 'xp' }
}

interface HistoryEntry {
    stack: ViewState[];
    currentView?: ViewState; // The view currently being displayed
    lastActivity: number;
}

// Human-readable labels for view names
const VIEW_LABELS: Record<ViewName, string> = {
    'dashboard': 'Dashboard',
    'farm': 'Farm',
    'barn': 'Barn',
    'leaderboard': 'Leaderboard',
    'storage': 'Storage',
    'profile': 'Profile',
    'market': 'Market',
    'harvest_result': 'Harvest',
    'sell_result': 'Sell',
    'daily_result': 'Daily',
    'scratch_result': 'Scratch',
    'plant': 'Plant Seeds',
    'raise': 'Raise Animal'
};

// --- Configuration ---

const MAX_STACK_SIZE = 10;
const TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_TOTAL_ENTRIES = 1000; // Hard limit to prevent unbounded growth

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
export function pushView(userId: string, messageId: string, view: ViewName, state?: Record<string, any>): number {
    const key = getKey(userId, messageId);
    const now = Date.now();

    // Enforce global limit - evict oldest entry if at capacity
    if (navHistory.size >= MAX_TOTAL_ENTRIES) {
        const oldest = navHistory.keys().next().value;
        if (oldest) {
            navHistory.delete(oldest);
            logger.debug(`Nav history limit reached, evicted oldest entry`);
        }
    }

    let entry = navHistory.get(key);
    if (!entry) {
        entry = { stack: [], lastActivity: now };
        navHistory.set(key, entry);
    }

    // Update activity timestamp
    entry.lastActivity = now;

    // Don't push duplicate consecutive views
    const lastEntry = entry.stack[entry.stack.length - 1];
    if (!lastEntry || lastEntry.view !== view) {
        entry.stack.push({ view, state });

        // Enforce max size (drop oldest)
        if (entry.stack.length > MAX_STACK_SIZE) {
            entry.stack.shift();
        }
    }

    return entry.stack.length;
}

/**
 * Pop current view and return the view to navigate back to.
 * @returns Previous view to navigate to, or null if stack is empty
 */
export function popView(userId: string, messageId: string): ViewState | null {
    const key = getKey(userId, messageId);
    const entry = navHistory.get(key);

    const stackBefore = entry?.stack.map(s => s.view).join(' > ') || '(no entry)';

    if (!entry || entry.stack.length === 0) {
        logger.info(`NavHistory: popView EMPTY - user=${userId.slice(-6)} msg=${messageId} stack=[${stackBefore}] returning=null`);
        return null;
    }

    entry.lastActivity = Date.now();

    // Pop removes the current view from history
    const popped = entry.stack.pop();

    // Return the NEW top of stack (what we should navigate to)
    const newTop = entry.stack[entry.stack.length - 1] || null;
    const stackAfter = entry.stack.map(s => s.view).join(' > ') || '(empty)';
    const currentView = entry.currentView?.view || 'none';

    logger.info(`NavHistory: popView - user=${userId.slice(-6)} msg=${messageId} removed=${popped?.view || 'null'} navigateTo=${newTop?.view || 'null'} currentView=${currentView} stack=[${stackBefore}] -> [${stackAfter}]`);

    return newTop;
}

/**
 * Set the current view being displayed.
 * Call this when rendering a view to track what the user is currently seeing.
 */
export function setCurrentView(userId: string, messageId: string, view: ViewName, state?: Record<string, any>): void {
    const key = getKey(userId, messageId);
    const now = Date.now();

    let entry = navHistory.get(key);
    if (!entry) {
        entry = { stack: [], lastActivity: now };
        navHistory.set(key, entry);
    }

    const stackViews = entry.stack.map(s => s.view).join(' > ') || '(empty)';
    logger.info(`NavHistory: setCurrentView - user=${userId.slice(-6)} msg=${messageId} view=${view} prev=${entry.currentView?.view || 'none'} stack=[${stackViews}]`);
    entry.currentView = { view, state };
    entry.lastActivity = now;
}

/**
 * Get the current view being displayed.
 */
export function getCurrentView(userId: string, messageId: string): ViewState | null {
    const key = getKey(userId, messageId);
    const entry = navHistory.get(key);
    return entry?.currentView || null;
}

/**
 * Push the current view to history stack (call before navigating away).
 * Returns the view that was pushed, or null if no current view was set.
 */
export function pushCurrentView(userId: string, messageId: string): ViewState | null {
    const key = getKey(userId, messageId);
    const entry = navHistory.get(key);

    if (!entry?.currentView) {
        // This is expected for messages outside the dashboard flow (standalone commands like /farm, /barn)
        logger.debug(`NavHistory: pushCurrentView skipped - user=${userId.slice(-6)} msg=${messageId} (no entry, likely standalone command)`);
        return null;
    }

    const currentView = entry.currentView;
    const stackBefore = entry.stack.map(s => s.view).join(' > ') || '(empty)';

    // Don't push duplicate consecutive views
    const lastEntry = entry.stack[entry.stack.length - 1];
    if (!lastEntry || lastEntry.view !== currentView.view) {
        entry.stack.push(currentView);

        // Enforce max size
        if (entry.stack.length > MAX_STACK_SIZE) {
            entry.stack.shift();
        }
    }

    const stackAfter = entry.stack.map(s => s.view).join(' > ') || '(empty)';
    logger.info(`NavHistory: pushCurrentView - user=${userId.slice(-6)} msg=${messageId} pushed=${currentView.view} stack=[${stackBefore}] -> [${stackAfter}]`);

    entry.lastActivity = Date.now();
    return currentView;
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
export function peekView(userId: string, messageId: string): ViewState | null {
    const key = getKey(userId, messageId);
    const entry = navHistory.get(key);
    if (!entry || entry.stack.length === 0) return null;
    return entry.stack[entry.stack.length - 1];
}

/**
 * Get human-readable label for the previous view (for labeled back buttons).
 * Returns label like 'Farm', 'Dashboard', or null if no history.
 */
export function peekViewLabel(userId: string, messageId: string): string | null {
    const viewState = peekView(userId, messageId);
    if (!viewState) return null;
    return VIEW_LABELS[viewState.view] || viewState.view;
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
 * Also adds a Dashboard button if back doesn't go to dashboard.
 * Call this when rendering any view that should support back navigation.
 * 
 * @param components - Existing component rows
 * @param userId - User ID for history lookup
 * @param messageId - Optional message ID (if undefined, no back button added)
 * @returns Components with back/dashboard buttons added as appropriate
 */
export function addBackButton(
    components: ActionRowBuilder<ButtonBuilder>[],
    userId: string,
    messageId?: string
): ActionRowBuilder<ButtonBuilder>[] {
    // No messageId = can't track history = just add dashboard button
    if (!messageId) {
        const dashBtn = BUTTONS.dashboard();
        const lastRow = components[components.length - 1];
        if (lastRow && lastRow.components.length < 5) {
            const newRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                ...lastRow.components.map(c => ButtonBuilder.from(c.toJSON())),
                dashBtn
            );
            return [...components.slice(0, -1), newRow];
        } else {
            return [...components, new ActionRowBuilder<ButtonBuilder>().addComponents(dashBtn)];
        }
    }

    // Check history
    const depth = getDepth(userId, messageId);
    const previousView = peekView(userId, messageId);
    const destinationLabel = previousView ? VIEW_LABELS[previousView.view] || previousView.view : null;

    // Check if dashboard button already exists in components
    const hasDashboardButton = components.some(row =>
        row.components.some(btn => {
            const json = btn.toJSON() as { custom_id?: string };
            return json.custom_id === 'nav:dashboard';
        })
    );

    // Build buttons to add
    const buttonsToAdd: ButtonBuilder[] = [];

    // Add back button if history exists
    if (depth > 0) {
        buttonsToAdd.push(BUTTONS.backHistory(userId, messageId, destinationLabel || undefined));
    }

    // Add dashboard button if:
    // - back destination is NOT dashboard, AND
    // - dashboard button doesn't already exist in components
    if ((!previousView || previousView.view !== 'dashboard') && !hasDashboardButton) {
        buttonsToAdd.push(BUTTONS.dashboard());
    }

    // Debug logging
    const key = getKey(userId, messageId);
    const entry = navHistory.get(key);
    const stackViews = entry?.stack.map(s => s.view).join(' > ') || '(empty)';
    const currentView = entry?.currentView?.view || 'none';
    logger.debug(`NavHistory: addBackButton - msg=${messageId} depth=${depth} currentView=${currentView} stack=[${stackViews}] backTo=${destinationLabel || 'N/A'} adding=[${buttonsToAdd.length > 0 ? (depth > 0 ? 'back' : '') + (buttonsToAdd.length === 2 || (buttonsToAdd.length === 1 && depth === 0) ? '+dashboard' : '') : 'nothing'}]`);

    // No buttons to add
    if (buttonsToAdd.length === 0) return components;

    // Find a row with space or create new row
    const lastRow = components[components.length - 1];
    const spaceNeeded = buttonsToAdd.length;

    if (lastRow && lastRow.components.length + spaceNeeded <= 5) {
        // Clone the row and add buttons
        const newRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            ...lastRow.components.map(c => ButtonBuilder.from(c.toJSON())),
            ...buttonsToAdd
        );
        return [...components.slice(0, -1), newRow];
    } else {
        // Add new row with buttons
        return [...components, new ActionRowBuilder<ButtonBuilder>().addComponents(...buttonsToAdd)];
    }
}
