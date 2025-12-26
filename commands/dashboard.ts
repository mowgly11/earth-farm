import { CommandInteraction, SlashCommandBuilder, EmbedBuilder, ComponentType, ButtonInteraction, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags, AttachmentBuilder, StringSelectMenuBuilder } from "discord.js";
import { join } from "path";
import database from "../database/methods.ts";
import { userProfileCache } from "../index.ts";
import { logError } from "../utils/error_logger.ts";
import { COLORS, ERRORS } from "../utils/constants.ts";
import { formatNumber, storageIndicator, createProgressBar, relativeTimestamp, beforeAfter, getRandomTip, getItemEmoji, createGrowingList } from "../utils/ux.ts";
import { parseButtonId, isButtonOwner, BTN_STYLE } from "../utils/button_handler.ts";
import { DASHBOARD_BUTTONS, BUTTONS } from "../utils/buttons.ts";
import { createNoProfileEmbed } from "../utils/onboarding.ts";
import { createLeaderboardEmbed, createPaginationButtons, USERS_PER_PAGE, type UserProfile } from "./leaderboard.ts";
import levels from "../config/data/levels.json";
import marketItems from "../config/items/market_items.json";
import actions from "../config/data/actions.json";

export const data = new SlashCommandBuilder()
    .setName("dashboard")
    .setDescription("Open your interactive farm dashboard!")

export async function execute(interaction: CommandInteraction) {
    await interaction.deferReply();

    const userId = interaction.user.id;
    const username = interaction.user.username;
    const avatar = interaction.user.displayAvatarURL({ size: 128 });

    // Get user profile
    let userProfile: any = userProfileCache.get(userId);
    if (!userProfile) {
        const dbProfile = await database.findUser(userId);
        if (!dbProfile) {
            // Show rich welcome embed with "Create Farm" button
            const welcome = createNoProfileEmbed(userId);
            return await interaction.editReply(welcome);
        }
        userProfile = (dbProfile as any).toObject();
        userProfileCache.set(userId, userProfile);
    }

    // Show main dashboard view
    const { embed, components } = createMainView(userProfile, username, avatar, userId);
    const response = await interaction.editReply({ embeds: [embed], components });

    // Create collector
    const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000 // 5 minutes
    });

    collector.on("collect", async (i: ButtonInteraction) => {
        // Allow nav: buttons through - they navigate away and are handled by index.ts
        if (i.customId.startsWith("nav:")) {
            // Don't block nav buttons - let them fall through to index.ts handler
            return;
        }

        // Verify ownership for dashboard-specific buttons
        if (!isButtonOwner(i.customId, i.user.id)) {
            const validationEmbed = new EmbedBuilder()
                .setTitle("🚫 Not Your Dashboard")
                .setColor(COLORS.ERROR)
                .setDescription("This dashboard belongs to someone else!\n\nWant your own? Use the button below.")
                .setFooter({ text: "Tip: Use /dashboard to open your own!" });
            const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                BUTTONS.dashboard().setLabel("Open My Dashboard")
            );
            await i.reply({ embeds: [validationEmbed], components: [actionRow], flags: MessageFlags.Ephemeral });
            return;
        }

        const { action, subaction } = parseButtonId(i.customId);

        try {
            // Fetch fresh profile
            const dbProfile = await database.findUser(userId);
            if (!dbProfile) {
                const welcome = createNoProfileEmbed(userId);
                await i.update({ ...welcome });
                return;
            }

            let currentProfile = (dbProfile as any).toObject();
            const now = Date.now();

            // Handle different views
            if (action === "view") {
                switch (subaction) {
                    case "main": {
                        // Back to main dashboard
                        await i.deferUpdate();
                        const mainView = createMainView(currentProfile, username, avatar, userId);
                        await i.editReply({ embeds: [mainView.embed], components: mainView.components });
                        break;
                    }

                    case "daily": {
                        // Check cooldown FIRST - use ephemeral if not ready
                        if (currentProfile.daily > now) {
                            await i.reply({
                                content: `⏰ **Daily not ready!** Come back ${relativeTimestamp(currentProfile.daily)}`,
                                flags: MessageFlags.Ephemeral
                            });
                            return;
                        }
                        // Ready - execute and update dashboard
                        await i.deferUpdate();
                        const result = await executeDailyAction(currentProfile, dbProfile, userId);
                        const view = createResultView(result.embed, userId, "🎁");
                        await i.editReply({ embeds: [view.embed], components: view.components });
                        break;
                    }

                    case "scratch": {
                        // Check cooldown FIRST - use ephemeral if not ready
                        if (currentProfile.scratch > now) {
                            await i.reply({
                                content: `⏰ **Scratch not ready!** Come back ${relativeTimestamp(currentProfile.scratch)}`,
                                flags: MessageFlags.Ephemeral
                            });
                            return;
                        }

                        // Send scratch card UI via followUp (can include images)
                        const scratchImage = new AttachmentBuilder(join(__dirname, '../assets', 'cards', 'scratching_card.png'));
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

                        // Acknowledge the button click
                        await i.deferUpdate();

                        // Send new message with scratch card
                        const scratchMsg = await i.followUp({
                            embeds: [scratchEmbed],
                            components: [scratchRow],
                            files: [scratchImage]
                        });

                        // Wait for scratch button click
                        try {
                            const scratchClick = await scratchMsg.awaitMessageComponent({
                                filter: (btn) => btn.user.id === userId && btn.customId === `scratch_reveal:${userId}`,
                                time: 30000
                            });

                            await scratchClick.deferUpdate();

                            // Execute scratch action
                            const result = await executeScratchAction(currentProfile, dbProfile, userId);

                            // Update with result and appropriate image
                            const isGold = result.embed.data.title?.includes("Gold") || result.embed.data.description?.includes("Gold");
                            const resultImage = new AttachmentBuilder(
                                join(__dirname, '../assets', 'cards', isGold ? 'scratching_card_gold.png' : 'scratching_card_xp.png')
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
                            // Timeout - disable button
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
                        // Check storage and ready items FIRST
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

                        // Ready - execute and update dashboard
                        await i.deferUpdate();
                        const result = await executeHarvestAction(currentProfile, dbProfile, userId);
                        const view = createResultView(result.embed, userId, "🌾");
                        await i.editReply({ embeds: [view.embed], components: view.components });
                        break;
                    }

                    case "profile": {
                        const view = createProfileView(currentProfile, username, avatar, userId);
                        await i.update({ embeds: [view.embed], components: view.components });
                        break;
                    }

                    case "market": {
                        const view = createMarketView(currentProfile, userId);
                        await i.update({ embeds: [view.embed], components: view.components });
                        break;
                    }

                    case "storage": {
                        const view = createStorageView(currentProfile, userId);
                        await i.update({ embeds: [view.embed], components: view.components });
                        break;
                    }

                    case "sell": {
                        // Check if user has products to sell
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

                        // Execute sell all and show result
                        await i.deferUpdate();
                        const result = await executeSellAction(currentProfile, dbProfile, userId);
                        const view = createResultView(result.embed, userId, "💰");
                        await i.editReply({ embeds: [view.embed], components: view.components });
                        break;
                    }

                    case "upgrade": {
                        const view = createUpgradeView(currentProfile, userId);
                        await i.update({ embeds: [view.embed], components: view.components });
                        break;
                    }

                    case "refresh": {
                        // Refresh main view
                        userProfileCache.set(userId, currentProfile);
                        const mainView = createMainView(currentProfile, username, avatar, userId);
                        await i.update({ embeds: [mainView.embed], components: mainView.components });
                        break;
                    }

                    case "leaderboard": {
                        // Show select menu for XP or Gold choice
                        const selectEmbed = new EmbedBuilder()
                            .setTitle("🏆 Leaderboard")
                            .setColor(COLORS.PRIMARY)
                            .setDescription("Choose which leaderboard to view:")
                            .addFields(
                                { name: "⭐ XP Rankings", value: "See who has the most experience", inline: true },
                                { name: "💰 Gold Rankings", value: "See who has the most gold", inline: true }
                            );

                        const selectMenu = new StringSelectMenuBuilder()
                            .setCustomId(`lb_select:${userId}`)
                            .setPlaceholder("Select leaderboard type...")
                            .addOptions(
                                { label: "XP Rankings", description: "Rank by experience points", value: "xp", emoji: "⭐" },
                                { label: "Gold Rankings", description: "Rank by gold balance", value: "gold", emoji: "💰" }
                            );

                        const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
                        await i.update({ embeds: [selectEmbed], components: [selectRow, ...createActionButtons(userId)] });
                        break;
                    }

                    default: {
                        // Navigate to slash command
                        const navView = createNavView(subaction, userId);
                        await i.update({ embeds: [navView.embed], components: navView.components });
                    }
                }
            } else if (action === "care") {
                // Animal care actions (feed/pet/clean all)
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

                // Check cooldown
                const now = Date.now();
                const cooldownKey = subaction === "feed" ? "lastFed" : subaction === "pet" ? "lastPet" : "lastCleaned";
                const cooldownTime = 1000 * 60 * 60 * 2; // 2 hours

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

                // Apply boost to all animals
                const boostPercent = actions.actions[subaction === "feed" ? "feeding" : subaction === "pet" ? "petting" : "cleaning"].boost;
                const boostMs = Math.round((boostPercent / 100) * (1000 * 60 * 60)); // Convert boost to time reduction

                const profile = dbProfile as any;
                for (const animal of profile.farm.occupied_animal_slots) {
                    animal.ready_at = Math.max(now, animal.ready_at - boostMs);
                }

                // Update cooldown
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

                // Refresh dashboard
                const updatedProfile = (dbProfile as any).toObject();
                userProfileCache.set(userId, updatedProfile);
                const mainView = createMainView(updatedProfile, username, avatar, userId);
                await i.message.edit({ embeds: [mainView.embed], components: mainView.components });
                return;
            }

            // Update cache
            const updatedProfile = (dbProfile as any).toObject();
            userProfileCache.set(userId, updatedProfile);

        } catch (error) {
            logError(interaction.client, error, "dashboard.ts:collector");
            await i.update({
                embeds: [new EmbedBuilder().setTitle("❌ Error").setColor(COLORS.ERROR).setDescription("Something went wrong. Try again!")],
                components: [createBackRow(userId)]
            }).catch(() => { });
        }
    });

    collector.on("end", async () => {
        // Disable all buttons
        const disabledView = createMainView(userProfile, username, avatar, userId);
        disabledView.components.forEach(row => {
            row.components.forEach(btn => btn.setDisabled(true));
        });
        await interaction.editReply({ components: disabledView.components }).catch(() => { });
    });
}

// --- Setup dashboard collector on any message ---
export function setupDashboardCollector(
    message: any,
    userId: string,
    username: string,
    avatar: string,
    client: any
) {
    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000 // 5 minutes
    });

    collector.on("collect", async (i: ButtonInteraction) => {
        // Allow nav: buttons through - they navigate away and are handled by index.ts
        if (i.customId.startsWith("nav:")) {
            // Don't block nav buttons - let them fall through to index.ts handler
            return;
        }

        // Verify ownership for dashboard-specific buttons
        if (!isButtonOwner(i.customId, i.user.id)) {
            await i.reply({ content: "❌ This isn't your dashboard!", flags: MessageFlags.Ephemeral });
            return;
        }

        const { action, subaction } = parseButtonId(i.customId);

        try {
            // Fetch fresh profile
            const dbProfile = await database.findUser(userId);
            if (!dbProfile) {
                const welcome = createNoProfileEmbed(userId);
                await i.update({ ...welcome });
                return;
            }

            let currentProfile = (dbProfile as any).toObject();
            const now = Date.now();

            // Handle different views
            if (action === "view") {
                switch (subaction) {
                    case "main": {
                        await i.deferUpdate();
                        const mainView = createMainView(currentProfile, username, avatar, userId);
                        await i.editReply({ embeds: [mainView.embed], components: mainView.components });
                        break;
                    }

                    case "daily": {
                        // Check cooldown FIRST - use ephemeral if not ready
                        if (currentProfile.daily > now) {
                            await i.reply({
                                content: `⏰ **Daily not ready!** Come back ${relativeTimestamp(currentProfile.daily)}`,
                                flags: MessageFlags.Ephemeral
                            });
                            return;
                        }
                        // Ready - execute and update dashboard
                        await i.deferUpdate();
                        const result = await executeDailyAction(currentProfile, dbProfile, userId);
                        const view = createResultView(result.embed, userId, "🎁");
                        await i.editReply({ embeds: [view.embed], components: view.components });
                        break;
                    }

                    case "scratch": {
                        // Check cooldown FIRST - use ephemeral if not ready
                        if (currentProfile.scratch > now) {
                            await i.reply({
                                content: `⏰ **Scratch not ready!** Come back ${relativeTimestamp(currentProfile.scratch)}`,
                                flags: MessageFlags.Ephemeral
                            });
                            return;
                        }

                        // Send scratch card UI via followUp (can include images)
                        const scratchImage = new AttachmentBuilder(join(__dirname, '../assets', 'cards', 'scratching_card.png'));
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

                        // Acknowledge the button click
                        await i.deferUpdate();

                        // Send new message with scratch card
                        const scratchMsg = await i.followUp({
                            embeds: [scratchEmbed],
                            components: [scratchRow],
                            files: [scratchImage]
                        });

                        // Wait for scratch button click
                        try {
                            const scratchClick = await scratchMsg.awaitMessageComponent({
                                filter: (btn) => btn.user.id === userId && btn.customId === `scratch_reveal:${userId}`,
                                time: 30000
                            });

                            await scratchClick.deferUpdate();

                            // Execute scratch action
                            const result = await executeScratchAction(currentProfile, dbProfile, userId);

                            // Update with result and appropriate image
                            const isGold = result.embed.data.title?.includes("Gold") || result.embed.data.description?.includes("Gold");
                            const resultImage = new AttachmentBuilder(
                                join(__dirname, '../assets', 'cards', isGold ? 'scratching_card_gold.png' : 'scratching_card_xp.png')
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
                            // Timeout - disable button
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

                        await i.deferUpdate();
                        const result = await executeHarvestAction(currentProfile, dbProfile, userId);
                        const view = createResultView(result.embed, userId, "🌾");
                        await i.editReply({ embeds: [view.embed], components: view.components });
                        break;
                    }

                    case "profile": {
                        const view = createProfileView(currentProfile, username, avatar, userId);
                        await i.update({ embeds: [view.embed], components: view.components });
                        break;
                    }

                    case "market": {
                        const view = createMarketView(currentProfile, userId);
                        await i.update({ embeds: [view.embed], components: view.components });
                        break;
                    }

                    case "storage": {
                        const view = createStorageView(currentProfile, userId);
                        await i.update({ embeds: [view.embed], components: view.components });
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

                        await i.deferUpdate();
                        const result = await executeSellAction(currentProfile, dbProfile, userId);
                        const view = createResultView(result.embed, userId, "💰");
                        await i.editReply({ embeds: [view.embed], components: view.components });
                        break;
                    }

                    case "upgrade": {
                        const view = createUpgradeView(currentProfile, userId);
                        await i.update({ embeds: [view.embed], components: view.components });
                        break;
                    }

                    case "refresh": {
                        userProfileCache.set(userId, currentProfile);
                        const mainView = createMainView(currentProfile, username, avatar, userId);
                        await i.update({ embeds: [mainView.embed], components: mainView.components });
                        break;
                    }

                    case "leaderboard": {
                        // Show dynamic leaderboard inline
                        try {
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
                        } catch (err) {
                            await i.editReply({ content: "Failed to load leaderboard.", embeds: [], components: createActionButtons(userId) });
                        }
                        break;
                    }

                    default: {
                        const navView = createNavView(subaction, userId);
                        await i.update({ embeds: [navView.embed], components: navView.components });
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

        } catch (error) {
            logError(client, error, "dashboard.ts:setupCollector");
            await i.update({
                embeds: [new EmbedBuilder().setTitle("❌ Error").setColor(COLORS.ERROR).setDescription("Something went wrong. Try again!")],
                components: [createBackRow(userId)]
            }).catch(() => { });
        }
    });

    collector.on("end", async () => {
        try {
            const dbProfile = await database.findUser(userId);
            if (dbProfile) {
                const profile = (dbProfile as any).toObject();
                const disabledView = createMainView(profile, username, avatar, userId);
                disabledView.components.forEach(row => {
                    row.components.forEach(btn => btn.setDisabled(true));
                });
                await message.edit({ components: disabledView.components }).catch(() => { });
            }
        } catch { }
    });

    return collector;
}

// --- View Creators ---

export function createMainView(profile: any, username: string, avatar: string, userId: string) {
    // Calculate stats
    let storageCount = 0;
    profile.storage.market_items.forEach((v: any) => storageCount += v?.amount ?? 0);
    profile.storage.products.forEach((v: any) => storageCount += v?.amount ?? 0);

    const currentLevel = levels.find((l: any) => l.level === profile.level);
    const xpToNext = currentLevel?.xp_to_upgrade || 1000;
    const xpProgress = createProgressBar(profile.xp, xpToNext, 10);

    const now = Date.now();
    const cropsReady = profile.farm.occupied_crop_slots?.filter((c: any) => c.ready_at <= now).length || 0;
    const animalsReady = profile.farm.occupied_animal_slots?.filter((a: any) => a.ready_at <= now).length || 0;
    const totalReady = cropsReady + animalsReady;

    const dailyReady = (profile.daily || 0) <= now;
    const scratchReady = (profile.scratch || 0) <= now;

    // Calculate next item ready time
    let nextReadyStr = "";
    const growingCrops = profile.farm.occupied_crop_slots?.filter((c: any) => c.ready_at > now) || [];
    const growingAnimals = profile.farm.occupied_animal_slots?.filter((a: any) => a.ready_at > now) || [];
    const allGrowing = [...growingCrops, ...growingAnimals].sort((a: any, b: any) => a.ready_at - b.ready_at);

    if (allGrowing.length > 0) {
        const nextItem = allGrowing[0];
        const minsLeft = Math.ceil((nextItem.ready_at - now) / 60000);
        nextReadyStr = `⏳ Next ready in **${minsLeft}m**`;
    }

    // Products with sell value
    let productCount = 0;
    profile.storage.products.forEach((v: any) => productCount += v?.amount ?? 0);

    const embed = new EmbedBuilder()
        .setTitle("🌾 EARTH FARM DASHBOARD")
        .setColor(COLORS.PRIMARY)
        .setThumbnail(avatar)
        .setDescription(`Welcome, **${username}**!\n\n${xpProgress} ${profile.xp}/${xpToNext} XP`)
        .addFields(
            { name: "⭐ Level", value: `**${profile.level}**`, inline: true },
            { name: "💰 Gold", value: `**${formatNumber(profile.gold)}**`, inline: true },
            { name: "📦 Storage", value: storageIndicator(storageCount, profile.farm.storage_limit), inline: true }
        )
        .addFields(
            { name: "🎁 Daily", value: dailyReady ? "✅ **READY**" : `⏰ ${relativeTimestamp(profile.daily)}`, inline: true },
            { name: "🎰 Scratch", value: scratchReady ? "✅ **READY**" : `⏰ ${relativeTimestamp(profile.scratch)}`, inline: true },
            { name: "🌾 Harvest", value: totalReady > 0 ? `✅ **${totalReady} ready** (${cropsReady}🌱 ${animalsReady}🥚)` : nextReadyStr || "⏳ Nothing growing", inline: true }
        );

    // Add growing items progress list if there are any growing items
    const totalGrowing = growingCrops.length + growingAnimals.length;
    if (totalGrowing > 0 || totalReady > 0) {
        const crops = profile.farm.occupied_crop_slots || [];
        const animals = profile.farm.occupied_animal_slots || [];
        const growingListStr = createGrowingList(crops, animals);
        embed.addFields({ name: "\u200B", value: growingListStr, inline: false });
    }

    embed.setFooter({ text: getRandomTip() })
        .setTimestamp();

    // Check if user has animals for care buttons
    const hasAnimals = (profile.farm.occupied_animal_slots?.length || 0) > 0;
    const hasProducts = productCount > 0;

    // Create button rows - IMPROVED LAYOUT
    // Row 1: Quick Actions - Only show ready actions (efficient: uses cached profile, O(1) Date comparison)
    const row1Buttons: ButtonBuilder[] = [];

    // Only add Daily button if ready (no extra calculation - just cached timestamp check)
    if (dailyReady) {
        row1Buttons.push(DASHBOARD_BUTTONS.viewDaily(userId));
    }

    // Only add Scratch button if ready
    if (scratchReady) {
        row1Buttons.push(DASHBOARD_BUTTONS.viewScratch(userId));
    }

    // Always show Harvest (even if nothing ready - shows count)
    row1Buttons.push(
        DASHBOARD_BUTTONS.viewHarvest(userId)
            .setLabel(totalReady > 0 ? `Harvest (${totalReady})` : "Harvest")
            .setStyle(totalReady > 0 ? 3 : 2) // SUCCESS : SECONDARY
    );

    // Always show Sell (shows product count)
    row1Buttons.push(
        DASHBOARD_BUTTONS.viewSell(userId)
            .setLabel(hasProducts ? `Sell (${productCount})` : "Sell")
            .setStyle(hasProducts ? 3 : 2) // SUCCESS : SECONDARY
    );

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(...row1Buttons);

    // Row 2: Navigation (Market, Profile, Storage, Refresh)
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        DASHBOARD_BUTTONS.viewMarket(userId),
        DASHBOARD_BUTTONS.viewProfile(userId),
        DASHBOARD_BUTTONS.viewStorage(userId),
        DASHBOARD_BUTTONS.viewRefresh(userId)
    );

    // Row 3: Animal care
    const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        DASHBOARD_BUTTONS.careFeed(userId).setStyle(hasAnimals ? 1 : 2).setDisabled(!hasAnimals),
        DASHBOARD_BUTTONS.carePet(userId).setStyle(hasAnimals ? 1 : 2).setDisabled(!hasAnimals),
        DASHBOARD_BUTTONS.careClean(userId).setStyle(hasAnimals ? 1 : 2).setDisabled(!hasAnimals)
    );

    // Row 4: Visual commands + Upgrade
    const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        DASHBOARD_BUTTONS.viewFarm(userId),
        DASHBOARD_BUTTONS.viewBarn(userId),
        DASHBOARD_BUTTONS.viewLeaderboard(userId),
        DASHBOARD_BUTTONS.viewUpgrade(userId)
    );

    return { embed, components: [row1, row2, row3, row4] };
}

// Create persistent action buttons (used on ALL views)
function createActionButtons(userId: string): ActionRowBuilder<ButtonBuilder>[] {
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        DASHBOARD_BUTTONS.viewDaily(userId),
        DASHBOARD_BUTTONS.viewScratch(userId),
        DASHBOARD_BUTTONS.viewHarvest(userId)
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        DASHBOARD_BUTTONS.viewMarket(userId),
        DASHBOARD_BUTTONS.viewProfile(userId),
        DASHBOARD_BUTTONS.viewMain(userId)
    );

    return [row1, row2];
}

function createResultView(embed: EmbedBuilder, userId: string, emoji: string) {
    embed.setFooter({ text: getRandomTip() });
    const buttons = createActionButtons(userId);
    return { embed, components: buttons };
}

function createProfileView(profile: any, username: string, avatar: string, userId: string) {
    const currentLevel = levels.find((l: any) => l.level === profile.level);
    const xpToNext = currentLevel?.xp_to_upgrade || 1000;

    let storageCount = 0;
    profile.storage.market_items.forEach((v: any) => storageCount += v?.amount ?? 0);
    profile.storage.products.forEach((v: any) => storageCount += v?.amount ?? 0);

    const embed = new EmbedBuilder()
        .setTitle(`👨‍🌾 ${username}'s Profile`)
        .setColor(COLORS.PRIMARY)
        .setThumbnail(avatar)
        .addFields(
            { name: "⭐ Level", value: `**${profile.level ?? 1}**`, inline: true },
            { name: "✨ XP", value: `**${formatNumber(profile.xp ?? 0)}** / ${formatNumber(xpToNext)}`, inline: true },
            { name: "💰 Gold", value: `**${formatNumber(profile.gold ?? 0)}**`, inline: true }
        )
        .addFields(
            { name: "🌱 Farm Level", value: `**${profile.farm?.level ?? 1}**`, inline: true },
            { name: "📦 Storage", value: storageIndicator(storageCount, profile.farm?.storage_limit ?? 50), inline: true },
            { name: "🌾 Crop Slots", value: `**${profile.farm?.available_crop_slots ?? 0}**`, inline: true }
        )
        .addFields(
            { name: "🐔 Animal Slots", value: `**${profile.farm?.available_animal_slots ?? 0}**`, inline: true }
        )
        .setTimestamp();

    return { embed, components: createActionButtons(userId) };
}

function createMarketView(profile: any, userId: string) {
    // Group by type
    const seeds = marketItems.filter(i => i.type === "seeds").slice(0, 5);
    const animals = marketItems.filter(i => i.type === "animals").slice(0, 5);

    const seedsList = seeds.map(s => `${getItemEmoji('seeds')} **${s.name}** - ${formatNumber(s.buy_price)} 🪙`).join('\n');
    const animalsList = animals.map(a => `${getItemEmoji('animals')} **${a.name}** - ${formatNumber(a.buy_price)} 🪙`).join('\n');

    const embed = new EmbedBuilder()
        .setTitle("🛒 Market Preview")
        .setColor(COLORS.PRIMARY)
        .setDescription(`💰 Your Gold: **${formatNumber(profile.gold)}** 🪙\n\nUse \`/buy <item>\` to purchase!`)
        .addFields(
            { name: "🌱 Seeds", value: seedsList || "None available", inline: true },
            { name: "🐔 Animals", value: animalsList || "None available", inline: true }
        )
        .setFooter({ text: "Use /market for full list with details" });

    return { embed, components: createActionButtons(userId) };
}

function createStorageView(profile: any, userId: string) {
    const products = profile.storage.products || [];
    const marketItemsStorage = profile.storage.market_items || [];

    let storageCount = 0;
    products.forEach((v: any) => storageCount += v?.amount ?? 0);
    marketItemsStorage.forEach((v: any) => storageCount += v?.amount ?? 0);

    // Build products list
    const productsList = products
        .filter((p: any) => p && p.amount > 0)
        .map((p: any) => `• **${p.amount}x** ${p.name}`)
        .join('\n') || "No products";

    // Build market items list (seeds/animals)
    const itemsList = marketItemsStorage
        .filter((i: any) => i && i.amount > 0)
        .map((i: any) => `• **${i.amount}x** ${i.name}`)
        .join('\n') || "No items";

    // Calculate sell value (handle Bun ES module JSON format)
    const productsConfigRaw = require("../config/items/products.json");
    const productsConfig = productsConfigRaw.default || productsConfigRaw;
    let totalSellValue = 0;
    products.forEach((p: any) => {
        const config = productsConfig.find((c: any) => c.name === p?.name);
        if (config && p?.amount) totalSellValue += config.sell_price * p.amount;
    });

    const embed = new EmbedBuilder()
        .setTitle("📦 Storage")
        .setColor(COLORS.PRIMARY)
        .setDescription(`**${storageCount}** / **${profile.farm.storage_limit}** items\n${storageIndicator(storageCount, profile.farm.storage_limit)}`)
        .addFields(
            { name: "🌾 Products", value: productsList, inline: true },
            { name: "🛒 Market Items", value: itemsList, inline: true }
        )
        .addFields(
            { name: "💰 Total Sell Value", value: `**${formatNumber(totalSellValue)}** 🪙`, inline: false }
        )
        .setFooter({ text: "Use Sell button to sell all products" });

    return { embed, components: createActionButtons(userId) };
}

function createUpgradeView(profile: any, userId: string) {
    const upgrades = require("../config/upgrades/farms.json");
    const currentLevel = profile.farm.level || 1;
    const nextUpgrade = upgrades.find((u: any) => u.level === currentLevel + 1);
    const currentUpgrade = upgrades.find((u: any) => u.level === currentLevel);

    let description = "";
    if (!nextUpgrade) {
        description = "🎉 **MAX LEVEL!** Your farm is fully upgraded!";
    } else {
        const canAfford = profile.gold >= nextUpgrade.price;
        description = `💰 Your Gold: **${formatNumber(profile.gold)}** 🪙\n\n`;
        description += canAfford
            ? "✅ **You can upgrade!** Use `/upgradefarm` to upgrade!"
            : `❌ Need **${formatNumber(nextUpgrade.price - profile.gold)}** more gold`;
    }

    const embed = new EmbedBuilder()
        .setTitle("⏫ Farm Upgrades")
        .setColor(COLORS.PRIMARY)
        .setDescription(description);

    // Current stats
    if (currentUpgrade) {
        embed.addFields({
            name: `📍 Current: Level ${currentLevel}`,
            value: `🌱 ${currentUpgrade.available_crop_slots} crop slots\n🐔 ${currentUpgrade.available_animal_slots} animal slots\n📦 ${currentUpgrade.storage_limit} storage`,
            inline: true
        });
    }

    // Next level stats
    if (nextUpgrade) {
        embed.addFields({
            name: `⏫ Next: Level ${currentLevel + 1} (${formatNumber(nextUpgrade.price)} 🪙)`,
            value: `🌱 ${nextUpgrade.available_crop_slots} crop slots (+${nextUpgrade.available_crop_slots - currentUpgrade.available_crop_slots})\n🐔 ${nextUpgrade.available_animal_slots} animal slots (+${nextUpgrade.available_animal_slots - currentUpgrade.available_animal_slots})\n📦 ${nextUpgrade.storage_limit} storage (+${nextUpgrade.storage_limit - currentUpgrade.storage_limit})`,
            inline: true
        });
    }

    embed.setFooter({ text: "Use /upgradefarm to upgrade" });

    return { embed, components: createActionButtons(userId) };
}

function createNavView(command: string, userId: string) {
    const commandInfo: Record<string, { title: string; desc: string; emoji: string }> = {
        farm: { title: "🌱 Farm View", desc: "Use `/farm` to see your visual farm with planted crops!", emoji: "🌱" },
        barn: { title: "🐔 Barn View", desc: "Use `/barn` to see your visual barn with raised animals!", emoji: "🐔" },
        leaderboard: { title: "📊 Leaderboard", desc: "Use `/leaderboard xp` or `/leaderboard gold` to see rankings!", emoji: "📊" }
    };

    const info = commandInfo[command] || { title: `/${command}`, desc: `Use \`/${command}\` to access this feature!`, emoji: "📋" };

    const embed = new EmbedBuilder()
        .setTitle(info.title)
        .setColor(COLORS.PRIMARY)
        .setDescription(info.desc)
        .setFooter({ text: "These features require visual rendering" });

    return { embed, components: createActionButtons(userId) };
}

function createBackRow(userId: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        BUTTONS.backDashboard()
    );
}

// --- Action Executors ---

async function executeDailyAction(profile: any, dbProfile: any, userId: string) {
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

async function executeScratchAction(profile: any, dbProfile: any, userId: string) {
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
    const goldBefore = profile.gold;
    const xpBefore = profile.xp;

    // Update database
    dbProfile.scratch = now + 1000 * 60 * 60 * 8;
    if (isGold) dbProfile.gold += goldReward;
    else dbProfile.xp += xpReward;
    dbProfile.markModified("scratch");
    dbProfile.markModified("gold");
    dbProfile.markModified("xp");
    await dbProfile.save();

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

async function executeHarvestAction(profile: any, dbProfile: any, userId: string) {
    // Calculate storage
    let storageCount = 0;
    profile.storage.market_items.forEach((v: any) => storageCount += v?.amount ?? 0);
    profile.storage.products.forEach((v: any) => storageCount += v?.amount ?? 0);
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

async function executeSellAction(profile: any, dbProfile: any, userId: string) {
    const productsModule = require("../config/items/products.json");
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
