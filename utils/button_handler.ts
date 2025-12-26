/**
 * Button Handler Utility
 * Creates consistent button rows for interactive UX
 */

import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { BUTTONS } from "./buttons.ts";

// Button style constants
export const BTN_STYLE = {
    PRIMARY: ButtonStyle.Primary,
    SUCCESS: ButtonStyle.Success,
    SECONDARY: ButtonStyle.Secondary,
    DANGER: ButtonStyle.Danger,
};

/**
 * Create a custom ID with user validation
 * Format: action:subaction:userId
 */
export function createButtonId(action: string, subaction: string, userId: string): string {
    return `${action}:${subaction}:${userId}`;
}

/**
 * Parse a custom ID into components
 */
export function parseButtonId(customId: string): { action: string; subaction: string; userId: string } {
    const [action, subaction, userId] = customId.split(":");
    return { action, subaction, userId };
}

/**
 * Check if the button belongs to the user
 */
export function isButtonOwner(customId: string, clickerId: string): boolean {
    const { userId } = parseButtonId(customId);
    return userId === clickerId;
}

// --- Pre-defined Button Configurations ---

/**
 * Navigation buttons - go to other commands
 */
export function createNavigationButtons(_userId: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        BUTTONS.daily(),
        BUTTONS.scratch(),
        BUTTONS.harvest(),
        BUTTONS.dashboard()
    );
}

/**
 * Daily command follow-up buttons
 */
export function createDailyButtons(_userId: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        BUTTONS.scratch().setLabel("Scratch Card"),
        BUTTONS.harvest(),
        BUTTONS.dashboard()
    );
}

/**
 * Scratch command follow-up buttons
 */
export function createScratchButtons(_userId: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        BUTTONS.daily(),
        BUTTONS.harvest(),
        BUTTONS.dashboard()
    );
}

/**
 * Harvest command follow-up buttons
 */
export function createHarvestButtons(_userId: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        BUTTONS.sellItems().setLabel("Sell Items").setEmoji("📦"),
        BUTTONS.market(),
        BUTTONS.dashboard()
    );
}

/**
 * Buy command follow-up buttons (context-aware)
 */
export function createBuyButtons(_userId: string, itemType: "seeds" | "animals"): ActionRowBuilder<ButtonBuilder> {
    const actionButton = itemType === "animals"
        ? BUTTONS.raise().setLabel("Raise Animal")
        : BUTTONS.plant().setLabel("Plant Seeds");

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        actionButton,
        BUTTONS.market().setLabel("Buy More"),
        BUTTONS.dashboard()
    );
}

/**
 * Dashboard main action buttons (Row 1)
 */
export function createDashboardRow1(_userId: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        BUTTONS.daily(),
        BUTTONS.scratch(),
        BUTTONS.harvest()
    );
}

/**
 * Dashboard navigation buttons (Row 2)
 */
export function createDashboardRow2(_userId: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        BUTTONS.market(),
        BUTTONS.leaderboard().setLabel("Leaderboard"),
        BUTTONS.farmer().setLabel("Profile")
    );
}

/**
 * Dashboard farm buttons (Row 3)
 */
export function createDashboardRow3(_userId: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        BUTTONS.farm().setLabel("My Farm"),
        BUTTONS.barn().setLabel("My Barn"),
        BUTTONS.dashboardRefresh()
    );
}

/**
 * Create disabled version of buttons (for timeout)
 */
export function disableButtons(row: ActionRowBuilder<ButtonBuilder>): ActionRowBuilder<ButtonBuilder> {
    const newRow = new ActionRowBuilder<ButtonBuilder>();
    row.components.forEach(button => {
        newRow.addComponents(
            ButtonBuilder.from(button).setDisabled(true)
        );
    });
    return newRow;
}
