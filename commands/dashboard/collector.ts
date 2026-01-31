/**
 * Dashboard Collector
 * Handles button interactions for dashboard views
 */

import { ComponentType, ButtonInteraction, EmbedBuilder, ButtonBuilder, ActionRowBuilder, AttachmentBuilder, MessageFlags, PermissionFlagsBits } from "discord.js";
import type { GuildTextBasedChannel } from "discord.js";
import { join } from "path";
import database from "../../database/methods.ts";
import { userProfileCache } from "../../services/profile_service.ts";
import { logError } from "../../utils/error_logger.ts";
import { COLORS } from "../../utils/constants.ts";
import { relativeTimestamp, getRandomTip } from "../../utils/ux.ts";
import { parseButtonId, isButtonOwner } from "../../utils/button_handler.ts";
import { BUTTONS } from "../../utils/buttons.ts";
import { createNoProfileEmbed } from "../../utils/onboarding.ts";
import { createLeaderboardEmbed, createPaginationButtons, USERS_PER_PAGE } from "../leaderboard.ts";
import { createFarmView } from "../farm.ts";
import { createBarnView } from "../barn.ts";
import { pushCurrentView, setCurrentView, addBackButton } from "../../utils/nav_history.ts";
import { getProfile, updateCache } from "../../services/index.ts";
import { silentCatch, logger } from "../../utils/logger.ts";
import actions from "../../config/data/actions.json";
import type { UserProfile } from "../../types/database_types.ts";

// Import from sibling modules
import {
    createMainView,
    createActionButtons,
    createResultView,
    createProfileView,
    createStorageView,
    createUpgradeView,
    createNavView,
    createBackRow
} from "./views.ts";

// Import full market view from utils (with dropdowns and buy buttons)
import { createMarketView as createFullMarketView } from "../../utils/views.ts";

import {
    executeDailyAction,
    executeScratchAction,
    executeHarvestAction,
    executeSellAction
} from "./actions.ts";

/**
 * Required permissions for the bot to function properly
 */
const REQUIRED_PERMISSIONS = [
    { flag: PermissionFlagsBits.SendMessages, name: "Send Messages" },
    { flag: PermissionFlagsBits.EmbedLinks, name: "Embed Links" },
    { flag: PermissionFlagsBits.AttachFiles, name: "Attach Files" },
    { flag: PermissionFlagsBits.UseExternalEmojis, name: "Use External Emojis" },
    { flag: PermissionFlagsBits.ViewChannel, name: "View Channel" },
    { flag: PermissionFlagsBits.ReadMessageHistory, name: "Read Message History" }
];

/**
 * Get list of missing permissions for the bot in a channel
 */
function getMissingPermissions(interaction: ButtonInteraction): string[] {
    try {
        const channel = interaction.channel as GuildTextBasedChannel | null;
        const botMember = interaction.guild?.members.me;

        if (!channel || !botMember) {
            return ["Unable to check permissions"];
        }

        const permissions = channel.permissionsFor(botMember);
        if (!permissions) {
            return ["Unable to check permissions"];
        }

        return REQUIRED_PERMISSIONS
            .filter(p => !permissions.has(p.flag))
            .map(p => p.name);
    } catch {
        return ["Unable to check permissions"];
    }
}

/**
 * Track active collectors by messageId to prevent duplicates
 */
const activeCollectors = new Map<string, any>();

/**
 * Setup dashboard collector on any message
 */
export function setupDashboardCollector(
    message: any,
    userId: string,
    username: string,
    avatar: string,
    client: any
) {
    const messageId = message.id;

    // Stop existing collector for this message (prevents duplicate handlers)
    const existingCollector = activeCollectors.get(messageId);
    if (existingCollector) {
        existingCollector.stop('replaced');  // Pass reason so end handler knows not to disable
        activeCollectors.delete(messageId);
    }

    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000 // 5 minutes
    });

    // Track this collector
    activeCollectors.set(messageId, collector);

    collector.on("collect", async (i: ButtonInteraction) => {
        // Dashboard collector handles view:, care:, and upgrade: prefixed buttons
        // All other buttons (nav:, market:, help:, lb_, page:, confirm, etc.) are handled elsewhere
        if (!i.customId.startsWith("view:") && !i.customId.startsWith("care:") && !i.customId.startsWith("upgrade:")) {
            return;
        }

        // Verify ownership for dashboard-specific buttons
        if (!isButtonOwner(i.customId, i.user.id)) {
            await i.reply({ content: "❌ This isn't your dashboard!", flags: MessageFlags.Ephemeral });
            return;
        }

        const { action, subaction } = parseButtonId(i.customId);

        try {
            // Fetch profile (using ProfileService)
            const freshResult = await getProfile(userId);
            if (!freshResult) {
                const welcome = createNoProfileEmbed(userId);
                await i.update({ ...welcome });
                return;
            }

            let currentProfile = freshResult.profile;
            const dbProfile = freshResult.dbProfile;
            const now = Date.now();
            const messageId = i.message?.id;

            // Handle different views
            if (action === "view") {
                switch (subaction) {
                    case "main": {
                        if (!i.replied && !i.deferred) await i.deferUpdate();
                        const mainView = createMainView(currentProfile, username, avatar, userId);
                        await i.editReply({ embeds: [mainView.embed], components: mainView.components });
                        if (messageId) setCurrentView(userId, messageId, 'dashboard');
                        break;
                    }

                    case "daily": {
                        if (currentProfile.daily > now) {
                            await i.reply({
                                content: `⏰ **Daily not ready!** Come back ${relativeTimestamp(currentProfile.daily)}`,
                                flags: MessageFlags.Ephemeral
                            });
                            return;
                        }
                        if (messageId) pushCurrentView(userId, messageId);
                        if (!i.replied && !i.deferred) await i.deferUpdate();
                        const result = await executeDailyAction(currentProfile, dbProfile, userId);
                        // Update cache so back navigation shows current state
                        updateCache(userId, dbProfile as any);
                        const view = createResultView(result.embed, userId, "🎁", messageId);
                        await i.editReply({ content: '', embeds: [view.embed], components: view.components });
                        break;
                    }

                    case "scratch": {
                        if (currentProfile.scratch > now) {
                            await i.reply({
                                content: `⏰ **Scratch not ready!** Come back ${relativeTimestamp(currentProfile.scratch)}`,
                                flags: MessageFlags.Ephemeral
                            });
                            return;
                        }

                        const scratchImage = new AttachmentBuilder(join(__dirname, '../../assets', 'cards', 'scratching_card.png'));
                        const scratchBtn = BUTTONS.scratchReveal(userId);
                        const scratchRow = new ActionRowBuilder<ButtonBuilder>().addComponents(scratchBtn);

                        const scratchEmbed = new EmbedBuilder()
                            .setTitle("🎰 Scratch Card Ready!")
                            .setColor(COLORS.PRIMARY)
                            .setDescription("Click the button below to scratch your card and reveal your prize!")
                            .addFields(
                                { name: "🎁 Possible Rewards", value: "💰 **Gold** (50-150)\n⭐ **XP** (5-25)", inline: true },
                                { name: "⏰ Cooldown", value: "8 hours", inline: true }
                            )
                            .setImage("attachment://scratching_card.png")
                            .setFooter({ text: "You have 30 seconds to scratch!" });

                        if (messageId) pushCurrentView(userId, messageId);
                        if (!i.replied && !i.deferred) await i.deferUpdate();

                        const scratchMsg = await i.followUp({
                            embeds: [scratchEmbed],
                            components: [scratchRow],
                            files: [scratchImage]
                        });

                        try {
                            const scratchClick = await scratchMsg.awaitMessageComponent({
                                filter: (btn) => btn.user.id === userId && btn.customId === `scratch_reveal:${userId}`,
                                time: 30000
                            });

                            await scratchClick.deferUpdate();
                            const result = await executeScratchAction(currentProfile, dbProfile, userId);
                            // Update cache so back navigation shows current state
                            updateCache(userId, dbProfile as any);

                            const isGold = result.embed.data.title?.includes("Gold") || result.embed.data.description?.includes("Gold");
                            const resultImage = new AttachmentBuilder(
                                join(__dirname, '../../assets', 'cards', isGold ? 'scratching_card_gold.png' : 'scratching_card_xp.png')
                            );

                            result.embed.setImage(`attachment://scratching_card_${isGold ? 'gold' : 'xp'}.png`);

                            const backBtn = BUTTONS.backDashboard();
                            const resultRow = new ActionRowBuilder<ButtonBuilder>().addComponents(backBtn);

                            await scratchClick.editReply({
                                embeds: [result.embed],
                                components: [resultRow],
                                files: [resultImage]
                            });
                        } catch (err) {
                            scratchBtn.setDisabled(true).setLabel("⏰ Expired");
                            const expiredRow = new ActionRowBuilder<ButtonBuilder>().addComponents(scratchBtn);

                            const expiredEmbed = new EmbedBuilder()
                                .setTitle("⏰ Card Expired")
                                .setColor(COLORS.ERROR)
                                .setDescription("You didn't scratch in time! Click Scratch again when ready.")
                                .setTimestamp();

                            await scratchMsg.edit({ embeds: [expiredEmbed], components: [expiredRow], files: [] });
                        }
                        break;
                    }

                    case "harvest": {
                        let storageCount = 0;
                        currentProfile.storage.market_items.forEach((v: any) => storageCount += v?.amount ?? 0);
                        currentProfile.storage.products.forEach((v: any) => storageCount += v?.amount ?? 0);
                        const storageLeft = currentProfile.farm.storage_limit - storageCount;

                        if (storageLeft <= 0) {
                            await i.reply({
                                content: `📦 **Storage full!** Sell some items with \`/sell\` first.`,
                                flags: MessageFlags.Ephemeral
                            });
                            return;
                        }

                        const readyCrops = currentProfile.farm.occupied_crop_slots?.filter((c: any) => c.ready_at <= now).length || 0;
                        const readyAnimals = currentProfile.farm.occupied_animal_slots?.filter((a: any) => a.ready_at <= now).length || 0;

                        if (readyCrops === 0 && readyAnimals === 0) {
                            await i.reply({
                                content: `🌾 **Nothing ready!** Your crops and animals are still growing.`,
                                flags: MessageFlags.Ephemeral
                            });
                            return;
                        }

                        if (messageId) pushCurrentView(userId, messageId);
                        if (!i.replied && !i.deferred) await i.deferUpdate();
                        const result = await executeHarvestAction(currentProfile, dbProfile, userId);
                        const view = createResultView(result.embed, userId, "🌾", messageId);
                        await i.editReply({ content: '', embeds: [view.embed], components: view.components });
                        break;
                    }

                    case "profile": {
                        try {
                            if (messageId) pushCurrentView(userId, messageId);
                            const view = await createProfileView(currentProfile, username, avatar, userId, messageId);
                            if (!i.replied && !i.deferred) {
                                await i.update({ embeds: [view.embed], components: view.components, files: [view.attachment] });
                            }
                            if (messageId) setCurrentView(userId, messageId, 'profile');
                        } catch (err) {
                            console.error(`[PROFILE] View error:`, err);
                        }
                        break;
                    }

                    case "market": {
                        try {
                            if (messageId) pushCurrentView(userId, messageId);
                            // Use FULL interactive market view with dropdowns and buy buttons
                            const view = createFullMarketView("main", currentProfile.gold, null, userId, messageId);
                            if (!i.replied && !i.deferred) {
                                await i.update({ content: '', embeds: view.embeds, components: view.components });
                            }
                            if (messageId) setCurrentView(userId, messageId, 'market');
                        } catch { /* interaction expired or already handled */ }
                        break;
                    }

                    case "storage": {
                        try {
                            if (messageId) pushCurrentView(userId, messageId);
                            const view = createStorageView(currentProfile, userId, messageId);
                            if (!i.replied && !i.deferred) {
                                await i.update({ embeds: [view.embed], components: view.components });
                            }
                            if (messageId) setCurrentView(userId, messageId, 'storage');
                        } catch { /* interaction expired or already handled */ }
                        break;
                    }

                    case "sell": {
                        let productCount = 0;
                        currentProfile.storage.products.forEach((v: any) => productCount += v?.amount ?? 0);

                        if (productCount === 0) {
                            const emptyEmbed = new EmbedBuilder()
                                .setTitle("📦 Nothing to Sell")
                                .setColor(COLORS.WARNING)
                                .setDescription("You don't have any products yet!\n\n**How to get products:**\n🌾 Harvest ready crops\n🥚 Collect from animals")
                                .setFooter({ text: "Tip: Plant seeds and raise animals to produce items!" });
                            const helpRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                                BUTTONS.harvest().setLabel("Go Harvest"),
                                BUTTONS.market().setLabel("Buy Seeds"),
                                BUTTONS.dashboard()
                            );
                            await i.reply({ embeds: [emptyEmbed], components: [helpRow], flags: MessageFlags.Ephemeral });
                            return;
                        }

                        if (messageId) pushCurrentView(userId, messageId);
                        if (!i.replied && !i.deferred) await i.deferUpdate();
                        const result = await executeSellAction(currentProfile, dbProfile, userId);
                        const view = createResultView(result.embed, userId, "💰", messageId);
                        await i.editReply({ content: '', embeds: [view.embed], components: view.components });
                        break;
                    }

                    case "upgrade": {
                        try {
                            if (messageId) pushCurrentView(userId, messageId);
                            const view = createUpgradeView(currentProfile, userId, messageId);
                            if (!i.replied && !i.deferred) {
                                await i.update({ embeds: [view.embed], components: view.components });
                            }
                            if (messageId) setCurrentView(userId, messageId, 'dashboard');
                        } catch { /* interaction expired or already handled */ }
                        break;
                    }

                    case "refresh": {
                        try {
                            userProfileCache.set(userId, currentProfile);
                            const mainView = createMainView(currentProfile, username, avatar, userId);
                            if (!i.replied && !i.deferred) {
                                await i.update({ embeds: [mainView.embed], components: mainView.components });
                            }
                        } catch { /* interaction expired or already handled */ }
                        break;
                    }

                    case "leaderboard": {
                        try {
                            if (messageId) pushCurrentView(userId, messageId);
                            await i.deferUpdate();
                            const allProfiles = await database.getAllUsers() as unknown as UserProfile[];
                            const sortedProfiles = allProfiles.sort((a, b) => (b.xp || 0) - (a.xp || 0));
                            const totalPages = Math.ceil(sortedProfiles.length / USERS_PER_PAGE);

                            const lbEmbed = createLeaderboardEmbed(sortedProfiles, "xp", 0, totalPages, userId);

                            if (totalPages <= 1) {
                                await i.editReply({ embeds: [lbEmbed], components: createActionButtons(userId) });
                            } else {
                                const lbRow = createPaginationButtons(0, totalPages);
                                await i.editReply({ embeds: [lbEmbed], components: [lbRow, ...createActionButtons(userId)] });
                            }
                            if (messageId) setCurrentView(userId, messageId, 'leaderboard');
                        } catch (err) {
                            await i.editReply({ content: "Failed to load leaderboard.", embeds: [], components: createActionButtons(userId) });
                        }
                        break;
                    }

                    case "farm": {
                        try {
                            if (messageId) pushCurrentView(userId, messageId);
                            if (!i.replied && !i.deferred) await i.deferUpdate();
                            const farmView = await createFarmView(currentProfile, username, userId, messageId);
                            await i.editReply({ content: farmView.content, embeds: [], files: [farmView.attachment], components: farmView.components });
                            if (messageId) setCurrentView(userId, messageId, 'farm');
                        } catch (err: any) {
                            if (!err.message?.includes('already been acknowledged')) throw err;
                        }
                        break;
                    }

                    case "barn": {
                        try {
                            if (messageId) pushCurrentView(userId, messageId);
                            if (!i.replied && !i.deferred) await i.deferUpdate();
                            const barnView = await createBarnView(currentProfile, username, userId, messageId);
                            await i.editReply({ content: barnView.content, embeds: [], files: [barnView.attachment], components: barnView.components });
                            if (messageId) setCurrentView(userId, messageId, 'barn');
                        } catch (err: any) {
                            if (!err.message?.includes('already been acknowledged')) throw err;
                        }
                        break;
                    }

                    default: {
                        const navView = createNavView(subaction, userId);
                        await i.update({ embeds: [navView.embed], components: navView.components });
                    }
                }
            } else if (action === "upgrade") {
                // Handle upgrade:confirm button
                if (subaction === "confirm") {
                    try {
                        await i.deferUpdate();

                        // Get upgrade config
                        const farmLevelsRaw = require("../../config/upgrades/farms.json");
                        const farmLevels = farmLevelsRaw.default || farmLevelsRaw;
                        const nextLevelData = farmLevels.find((v: any) => v.level === currentProfile.farm.level + 1);

                        if (!nextLevelData) {
                            await i.followUp({ content: "🎉 You're already at max level!", flags: MessageFlags.Ephemeral });
                            return;
                        }

                        if (currentProfile.gold < nextLevelData.price) {
                            await i.followUp({ content: `❌ Not enough gold! Need **${nextLevelData.price}** 🪙`, flags: MessageFlags.Ephemeral });
                            return;
                        }

                        // Execute upgrade
                        await database.makePayment(dbProfile, -nextLevelData.price);
                        await database.upgradeFarm(dbProfile, nextLevelData);

                        // Update cache
                        const updatedProfile = (dbProfile as any).toObject();
                        userProfileCache.set(userId, updatedProfile);
                        currentProfile = updatedProfile;

                        // Show success result
                        const resultEmbed = new EmbedBuilder()
                            .setTitle("✨ Farm Upgraded!")
                            .setColor(COLORS.SUCCESS)
                            .setDescription(`Your farm is now **Level ${nextLevelData.level}**!`)
                            .addFields(
                                { name: "🌱 Crop Slots", value: `${nextLevelData.available_crop_slots}`, inline: true },
                                { name: "🐔 Animal Slots", value: `${nextLevelData.available_animal_slots}`, inline: true },
                                { name: "📦 Storage", value: `${nextLevelData.storage_limit}`, inline: true }
                            )
                            .setFooter({ text: getRandomTip() });

                        const components = addBackButton([], userId, messageId);
                        await i.editReply({ content: '', embeds: [resultEmbed], components });

                        logger.action("upgrade", userId, "success", { level: nextLevelData.level, cost: nextLevelData.price });
                    } catch (err) {
                        logger.error("Upgrade inline error:", err);
                        await i.followUp({ content: "❌ Upgrade failed. Try `/upgradefarm`.", flags: MessageFlags.Ephemeral }).catch(() => { });
                    }
                }
            } else if (action === "care") {
                const animals = currentProfile.farm.occupied_animal_slots || [];

                if (animals.length === 0) {
                    const emptyEmbed = new EmbedBuilder()
                        .setTitle("🐔 No Animals")
                        .setColor(COLORS.WARNING)
                        .setDescription("You haven't raised any animals yet!\n\n**Get started:**\nBuy animals from the market and raise them!")
                        .setFooter({ text: "Animals produce eggs, milk, wool and more!" });
                    const helpRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                        BUTTONS.market().setLabel("Buy Animals"),
                        BUTTONS.raise().setLabel("Raise Animal"),
                        BUTTONS.dashboard()
                    );
                    await i.reply({ embeds: [emptyEmbed], components: [helpRow], flags: MessageFlags.Ephemeral });
                    return;
                }

                const cooldownKey = subaction === "feed" ? "lastFed" : subaction === "pet" ? "lastPet" : "lastCleaned";
                const cooldownTime = 1000 * 60 * 60 * 2;

                if (currentProfile.actions?.[cooldownKey] && currentProfile.actions[cooldownKey] > now - cooldownTime) {
                    const nextTime = currentProfile.actions[cooldownKey] + cooldownTime;
                    const cooldownEmbed = new EmbedBuilder()
                        .setTitle(`⏰ ${subaction.charAt(0).toUpperCase() + subaction.slice(1)} Cooldown`)
                        .setColor(COLORS.INFO)
                        .setDescription(`Wait a bit! You can ${subaction} again ${relativeTimestamp(nextTime)}`)
                        .setFooter({ text: "Explore other actions while you wait!" });
                    const helpRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                        BUTTONS.harvest(),
                        BUTTONS.barn().setLabel("View Barn"),
                        BUTTONS.dashboard()
                    );
                    await i.reply({ embeds: [cooldownEmbed], components: [helpRow], flags: MessageFlags.Ephemeral });
                    return;
                }

                const boostPercent = actions.actions[subaction === "feed" ? "feeding" : subaction === "pet" ? "petting" : "cleaning"].boost;
                const boostMs = Math.round((boostPercent / 100) * (1000 * 60 * 60));

                const profile = dbProfile as any;
                for (const animal of profile.farm.occupied_animal_slots) {
                    animal.ready_at = Math.max(now, animal.ready_at - boostMs);
                }

                if (!profile.actions) profile.actions = {};
                profile.actions[cooldownKey] = now;
                profile.markModified("farm.occupied_animal_slots");
                profile.markModified("actions");
                await profile.save();

                const emoji = subaction === "feed" ? "🍖" : subaction === "pet" ? "❤️" : "🧹";
                const actionName = subaction.charAt(0).toUpperCase() + subaction.slice(1);

                await i.reply({
                    content: `${emoji} **${actionName} complete!** Applied +${boostPercent}% boost to **${animals.length}** animals!`,
                    flags: MessageFlags.Ephemeral
                });

                const updatedProfile = (dbProfile as any).toObject();
                userProfileCache.set(userId, updatedProfile);
                const mainView = createMainView(updatedProfile, username, avatar, userId);
                await i.message.edit({ embeds: [mainView.embed], components: mainView.components });
                return;
            }

            const updatedProfile = (dbProfile as any).toObject();
            userProfileCache.set(userId, updatedProfile);

        } catch (error: any) {
            logError(client, error, "dashboard/collector.ts:setupCollector");

            // Check for Missing Access error (Discord code 50001)
            if (error?.code === 50001 || error?.message?.includes('Missing Access')) {
                const missingPerms = getMissingPermissions(i);
                const permsList = missingPerms.length > 0
                    ? missingPerms.map(p => `• ${p}`).join('\n')
                    : "• Unable to determine specific permissions";
                const permMessage = `⚠️ **Missing Permissions**\n\nI don't have the required permissions in this channel.\n\n**Missing permissions:**\n${permsList}\n\nPlease ask a server admin to fix my permissions!`;

                try {
                    // Check interaction state to use correct response method
                    if (!i.replied && !i.deferred) {
                        // Not yet acknowledged - can reply with ephemeral
                        await i.reply({
                            content: permMessage,
                            flags: MessageFlags.Ephemeral
                        });
                    } else {
                        // Already acknowledged - can only edit the message
                        await i.editReply({
                            content: permMessage,
                            embeds: [],
                            components: [createBackRow(userId)]
                        });
                    }
                } catch { }
                return;
            }

            // Check if interaction was already responded to before trying to update
            try {
                if (i.replied || i.deferred) {
                    await i.editReply({
                        embeds: [new EmbedBuilder().setTitle("❌ Error").setColor(COLORS.ERROR).setDescription("Something went wrong. Try again!\n\n💡 Use `/dashboard` to return to your farm.")],
                        components: [createBackRow(userId)]
                    });
                } else {
                    await i.update({
                        embeds: [new EmbedBuilder().setTitle("❌ Error").setColor(COLORS.ERROR).setDescription("Something went wrong. Try again!\n\n💡 Use `/dashboard` to return to your farm.")],
                        components: [createBackRow(userId)]
                    });
                }
            } catch (updateError) {
                // Silently ignore if we can't respond (e.g., interaction expired)
            }
        }
    });

    collector.on("end", async (_collected: any, reason: string) => {
        // Clean up from active collectors Map
        activeCollectors.delete(message.id);

        // Only disable buttons if collector timed out naturally
        // Don't disable if stopped for replacement (new collector taking over)
        if (reason === 'replaced') return;

        try {
            const result = await getProfile(userId);
            if (result) {
                const profile = result.profile;
                const disabledView = createMainView(profile, username, avatar, userId);
                disabledView.components.forEach(row => {
                    row.components.forEach(btn => btn.setDisabled(true));
                });
                await message.edit({ components: disabledView.components }).catch(silentCatch('dashboard:setup:end'));
            }
        } catch { }
    });

    return collector;
}
