/**
 * Navigation Button Handlers
 * Extracted from index.ts for better organization
 */
import { ButtonInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, MessageFlags, StringSelectMenuBuilder } from "discord.js";
import { createFarmView } from "../commands/farm.ts";
import { createBarnView } from "../commands/barn.ts";
import { createMainView, setupDashboardCollector, executeHarvestAction, executeSellAction, executeDailyAction, executeScratchAction } from "../commands/dashboard.ts";
import { createLeaderboardEmbed, createPaginationButtons, USERS_PER_PAGE } from "../commands/leaderboard.ts";
import { createMarketView } from "../utils/views.ts";
import { formatNumber } from "../utils/ux.ts";
import { BUTTONS } from "../utils/buttons.ts";
import { COLORS } from "../utils/constants.ts";
import { pushView, addBackButton, getDepth, popView, pushCurrentView, setCurrentView } from "../utils/nav_history.ts";
import { logger, silentCatch } from "../utils/logger.ts";
import database from "../database/methods.ts";
import { getProfile, updateCache } from "../services/index.ts";
import type { UserProfile, StorageItem, MarketItem } from "../types/database_types.ts";
import { handleMissingAccessError } from "../utils/permissions.ts";

// Context passed to all navigation handlers
export interface NavContext {
    interaction: ButtonInteraction;
    userId: string;
    userProfile: UserProfile;
    username: string;
    avatar: string;
    messageId?: string;
}

// Handler return type - true if handled, false to continue
type NavHandler = (ctx: NavContext) => Promise<boolean>;

// --- Individual Navigation Handlers ---

export async function handleNavFarm(ctx: NavContext): Promise<boolean> {
    try {
        // Push current view to history before navigating
        if (ctx.messageId) pushCurrentView(ctx.userId, ctx.messageId);
        const farmView = await createFarmView(ctx.userProfile, ctx.username, ctx.userId, ctx.messageId);
        await ctx.interaction.update({
            content: farmView.content,
            embeds: [],
            files: [farmView.attachment],
            components: farmView.components
        });
        // Track that user is now on farm view
        if (ctx.messageId) setCurrentView(ctx.userId, ctx.messageId, 'farm');
        return true;
    } catch (err) {
        if (await handleMissingAccessError(err, ctx.interaction)) return true;
        logger.error(`Farm inline error:`, err);
        await ctx.interaction.reply({ content: "Failed to load farm. Try `/farm`.", flags: MessageFlags.Ephemeral }).catch(() => { });
        return true;
    }
}

export async function handleNavBarn(ctx: NavContext): Promise<boolean> {
    try {
        // Push current view to history before navigating
        if (ctx.messageId) pushCurrentView(ctx.userId, ctx.messageId);
        const barnView = await createBarnView(ctx.userProfile, ctx.username, ctx.userId, ctx.messageId);
        await ctx.interaction.update({
            content: barnView.content,
            embeds: [],
            files: [barnView.attachment],
            components: barnView.components
        });
        // Track that user is now on barn view
        if (ctx.messageId) setCurrentView(ctx.userId, ctx.messageId, 'barn');
        return true;
    } catch (err) {
        if (await handleMissingAccessError(err, ctx.interaction)) return true;
        logger.error(`Barn inline error:`, err);
        await ctx.interaction.reply({ content: "Failed to load barn. Try `/barn`.", flags: MessageFlags.Ephemeral }).catch(() => { });
        return true;
    }
}

export async function handleNavHarvest(ctx: NavContext): Promise<boolean> {
    try {
        await ctx.interaction.deferUpdate();
        const dbProfile = await database.findUser(ctx.userId);
        if (!dbProfile) {
            await ctx.interaction.followUp({ content: "Profile not found!", flags: MessageFlags.Ephemeral });
            return true;
        }
        // Push current view to history before showing harvest result
        if (ctx.messageId) pushCurrentView(ctx.userId, ctx.messageId);
        const result = await executeHarvestAction(ctx.userProfile, dbProfile, ctx.userId);
        // Update cache with fresh dbProfile data so back navigation shows current state
        updateCache(ctx.userId, dbProfile as any);
        // Use dynamic back/dashboard buttons
        const components = addBackButton([], ctx.userId, ctx.messageId);
        await ctx.interaction.editReply({ content: '', embeds: [result.embed], components, files: [] });
        return true;
    } catch (err) {
        if (await handleMissingAccessError(err, ctx.interaction)) return true;
        logger.error(`Harvest inline error:`, err);
        await ctx.interaction.followUp({ content: "Failed to harvest. Try `/harvest`.", flags: MessageFlags.Ephemeral }).catch(() => { });
        return true;
    }
}

export async function handleNavSell(ctx: NavContext): Promise<boolean> {
    try {
        await ctx.interaction.deferUpdate();
        const dbProfile = await database.findUser(ctx.userId);
        if (!dbProfile) {
            await ctx.interaction.followUp({ content: "Profile not found!", flags: MessageFlags.Ephemeral });
            return true;
        }
        // Push current view to history before showing sell result
        if (ctx.messageId) pushCurrentView(ctx.userId, ctx.messageId);
        const result = await executeSellAction(ctx.userProfile, dbProfile, ctx.userId);
        // Update cache with fresh dbProfile data
        updateCache(ctx.userId, dbProfile as any);
        // Use dynamic back/dashboard buttons
        const components = addBackButton([], ctx.userId, ctx.messageId);
        await ctx.interaction.editReply({ content: '', embeds: [result.embed], components, files: [] });
        return true;
    } catch (err) {
        if (await handleMissingAccessError(err, ctx.interaction)) return true;
        logger.error(`Sell inline error:`, err);
        await ctx.interaction.followUp({ content: "Failed to sell. Try `/sell`.", flags: MessageFlags.Ephemeral }).catch(() => { });
        return true;
    }
}

export async function handleNavDaily(ctx: NavContext): Promise<boolean> {
    try {
        await ctx.interaction.deferUpdate();
        const dbProfile = await database.findUser(ctx.userId);
        if (!dbProfile) {
            await ctx.interaction.followUp({ content: "Profile not found!", flags: MessageFlags.Ephemeral });
            return true;
        }
        // Push current view to history before showing daily result
        if (ctx.messageId) pushCurrentView(ctx.userId, ctx.messageId);
        const result = await executeDailyAction(ctx.userProfile, dbProfile, ctx.userId);
        // Update cache with fresh dbProfile data
        updateCache(ctx.userId, dbProfile as any);
        // Use dynamic back/dashboard buttons
        const components = addBackButton([], ctx.userId, ctx.messageId);
        await ctx.interaction.editReply({ content: '', embeds: [result.embed], components, files: [] });
        return true;
    } catch (err) {
        if (await handleMissingAccessError(err, ctx.interaction)) return true;
        logger.error(`Daily inline error:`, err);
        await ctx.interaction.followUp({ content: "Failed to claim daily. Try `/daily`.", flags: MessageFlags.Ephemeral }).catch(() => { });
        return true;
    }
}

export async function handleNavScratch(ctx: NavContext): Promise<boolean> {
    try {
        await ctx.interaction.deferUpdate();
        const dbProfile = await database.findUser(ctx.userId);
        if (!dbProfile) {
            await ctx.interaction.followUp({ content: "Profile not found!", flags: MessageFlags.Ephemeral });
            return true;
        }
        // Push current view to history before showing scratch result
        if (ctx.messageId) pushCurrentView(ctx.userId, ctx.messageId);
        const result = await executeScratchAction(ctx.userProfile, dbProfile, ctx.userId);
        // Update cache with fresh dbProfile data
        updateCache(ctx.userId, dbProfile as any);
        // Use dynamic back/dashboard buttons
        const components = addBackButton([], ctx.userId, ctx.messageId);
        await ctx.interaction.editReply({ content: '', embeds: [result.embed], components, files: [] });
        return true;
    } catch (err) {
        if (await handleMissingAccessError(err, ctx.interaction)) return true;
        logger.error(`Scratch inline error:`, err);
        await ctx.interaction.followUp({ content: "Failed to scratch. Try `/scratch`.", flags: MessageFlags.Ephemeral }).catch(() => { });
        return true;
    }
}

export async function handleNavDashboard(ctx: NavContext): Promise<boolean> {
    try {
        // Push current view to history before going to dashboard
        if (ctx.messageId) pushCurrentView(ctx.userId, ctx.messageId);
        const view = createMainView(ctx.userProfile, ctx.username, ctx.avatar, ctx.userId);
        const response = await ctx.interaction.update({
            embeds: [view.embed],
            components: view.components,
            files: [],
            withResponse: true
        });
        const message = response.resource?.message;
        if (message) {
            setupDashboardCollector(message, ctx.userId, ctx.username, ctx.avatar, ctx.interaction.client);
            // Track that user is now on dashboard
            setCurrentView(ctx.userId, message.id, 'dashboard');
        }
        return true;
    } catch (err) {
        if (await handleMissingAccessError(err, ctx.interaction)) return true;
        logger.error(`Dashboard inline error:`, err);
        await ctx.interaction.reply({ content: "Failed to load dashboard. Try `/dashboard`.", flags: MessageFlags.Ephemeral }).catch(() => { });
        return true;
    }
}

export async function handleNavHelp(ctx: NavContext): Promise<boolean> {
    const quickStart = new EmbedBuilder()
        .setTitle("🌾 Quick Start Guide")
        .setColor(COLORS.PRIMARY)
        .setDescription("**Getting Started:**\n• Use `/dashboard` to see your farm overview\n• Use `/plant` to plant seeds\n• Use `/harvest` when crops are ready\n• Use `/sell` to sell your products!\n\n**Tips:**\n• Check daily rewards with the Daily button\n• Upgrade your farm for more slots\n• Raise animals for extra income")
        .setFooter({ text: "Use /help for full command list" });

    await ctx.interaction.reply({ embeds: [quickStart], flags: MessageFlags.Ephemeral });
    return true;
}

export async function handleNavLeaderboard(ctx: NavContext): Promise<boolean> {
    try {
        // Push current view to history before showing leaderboard
        if (ctx.messageId) pushCurrentView(ctx.userId, ctx.messageId);

        // Get paginated leaderboard data
        const { users: pageProfiles, total } = await database.getLeaderboard('xp', 0, USERS_PER_PAGE);
        const totalPages = Math.ceil(total / USERS_PER_PAGE);
        let currentPage = 0;

        // Get user's rank
        const userRank = await database.getUserRank(ctx.userId, 'xp');

        // Create initial embed
        const embed = createLeaderboardEmbed(pageProfiles, "xp", currentPage, totalPages, ctx.userId);

        // No pagination needed for small leaderboards
        if (totalPages <= 1) {
            const components = addBackButton([], ctx.userId, ctx.messageId);
            await ctx.interaction.update({ embeds: [embed], components, files: [] });
            if (ctx.messageId) setCurrentView(ctx.userId, ctx.messageId, 'leaderboard');
            return true;
        }

        const row = createPaginationButtons(currentPage, totalPages);
        const navButtons = addBackButton([], ctx.userId, ctx.messageId);
        const response = await ctx.interaction.update({ embeds: [embed], components: [row, ...navButtons], files: [], withResponse: true });
        const message = response.resource?.message;

        if (!message) return true;

        // Track that user is now on leaderboard view
        if (ctx.messageId) setCurrentView(ctx.userId, ctx.messageId, 'leaderboard');

        // Create collector for pagination
        const collector = message.createMessageComponentCollector({
            time: 120000 // 2 minutes
        });

        collector.on("collect", async (i: any) => {
            if (i.user.id !== ctx.userId) {
                await i.reply({ content: "You can only navigate your own leaderboard.", flags: MessageFlags.Ephemeral });
                return;
            }

            if (i.customId === "lb_prev") currentPage = Math.max(0, currentPage - 1);
            else if (i.customId === "lb_next") currentPage = Math.min(totalPages - 1, currentPage + 1);
            else if (i.customId === "lb_first") currentPage = 0;
            else if (i.customId === "lb_last") currentPage = totalPages - 1;

            // Fetch new page data
            const { users: newPageProfiles } = await database.getLeaderboard('xp', currentPage, USERS_PER_PAGE);

            const newEmbed = createLeaderboardEmbed(newPageProfiles, "xp", currentPage, totalPages, ctx.userId);
            const newRow = createPaginationButtons(currentPage, totalPages);
            await i.update({ embeds: [newEmbed], components: [newRow, ...navButtons] });
        });

        collector.on("end", async () => {
            const disabledRow = createPaginationButtons(currentPage, totalPages, true);
            await message.edit({ components: [disabledRow, ...navButtons] }).catch(silentCatch('leaderboard:disableButtons'));
        });

        return true;
    } catch (err) {
        logger.error(`Leaderboard inline error:`, err);
        await ctx.interaction.reply({ content: "Failed to load leaderboard. Try `/leaderboard xp`.", flags: MessageFlags.Ephemeral });
        return true;
    }
}

export async function handleNavPlant(ctx: NavContext): Promise<boolean> {
    try {
        if (ctx.messageId) pushCurrentView(ctx.userId, ctx.messageId);

        // Get user's seeds from storage
        const userSeeds = ctx.userProfile.storage.market_items.filter(
            (item: StorageItem) => item && item.amount > 0
        );

        const availableSlots = ctx.userProfile.farm.available_crop_slots - ctx.userProfile.farm.occupied_crop_slots.length;

        const embed = new EmbedBuilder()
            .setTitle("🌱 Plant Seeds")
            .setColor(COLORS.PRIMARY)
            .addFields(
                { name: "🌾 Available Crop Slots", value: `**${availableSlots}** slots`, inline: true },
                { name: "💰 Gold", value: `**${formatNumber(ctx.userProfile.gold)}** 🪙`, inline: true }
            );

        const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

        if (userSeeds.length === 0) {
            embed.setDescription("You don't have any seeds! Buy some from the market first.");
            const buyRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                BUTTONS.market().setLabel("Buy Seeds")
            );
            components.push(...addBackButton([buyRow], ctx.userId, ctx.messageId));
        } else if (availableSlots <= 0) {
            embed.setDescription("No crop slots available! Harvest your crops first.");
            const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                BUTTONS.harvest().setLabel("Harvest Crops")
            );
            components.push(...addBackButton([backRow], ctx.userId, ctx.messageId));
        } else {
            embed.setDescription("Select a seed to plant from your storage:");
            const seedsList = userSeeds.map((s: StorageItem) => `• **${s.name}** x${s.amount}`).join("\\n");
            embed.addFields({ name: "📦 Your Seeds", value: seedsList || "None", inline: false });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`plant:select:${ctx.userId}`)
                .setPlaceholder("Select a seed to plant...")
                .addOptions(userSeeds.slice(0, 25).map((seed: StorageItem) => ({
                    label: `${seed.name} (x${seed.amount})`,
                    description: `Plant in ${Math.min(seed.amount, availableSlots)} slots`,
                    value: seed.name.toLowerCase()
                })));

            components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));
            // Only add back button row - no duplicate static back button
            components.push(...addBackButton([], ctx.userId, ctx.messageId));
        }

        await ctx.interaction.update({ content: "", embeds: [embed], components, files: [] });
        // Track that user is now on plant view
        if (ctx.messageId) setCurrentView(ctx.userId, ctx.messageId, 'plant');
        return true;
    } catch (err) {
        logger.error(`Plant inline error:`, err);
        await ctx.interaction.followUp({ content: "Failed to load plant view. Try `/plant`.", flags: MessageFlags.Ephemeral });
        return true;
    }
}

export async function handleNavRaise(ctx: NavContext): Promise<boolean> {
    try {
        if (ctx.messageId) pushCurrentView(ctx.userId, ctx.messageId);

        // Get user's animals in storage (bought but not placed)
        const marketItems: MarketItem[] = require('../config/items/market_items.json');
        const userAnimals = ctx.userProfile.storage.market_items.filter(
            (item: StorageItem) => {
                if (!item || item.amount <= 0) return false;
                const marketItem = marketItems.find(
                    (m: MarketItem) => m.name.toLowerCase() === item.name.toLowerCase()
                );
                return marketItem?.type === "animals";
            }
        );

        const availableSlots = ctx.userProfile.farm.available_animal_slots - ctx.userProfile.farm.occupied_animal_slots.length;

        const embed = new EmbedBuilder()
            .setTitle("🐔 Raise Animal")
            .setColor(COLORS.PRIMARY)
            .addFields(
                { name: "🐾 Available Animal Slots", value: `**${availableSlots}** slots`, inline: true },
                { name: "💰 Gold", value: `**${formatNumber(ctx.userProfile.gold)}** 🪙`, inline: true }
            );

        const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

        if (userAnimals.length === 0) {
            embed.setDescription("You don't have any animals! Buy some from the market first.");
            const buyRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                BUTTONS.market().setLabel("Buy Animals")
            );
            components.push(...addBackButton([buyRow], ctx.userId, ctx.messageId));
        } else if (availableSlots <= 0) {
            embed.setDescription("No animal slots available! Upgrade your farm for more slots.");
            components.push(...addBackButton([], ctx.userId, ctx.messageId));
        } else {
            embed.setDescription("Select an animal to raise from your storage:");
            const animalsList = userAnimals.map((a: StorageItem) => `• **${a.name}** x${a.amount}`).join("\\n");
            embed.addFields({ name: "📦 Your Animals", value: animalsList || "None", inline: false });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`raise:select:${ctx.userId}`)
                .setPlaceholder("Select an animal to raise...")
                .addOptions(userAnimals.slice(0, 25).map((animal: StorageItem) => ({
                    label: `${animal.name} (x${animal.amount})`,
                    description: `Place in ${Math.min(animal.amount, availableSlots)} slots`,
                    value: animal.name.toLowerCase()
                })));

            components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));
            // Only add back button row - no duplicate static back button
            components.push(...addBackButton([], ctx.userId, ctx.messageId));
        }

        await ctx.interaction.update({ content: "", embeds: [embed], components, files: [] });
        // Track that user is now on raise view
        if (ctx.messageId) setCurrentView(ctx.userId, ctx.messageId, 'raise');
        return true;
    } catch (err) {
        logger.error(`Raise inline error:`, err);
        await ctx.interaction.followUp({ content: "Failed to load raise view. Try `/raise`.", flags: MessageFlags.Ephemeral });
        return true;
    }
}

export async function handleNavMarket(ctx: NavContext): Promise<boolean> {
    try {
        if (ctx.messageId) pushView(ctx.userId, ctx.messageId, 'dashboard');
        const marketView = createMarketView("main", ctx.userProfile.gold, null, ctx.userId, ctx.messageId);
        await ctx.interaction.update({ content: "", embeds: marketView.embeds, components: marketView.components, files: [] });
        return true;
    } catch (err) {
        logger.error(`Market inline error:`, err);
        await ctx.interaction.followUp({ content: "Failed to load market. Try `/market`.", flags: MessageFlags.Ephemeral });
        return true;
    }
}

export async function handleNavBack(ctx: NavContext): Promise<boolean> {
    try {
        const customId = ctx.interaction.customId;
        const parts = customId.split(":");
        const targetUserId = parts[2];
        const targetMessageId = parts[3];

        // Security: Validate ownership
        if (ctx.userId !== targetUserId) {
            await ctx.interaction.reply({ content: "Not your button!", flags: MessageFlags.Ephemeral });
            return true;
        }

        const previousViewState = popView(ctx.userId, targetMessageId);

        // If no history, go to dashboard
        if (!previousViewState || previousViewState.view === 'dashboard') {
            // Get profile for dashboard
            const profileResult = await getProfile(ctx.userId);
            if (!profileResult) {
                await ctx.interaction.reply({ content: "Profile not found!", flags: MessageFlags.Ephemeral });
                return true;
            }
            const userProfile = profileResult.profile;

            const view = createMainView(userProfile, ctx.username, ctx.avatar, ctx.userId);
            const response = await ctx.interaction.update({ embeds: [view.embed], components: view.components, files: [], withResponse: true });
            const message = response.resource?.message;
            if (message) {
                setupDashboardCollector(message, ctx.userId, ctx.username, ctx.avatar, ctx.interaction.client);
            }
            return true;
        }

        // Get profile for rendering
        const renderProfileResult = await getProfile(ctx.userId);
        if (!renderProfileResult) {
            await ctx.interaction.reply({ content: "Profile not found!", flags: MessageFlags.Ephemeral });
            return true;
        }
        const userProfile = renderProfileResult.profile;
        const messageId = ctx.interaction.message?.id || targetMessageId;
        const previousView = previousViewState.view;

        // Render the previous view
        if (previousView === 'farm') {
            const farmView = await createFarmView(userProfile, ctx.username, ctx.userId, messageId);
            await ctx.interaction.update({ content: farmView.content, embeds: [], files: [farmView.attachment], components: farmView.components });
        } else if (previousView === 'barn') {
            const barnView = await createBarnView(userProfile, ctx.username, ctx.userId, messageId);
            await ctx.interaction.update({ content: barnView.content, embeds: [], files: [barnView.attachment], components: barnView.components });
        } else if (previousView === 'leaderboard') {
            await ctx.interaction.deferUpdate();
            const allProfiles = await database.getAllUsers() as unknown as UserProfile[];
            const sortedProfiles = allProfiles.sort((a, b) => (b.xp || 0) - (a.xp || 0));
            const totalPages = Math.ceil(sortedProfiles.length / USERS_PER_PAGE);
            // Use state if available for page number
            const page = previousViewState.state?.page ?? 0;
            const lbEmbed = createLeaderboardEmbed(sortedProfiles, 'xp', page, totalPages, ctx.userId);
            const lbRow = createPaginationButtons(page, totalPages);
            // Use dynamic back/dashboard buttons
            const components = addBackButton([lbRow], ctx.userId, messageId);
            await ctx.interaction.editReply({ embeds: [lbEmbed], components, files: [] });
        } else {
            // Default to dashboard
            const view = createMainView(userProfile, ctx.username, ctx.avatar, ctx.userId);
            const response = await ctx.interaction.update({ embeds: [view.embed], components: view.components, files: [], withResponse: true });
            const message = response.resource?.message;
            if (message) {
                setupDashboardCollector(message, ctx.userId, ctx.username, ctx.avatar, ctx.interaction.client);
            }
        }

        return true;
    } catch (err) {
        logger.error(`Nav back render error:`, err);
        await ctx.interaction.reply({ content: "Failed to go back. Try `/dashboard`.", flags: MessageFlags.Ephemeral });
        return true;
    }
}

// --- Handler Registry ---

const navHandlers: Record<string, NavHandler> = {
    farm: handleNavFarm,
    barn: handleNavBarn,
    harvest: handleNavHarvest,
    sell: handleNavSell,
    daily: handleNavDaily,
    scratch: handleNavScratch,
    dashboard: handleNavDashboard,
    help: handleNavHelp,
    leaderboard: handleNavLeaderboard,
    plant: handleNavPlant,
    raise: handleNavRaise,
    market: handleNavMarket,
    back: handleNavBack,
};

/**
 * Dispatch navigation button to appropriate handler
 * Returns true if handled, false if no handler found
 */
export async function dispatchNavigation(target: string, ctx: NavContext): Promise<boolean> {
    const handler = navHandlers[target];
    if (handler) {
        return await handler(ctx);
    }
    return false; // Not handled - let index.ts handle it
}
