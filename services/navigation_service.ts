/**
 * NavigationService - Centralized navigation handling
 * 
 * Solves the back button problem by automatically handling:
 * 1. messageId extraction
 * 2. History tracking (pushView)
 * 3. Back button injection (addBackButton)
 * 
 * No more forgetting to pass messageId through 5 function calls!
 */

import {
    ButtonInteraction,
    StringSelectMenuInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    AttachmentBuilder
} from "discord.js";
import { pushView, addBackButton, type ViewName } from "../utils/nav_history.ts";

// Standard view response type
export interface ViewResponse {
    content?: string;
    embeds?: EmbedBuilder[];
    components: ActionRowBuilder<ButtonBuilder>[];
    files?: AttachmentBuilder[];
}

// Navigation context passed to handlers
export interface NavContext {
    userId: string;
    messageId: string | undefined;
    interaction: ButtonInteraction | StringSelectMenuInteraction;
}

/**
 * Navigate to a new view with automatic history and back button handling
 * 
 * @param interaction - The button/select interaction
 * @param viewName - Name of the view for history tracking
 * @param createView - Function that creates the view (receives NavContext)
 * 
 * @example
 * // Before (manual, error-prone):
 * const messageId = interaction.message?.id;
 * if (messageId) pushView(userId, messageId, 'farm');
 * const view = await createFarmView(profile, username, userId, messageId);
 * await interaction.update(view);
 * 
 * // After (automatic, can't forget):
 * await navigateTo(interaction, 'farm', async (ctx) => 
 *   createFarmView(profile, username, ctx.userId)
 * );
 */
export async function navigateTo(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
    viewName: ViewName,
    createView: (ctx: NavContext) => Promise<ViewResponse> | ViewResponse
): Promise<void> {
    const userId = interaction.user.id;
    const messageId = interaction.message?.id;

    // Create navigation context
    const ctx: NavContext = { userId, messageId, interaction };

    // Track navigation history
    if (messageId) {
        pushView(userId, messageId, viewName);
    }

    // Create the view
    const view = await createView(ctx);

    // Automatically add back button to components
    const componentsWithBack = addBackButton(
        view.components as ActionRowBuilder<ButtonBuilder>[],
        userId,
        messageId
    );

    // Update the message
    await interaction.update({
        content: view.content ?? "",
        embeds: view.embeds ?? [],
        components: componentsWithBack,
        files: view.files ?? []
    });
}

/**
 * Navigate to a view that requires deferred update (e.g., canvas rendering)
 * 
 * Use this when the view creation is async and may take time.
 */
export async function navigateToDeferred(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
    viewName: ViewName,
    createView: (ctx: NavContext) => Promise<ViewResponse>
): Promise<void> {
    const userId = interaction.user.id;
    const messageId = interaction.message?.id;

    // Defer the update first
    await interaction.deferUpdate();

    // Create navigation context
    const ctx: NavContext = { userId, messageId, interaction };

    // Track navigation history
    if (messageId) {
        pushView(userId, messageId, viewName);
    }

    // Create the view
    const view = await createView(ctx);

    // Automatically add back button to components
    const componentsWithBack = addBackButton(
        view.components as ActionRowBuilder<ButtonBuilder>[],
        userId,
        messageId
    );

    // Edit the response
    await interaction.editReply({
        content: view.content ?? "",
        embeds: view.embeds ?? [],
        components: componentsWithBack,
        files: view.files ?? []
    });
}

/**
 * Simple update without navigation tracking
 * 
 * Use this for inline updates that shouldn't be tracked in history
 * (e.g., category switches within the same view)
 */
export async function updateView(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
    view: ViewResponse
): Promise<void> {
    const userId = interaction.user.id;
    const messageId = interaction.message?.id;

    // Add back button but don't track in history
    const componentsWithBack = addBackButton(
        view.components as ActionRowBuilder<ButtonBuilder>[],
        userId,
        messageId
    );

    await interaction.update({
        content: view.content ?? "",
        embeds: view.embeds ?? [],
        components: componentsWithBack,
        files: view.files ?? []
    });
}
