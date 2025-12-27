import { ActivityType, Client, Events, GatewayIntentBits, MessageFlags, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder } from 'discord.js';
import { deployCommands, flushCommands } from './handlers/command.ts';
import { commands } from './commands';
import MongooseInit from "./database/connect.ts";
import NodeCache from 'node-cache';
import { createMarketView } from './utils/views.ts';
import { formatNumber } from './utils/ux.ts';
import { createMainView, setupDashboardCollector, executeDailyAction, executeScratchAction, executeHarvestAction, executeSellAction } from './commands/dashboard.ts';
import { createFarmView } from './commands/farm.ts';
import { createBarnView } from './commands/barn.ts';
import { createLeaderboardEmbed, createPaginationButtons, USERS_PER_PAGE, type UserProfile } from './commands/leaderboard.ts';
import { createWelcomeEmbed, STARTER_BONUS } from './utils/onboarding.ts';
import database from "./database/methods.ts";
import { BTN_STYLE } from "./utils/button_handler.ts";
import { BUTTONS } from "./utils/buttons.ts";
import { COLORS, ERRORS, BOT_VERSION } from "./utils/constants.ts";
import { logger } from "./utils/logger.ts";
import { logButtonClick, logSelectMenu } from "./utils/interaction_logger.ts";
import { pushView, popView, getDepth, clearWidget, startCleanupInterval, addBackButton, type ViewName } from "./utils/nav_history.ts";

// Global error handlers to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT EXCEPTION]', error);
  logger.error(`Uncaught Exception: ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
  logger.error(`Unhandled Rejection: ${reason}`);
});

const userProfileCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });
const cooldowns = new Map();

export { userProfileCache };

const databaseConnection = new MongooseInit(process.env.mongo_connection!);
logger.banner();
logger.loading("Connecting to MongoDB");
await databaseConnection.connect();
logger.success("Connected to MongoDB");

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages], allowedMentions: { repliedUser: false } });

let currentStatus = ["/help", "", `build ${BOT_VERSION}`];
let i = 0;

let commandsLogChannel: TextChannel;
const commandsLogChannelId = process.env.COMMANDS_LOG_CHANNEL_ID!;

client.on(Events.ClientReady, async readyClient => {
  logger.loading("Deploying commands");
  await deployCommands();
  logger.success(`Deployed ${Object.keys(commands).length} commands`);

  commandsLogChannel = await client.channels.fetch(commandsLogChannelId) as TextChannel;

  logger.ready(readyClient.user.tag, client.guilds.cache.size);
  startCleanupInterval(); // Start nav history cleanup
  client.user?.setStatus("idle");

  setInterval(() => {
    currentStatus[1] = `${client.guilds.cache.size} servers`;
    client.user?.setActivity(currentStatus[i], { type: ActivityType.Watching });
    i++;
    i = (i + 1) % currentStatus.length;
  }, 15000);
});


client.on("interactionCreate", async (interaction) => {
  // Handle button interactions globally
  if (interaction.isButton()) {
    const customId = interaction.customId;

    // Log button click (console + Discord channel)
    logger.btn(customId, interaction.user.id, interaction.guild?.name);
    void logButtonClick(client, customId, interaction.user.id, interaction.user.username, interaction.guild?.name, interaction.guild?.id);

    // Handle navigation buttons - UPDATE the original message
    if (customId.startsWith("nav:")) {
      const target = customId.split(":")[1];
      const userId = interaction.user.id;

      try {
        // Help doesn't require profile - show quick start guide!
        if (target === "help") {
          const { EmbedBuilder } = await import('discord.js');
          const { COLORS } = await import('./utils/constants.ts');

          const quickStart = new EmbedBuilder()
            .setTitle("❓ Quick Start Guide")
            .setColor(COLORS.PRIMARY)
            .setDescription("Here's how to get started with Earth Farm!")
            .addFields(
              { name: "🌾 Getting Started", value: "1. Click **Create My Farm** to start\n2. Claim your **daily** reward\n3. **Plant** your free wheat seeds\n4. Wait 2 mins then **harvest**\n5. **Sell** products for gold!", inline: false },
              { name: "💰 Key Commands", value: "`/dashboard` - Quick actions hub\n`/daily` - Daily gold reward\n`/plant` - Plant seeds\n`/harvest` - Collect products\n`/sell` - Sell for gold", inline: true },
              { name: "📊 More Commands", value: "`/help` - Full command list\n`/market` - Buy seeds/animals\n`/farm` - View your farm\n`/barn` - View animals\n`/leaderboard` - Rankings", inline: true }
            )
            .setFooter({ text: "💡 Start by clicking Create My Farm above!" });

          await interaction.reply({ embeds: [quickStart], flags: MessageFlags.Ephemeral });
          return;
        }

        // Back navigation - pop from history and render previous view
        if (target === "back") {
          const parts = customId.split(":");
          const targetUserId = parts[2];
          const targetMessageId = parts[3];

          // Security: Validate ownership
          if (userId !== targetUserId) {
            await interaction.reply({ content: "Not your button!", flags: MessageFlags.Ephemeral });
            return;
          }

          const previousView = popView(userId, targetMessageId);

          // If no history, go to dashboard
          if (!previousView || previousView === 'dashboard') {
            // Get profile for dashboard
            let userProfile: any = userProfileCache.get(userId);
            if (!userProfile) {
              const dbProfile = await database.findUser(userId);
              if (!dbProfile) {
                await interaction.reply({ content: "Profile not found!", flags: MessageFlags.Ephemeral });
                return;
              }
              userProfile = (dbProfile as any).toObject();
              userProfileCache.set(userId, userProfile);
            }

            const username = interaction.user.username;
            const avatar = interaction.user.displayAvatarURL({ size: 128 });
            const view = createMainView(userProfile, username, avatar, userId);
            const response = await interaction.update({ embeds: [view.embed], components: view.components, files: [], withResponse: true });
            const message = response.resource?.message;
            if (message) {
              setupDashboardCollector(message, userId, username, avatar, interaction.client);
            }
            return;
          }

          // Get profile for rendering
          let userProfile: any = userProfileCache.get(userId);
          if (!userProfile) {
            const dbProfile = await database.findUser(userId);
            if (!dbProfile) {
              await interaction.reply({ content: "Profile not found!", flags: MessageFlags.Ephemeral });
              return;
            }
            userProfile = (dbProfile as any).toObject();
            userProfileCache.set(userId, userProfile);
          }

          const username = interaction.user.username;
          const avatar = interaction.user.displayAvatarURL({ size: 128 });
          const messageId = interaction.message?.id || targetMessageId;

          // Render the previous view
          try {
            if (previousView === 'farm') {
              const farmView = await createFarmView(userProfile, username, userId, messageId);
              await interaction.update({ content: farmView.content, embeds: [], files: [farmView.attachment], components: farmView.components });
            } else if (previousView === 'barn') {
              const barnView = await createBarnView(userProfile, username, userId, messageId);
              await interaction.update({ content: barnView.content, embeds: [], files: [barnView.attachment], components: barnView.components });
            } else if (previousView === 'leaderboard') {
              await interaction.deferUpdate();
              const allProfiles = await database.getAllUsers() as unknown as UserProfile[];
              const sortedProfiles = allProfiles.sort((a, b) => (b.xp || 0) - (a.xp || 0));
              const totalPages = Math.ceil(sortedProfiles.length / USERS_PER_PAGE);
              const lbEmbed = createLeaderboardEmbed(sortedProfiles, 'xp', 0, totalPages, userId);
              const lbRow = createPaginationButtons(0, totalPages);
              const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(BUTTONS.dashboard());
              if (getDepth(userId, messageId) > 0) {
                backRow.addComponents(BUTTONS.backHistory(userId, messageId));
              }
              await interaction.editReply({ embeds: [lbEmbed], components: [lbRow, backRow], files: [] });
            } else {
              // Default to dashboard
              const view = createMainView(userProfile, username, avatar, userId);
              const response = await interaction.update({ embeds: [view.embed], components: view.components, files: [], withResponse: true });
              const message = response.resource?.message;
              if (message) {
                setupDashboardCollector(message, userId, username, avatar, interaction.client);
              }
            }
          } catch (err) {
            logger.error(`Nav back render error:`, err);
            await interaction.reply({ content: "Failed to go back. Try `/dashboard`.", flags: MessageFlags.Ephemeral });
          }
          return;
        }

        // Get user profile for views
        let userProfile: any = userProfileCache.get(userId);
        if (!userProfile) {
          const dbProfile = await database.findUser(userId);
          if (!dbProfile) {
            const welcome = (await import('./utils/onboarding.ts')).createNoProfileEmbed(userId);
            await interaction.reply({ ...welcome, flags: MessageFlags.Ephemeral });
            return;
          }
          userProfile = (dbProfile as any).toObject();
          userProfileCache.set(userId, userProfile);
        }

        // Dashboard - show full UI inline with working collector
        if (target === "dashboard") {
          const username = interaction.user.username;
          const avatar = interaction.user.displayAvatarURL({ size: 128 });
          const view = createMainView(userProfile, username, avatar, userId);

          // Update the message with dashboard view (files:[] removes farmer image)
          const response = await interaction.update({ embeds: [view.embed], components: view.components, files: [], withResponse: true });
          const message = response.resource?.message;

          // Setup collector for dashboard buttons
          if (message) {
            setupDashboardCollector(message, userId, username, avatar, interaction.client);
          }
          return;
        }

        // Leaderboard - show inline with pagination
        if (target === "leaderboard") {
          try {
            const messageId = interaction.message?.id;

            // Track navigation history
            if (messageId) pushView(userId, messageId, 'dashboard');

            // Get all user profiles
            const allProfiles = await database.getAllUsers() as unknown as UserProfile[];
            const sortedProfiles = allProfiles.sort((a, b) => (b.xp || 0) - (a.xp || 0));
            const totalPages = Math.ceil(sortedProfiles.length / USERS_PER_PAGE);
            let currentPage = 0;

            // Create initial embed
            const embed = createLeaderboardEmbed(sortedProfiles, "xp", currentPage, totalPages, userId);

            // Create back to dashboard button row with history back button
            const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
              BUTTONS.backDashboard().setLabel("← Back to Dashboard")
            );
            if (messageId && getDepth(userId, messageId) > 0) {
              backRow.addComponents(BUTTONS.backHistory(userId, messageId));
            }

            // No pagination needed for small leaderboards
            if (totalPages <= 1) {
              await interaction.update({ embeds: [embed], components: [backRow], files: [] });
              return;
            }

            const row = createPaginationButtons(currentPage, totalPages);
            const response = await interaction.update({ embeds: [embed], components: [row, backRow], files: [], withResponse: true });
            const message = response.resource?.message;

            if (!message) return;

            // Create collector for pagination
            const collector = message.createMessageComponentCollector({
              time: 120000 // 2 minutes
            });

            collector.on("collect", async (i: any) => {
              if (i.user.id !== userId) {
                await i.reply({ content: "You can only navigate your own leaderboard.", flags: MessageFlags.Ephemeral });
                return;
              }

              if (i.customId === "lb_prev") currentPage = Math.max(0, currentPage - 1);
              else if (i.customId === "lb_next") currentPage = Math.min(totalPages - 1, currentPage + 1);
              else if (i.customId === "lb_first") currentPage = 0;
              else if (i.customId === "lb_last") currentPage = totalPages - 1;

              const newEmbed = createLeaderboardEmbed(sortedProfiles, "xp", currentPage, totalPages, userId);
              const newRow = createPaginationButtons(currentPage, totalPages);
              await i.update({ embeds: [newEmbed], components: [newRow, backRow] });
            });

            collector.on("end", async () => {
              const disabledRow = createPaginationButtons(currentPage, totalPages, true);
              await message.edit({ components: [disabledRow, backRow] }).catch(() => { });
            });
          } catch (err) {
            logger.error(`Leaderboard inline error:`, err);
            await interaction.reply({ content: "Failed to load leaderboard. Try `/leaderboard xp`.", flags: MessageFlags.Ephemeral });
          }
          return;
        }

        // Farm - show actual farm canvas image inline!
        if (target === "farm") {
          try {
            const username = interaction.user.username;
            const messageId = interaction.message?.id;

            // Track navigation history
            if (messageId) pushView(userId, messageId, 'dashboard');

            const farmView = await createFarmView(userProfile, username, userId, messageId);

            await interaction.update({
              content: farmView.content,
              embeds: [],
              files: [farmView.attachment],
              components: farmView.components
            });
          } catch (err) {
            logger.error(`Farm inline error:`, err);
            await interaction.reply({ content: "Failed to load farm. Try `/farm`.", flags: MessageFlags.Ephemeral });
          }
          return;
        }

        // Barn - show actual barn canvas image inline!
        if (target === "barn") {
          try {
            const username = interaction.user.username;
            const messageId = interaction.message?.id;

            // Track navigation history
            if (messageId) pushView(userId, messageId, 'dashboard');

            const barnView = await createBarnView(userProfile, username, userId, messageId);

            await interaction.update({
              content: barnView.content,
              embeds: [],
              files: [barnView.attachment],
              components: barnView.components
            });
          } catch (err) {
            logger.error(`Barn inline error:`, err);
            await interaction.reply({ content: "Failed to load barn. Try `/barn`.", flags: MessageFlags.Ephemeral });
          }
          return;
        }

        // Harvest - execute harvest action inline!
        if (target === "harvest") {
          try {
            await interaction.deferUpdate();
            const messageId = interaction.message?.id;
            const dbProfile = await database.findUser(userId);
            if (!dbProfile) {
              await interaction.followUp({ content: "Profile not found!", flags: MessageFlags.Ephemeral });
              return;
            }
            // Track navigation history (coming from farm or dashboard)
            if (messageId) pushView(userId, messageId, 'farm');
            const result = await executeHarvestAction(userProfile, dbProfile, userId);
            const backBtn = BUTTONS.dashboard();
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(backBtn);
            const components = addBackButton([row], userId, messageId);
            await interaction.editReply({ embeds: [result.embed], components, files: [] });
          } catch (err) {
            logger.error(`Harvest inline error:`, err);
            await interaction.followUp({ content: "Failed to harvest. Try `/harvest`.", flags: MessageFlags.Ephemeral });
          }
          return;
        }

        // Sell - execute sell action inline!
        if (target === "sell") {
          try {
            await interaction.deferUpdate();
            const messageId = interaction.message?.id;
            const dbProfile = await database.findUser(userId);
            if (!dbProfile) {
              await interaction.followUp({ content: "Profile not found!", flags: MessageFlags.Ephemeral });
              return;
            }
            if (messageId) pushView(userId, messageId, 'barn');
            const result = await executeSellAction(userProfile, dbProfile, userId);
            const backBtn = BUTTONS.dashboard();
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(backBtn);
            const components = addBackButton([row], userId, messageId);
            await interaction.editReply({ embeds: [result.embed], components, files: [] });
          } catch (err) {
            logger.error(`Sell inline error:`, err);
            await interaction.followUp({ content: "Failed to sell. Try `/sell`.", flags: MessageFlags.Ephemeral });
          }
          return;
        }

        // Daily - execute daily action inline!
        if (target === "daily") {
          try {
            await interaction.deferUpdate();
            const messageId = interaction.message?.id;
            const dbProfile = await database.findUser(userId);
            if (!dbProfile) {
              await interaction.followUp({ content: "Profile not found!", flags: MessageFlags.Ephemeral });
              return;
            }
            if (messageId) pushView(userId, messageId, 'dashboard');
            const result = await executeDailyAction(userProfile, dbProfile, userId);
            const backBtn = BUTTONS.dashboard();
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(backBtn);
            const components = addBackButton([row], userId, messageId);
            await interaction.editReply({ embeds: [result.embed], components, files: [] });
          } catch (err) {
            logger.error(`Daily inline error:`, err);
            await interaction.followUp({ content: "Failed to claim daily. Try `/daily`.", flags: MessageFlags.Ephemeral });
          }
          return;
        }

        // Scratch - execute scratch action inline!
        if (target === "scratch") {
          try {
            await interaction.deferUpdate();
            const messageId = interaction.message?.id;
            const dbProfile = await database.findUser(userId);
            if (!dbProfile) {
              await interaction.followUp({ content: "Profile not found!", flags: MessageFlags.Ephemeral });
              return;
            }
            if (messageId) pushView(userId, messageId, 'dashboard');
            const result = await executeScratchAction(userProfile, dbProfile, userId);
            const backBtn = BUTTONS.dashboard();
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(backBtn);
            const components = addBackButton([row], userId, messageId);
            await interaction.editReply({ embeds: [result.embed], components, files: [] });
          } catch (err) {
            logger.error(`Scratch inline error:`, err);
            await interaction.followUp({ content: "Failed to scratch. Try `/scratch`.", flags: MessageFlags.Ephemeral });
          }
          return;
        }

        // Plant - show inline seed planting UI!
        if (target === "plant") {
          try {
            const messageId = interaction.message?.id;

            // Track navigation history
            if (messageId) pushView(userId, messageId, 'farm');

            // Get user's seeds from storage
            const userSeeds = userProfile.storage.market_items.filter(
              (item: any) => item && item.amount > 0
            );

            const availableSlots = userProfile.farm.available_crop_slots - userProfile.farm.occupied_crop_slots.length;

            const embed = new EmbedBuilder()
              .setTitle("🌱 Plant Seeds")
              .setColor(COLORS.PRIMARY)
              .addFields(
                { name: "🌾 Available Crop Slots", value: `**${availableSlots}** slots`, inline: true },
                { name: "💰 Gold", value: `**${formatNumber(userProfile.gold)}** 🪙`, inline: true }
              );

            const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

            if (userSeeds.length === 0) {
              embed.setDescription("You don't have any seeds! Buy some from the market first.");
              const buyRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                BUTTONS.market().setLabel("Buy Seeds"),
                BUTTONS.farm().setLabel("← Back to Farm")
              );
              components.push(addBackButton([buyRow], userId, messageId)[0]);
            } else if (availableSlots <= 0) {
              embed.setDescription("No crop slots available! Harvest your crops first.");
              const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                BUTTONS.harvest().setLabel("Harvest Crops"),
                BUTTONS.farm().setLabel("← Back to Farm")
              );
              components.push(addBackButton([backRow], userId, messageId)[0]);
            } else {
              embed.setDescription("Select a seed to plant from your storage:");

              // Show seeds in storage
              const seedsList = userSeeds.map((s: any) => `• **${s.name}** x${s.amount}`).join("\\n");
              embed.addFields({ name: "📦 Your Seeds", value: seedsList || "None", inline: false });

              // Create select menu for seeds
              const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`plant:select:${userId}`)
                .setPlaceholder("Select a seed to plant...")
                .addOptions(userSeeds.slice(0, 25).map((seed: any) => ({
                  label: `${seed.name} (x${seed.amount})`,
                  description: `Plant in ${Math.min(seed.amount, availableSlots)} slots`,
                  value: seed.name.toLowerCase()
                })));

              components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));

              const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                BUTTONS.farm().setLabel("← Back to Farm")
              );
              components.push(addBackButton([backRow], userId, messageId)[0]);
            }

            await interaction.update({ content: "", embeds: [embed], components, files: [] });
          } catch (err) {
            logger.error(`Plant inline error:`, err);
            await interaction.followUp({ content: "Failed to load plant view. Try `/plant`.", flags: MessageFlags.Ephemeral });
          }
          return;
        }

        // Raise - show inline animal selection UI!
        if (target === "raise") {
          try {
            const messageId = interaction.message?.id;
            if (messageId) pushView(userId, messageId, 'barn');

            // Get user's animals in storage (bought but not placed)
            const userAnimals = userProfile.storage.market_items.filter(
              (item: any) => {
                if (!item || item.amount <= 0) return false;
                // Check if it's an animal by looking at market items
                const marketItem = require('./config/items/market_items.json').find(
                  (m: any) => m.name.toLowerCase() === item.name.toLowerCase()
                );
                return marketItem?.type === "animals";
              }
            );

            const availableSlots = userProfile.farm.available_animal_slots - userProfile.farm.occupied_animal_slots.length;

            const embed = new EmbedBuilder()
              .setTitle("🐔 Raise Animal")
              .setColor(COLORS.PRIMARY)
              .addFields(
                { name: "🐾 Available Animal Slots", value: `**${availableSlots}** slots`, inline: true },
                { name: "💰 Gold", value: `**${formatNumber(userProfile.gold)}** 🪙`, inline: true }
              );

            const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

            if (userAnimals.length === 0) {
              embed.setDescription("You don't have any animals! Buy some from the market first.");
              const buyRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                BUTTONS.market().setLabel("Buy Animals"),
                BUTTONS.barn().setLabel("← Back to Barn")
              );
              components.push(addBackButton([buyRow], userId, messageId)[0]);
            } else if (availableSlots <= 0) {
              embed.setDescription("No animal slots available! Upgrade your farm for more slots.");
              const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                BUTTONS.barn().setLabel("← Back to Barn")
              );
              components.push(addBackButton([backRow], userId, messageId)[0]);
            } else {
              embed.setDescription("Select an animal to raise from your storage:");
              const animalsList = userAnimals.map((a: any) => `• **${a.name}** x${a.amount}`).join("\\n");
              embed.addFields({ name: "📦 Your Animals", value: animalsList || "None", inline: false });

              const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`raise:select:${userId}`)
                .setPlaceholder("Select an animal to raise...")
                .addOptions(userAnimals.slice(0, 25).map((animal: any) => ({
                  label: `${animal.name} (x${animal.amount})`,
                  description: `Place in ${Math.min(animal.amount, availableSlots)} slots`,
                  value: animal.name.toLowerCase()
                })));

              components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));
              const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                BUTTONS.barn().setLabel("← Back to Barn")
              );
              components.push(addBackButton([backRow], userId, messageId)[0]);
            }

            await interaction.update({ content: "", embeds: [embed], components, files: [] });
          } catch (err) {
            logger.error(`Raise inline error:`, err);
            await interaction.followUp({ content: "Failed to load raise view. Try `/raise`.", flags: MessageFlags.Ephemeral });
          }
          return;
        }

        // Market - show inline market view!
        if (target === "market") {
          try {
            const messageId = interaction.message?.id;
            if (messageId) pushView(userId, messageId, 'dashboard');

            const marketView = createMarketView("main", userProfile.gold, null, userId, messageId);
            await interaction.update({ content: "", embeds: marketView.embeds, components: marketView.components, files: [] });
          } catch (err) {
            logger.error(`Market inline error:`, err);
            await interaction.followUp({ content: "Failed to load market. Try `/market`.", flags: MessageFlags.Ephemeral });
          }
          return;
        }

        // XP - show inline XP progress!
        if (target === "xp") {
          try {
            const messageId = interaction.message?.id;
            if (messageId) pushView(userId, messageId, 'dashboard');

            const xp = userProfile.xp || 0;
            const level = userProfile.level || 1;
            const xpForNextLevel = level * 100; // Example formula
            const progress = Math.min((xp % xpForNextLevel) / xpForNextLevel * 100, 100).toFixed(1);

            const embed = new EmbedBuilder()
              .setTitle("⭐ XP Progress")
              .setColor(COLORS.PRIMARY)
              .addFields(
                { name: "📊 Level", value: `**${level}**`, inline: true },
                { name: "⭐ Total XP", value: `**${formatNumber(xp)}**`, inline: true },
                { name: "📈 Progress", value: `**${progress}%** to next level`, inline: true }
              );

            const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(BUTTONS.dashboard());
            await interaction.update({ content: "", embeds: [embed], components: addBackButton([backRow], userId, messageId), files: [] });
          } catch (err) {
            logger.error(`XP inline error:`, err);
            await interaction.followUp({ content: "Failed to load XP. Try `/xp`.", flags: MessageFlags.Ephemeral });
          }
          return;
        }

        // Gold - show inline gold balance!
        if (target === "gold") {
          try {
            const messageId = interaction.message?.id;
            if (messageId) pushView(userId, messageId, 'dashboard');

            const embed = new EmbedBuilder()
              .setTitle("💰 Gold Balance")
              .setColor(0xF1C40F)
              .addFields(
                { name: "🪙 Current Gold", value: `**${formatNumber(userProfile.gold || 0)}**`, inline: true },
                { name: "📊 Level", value: `**${userProfile.level || 1}**`, inline: true }
              )
              .setFooter({ text: "Earn gold by selling products and claiming daily rewards!" });

            const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(BUTTONS.dashboard());
            await interaction.update({ content: "", embeds: [embed], components: addBackButton([backRow], userId, messageId), files: [] });
          } catch (err) {
            logger.error(`Gold inline error:`, err);
            await interaction.followUp({ content: "Failed to load gold. Try `/gold`.", flags: MessageFlags.Ephemeral });
          }
          return;
        }

        // Farmer - show inline profile view!
        if (target === "farmer") {
          try {
            const messageId = interaction.message?.id;
            if (messageId) pushView(userId, messageId, 'dashboard');

            const username = interaction.user.username;
            const avatar = interaction.user.displayAvatarURL({ size: 128 });

            const embed = new EmbedBuilder()
              .setTitle(`👤 ${username}'s Farm Profile`)
              .setColor(COLORS.PRIMARY)
              .setThumbnail(avatar)
              .addFields(
                { name: "📊 Level", value: `**${userProfile.level || 1}**`, inline: true },
                { name: "⭐ XP", value: `**${formatNumber(userProfile.xp || 0)}**`, inline: true },
                { name: "💰 Gold", value: `**${formatNumber(userProfile.gold || 0)}**`, inline: true },
                { name: "🌾 Crops", value: `${userProfile.farm.occupied_crop_slots?.length || 0}/${userProfile.farm.available_crop_slots}`, inline: true },
                { name: "🐔 Animals", value: `${userProfile.farm.occupied_animal_slots?.length || 0}/${userProfile.farm.available_animal_slots}`, inline: true },
                { name: "📦 Storage", value: `${userProfile.farm.storage_limit}`, inline: true }
              );

            const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(BUTTONS.dashboard());
            await interaction.update({ content: "", embeds: [embed], components: addBackButton([backRow], userId, messageId), files: [] });
          } catch (err) {
            logger.error(`Farmer inline error:`, err);
            await interaction.followUp({ content: "Failed to load profile. Try `/farmer`.", flags: MessageFlags.Ephemeral });
          }
          return;
        }

        // Feed - show animal list with feed action!
        if (target === "feed") {
          try {
            const messageId = interaction.message?.id;
            if (messageId) pushView(userId, messageId, 'barn');

            const animals = userProfile.farm.occupied_animal_slots || [];

            const embed = new EmbedBuilder()
              .setTitle("🍖 Feed Animals")
              .setColor(COLORS.PRIMARY)
              .setDescription(animals.length === 0
                ? "You don't have any animals to feed!"
                : "Select an animal to feed (resets production timer):");

            const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

            if (animals.length > 0) {
              const animalsList = animals.map((a: any, idx: number) =>
                `**Slot ${idx + 1}:** ${a.name}`
              ).join("\\n");
              embed.addFields({ name: "🐾 Your Animals", value: animalsList, inline: false });

              const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`action:feed:${userId}`)
                .setPlaceholder("Select animal to feed...")
                .addOptions(animals.slice(0, 25).map((animal: any, idx: number) => ({
                  label: `Slot ${idx + 1}: ${animal.name}`,
                  value: String(idx + 1)
                })));
              components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));
            }

            const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(BUTTONS.barn().setLabel("← Back to Barn"));
            components.push(addBackButton([backRow], userId, messageId)[0]);

            await interaction.update({ content: "", embeds: [embed], components, files: [] });
          } catch (err) {
            logger.error(`Feed inline error:`, err);
            await interaction.followUp({ content: "Failed to load feed view. Try `/feed`.", flags: MessageFlags.Ephemeral });
          }
          return;
        }

        // Clean - show animal list with clean action!
        if (target === "clean") {
          try {
            const messageId = interaction.message?.id;
            if (messageId) pushView(userId, messageId, 'barn');

            const animals = userProfile.farm.occupied_animal_slots || [];

            const embed = new EmbedBuilder()
              .setTitle("🧹 Clean Animals")
              .setColor(COLORS.PRIMARY)
              .setDescription(animals.length === 0
                ? "You don't have any animals to clean!"
                : "Select an animal area to clean (boosts production):");

            const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

            if (animals.length > 0) {
              const animalsList = animals.map((a: any, idx: number) =>
                `**Slot ${idx + 1}:** ${a.name}`
              ).join("\\n");
              embed.addFields({ name: "🐾 Your Animals", value: animalsList, inline: false });

              const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`action:clean:${userId}`)
                .setPlaceholder("Select animal area to clean...")
                .addOptions(animals.slice(0, 25).map((animal: any, idx: number) => ({
                  label: `Slot ${idx + 1}: ${animal.name}`,
                  value: String(idx + 1)
                })));
              components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));
            }

            const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(BUTTONS.barn().setLabel("← Back to Barn"));
            components.push(addBackButton([backRow], userId, messageId)[0]);

            await interaction.update({ content: "", embeds: [embed], components, files: [] });
          } catch (err) {
            logger.error(`Clean inline error:`, err);
            await interaction.followUp({ content: "Failed to load clean view. Try `/clean`.", flags: MessageFlags.Ephemeral });
          }
          return;
        }

        // Pet - show animal list with pet action!
        if (target === "pet") {
          try {
            const messageId = interaction.message?.id;
            if (messageId) pushView(userId, messageId, 'barn');

            const animals = userProfile.farm.occupied_animal_slots || [];

            const embed = new EmbedBuilder()
              .setTitle("❤️ Pet Animals")
              .setColor(0xE91E63)
              .setDescription(animals.length === 0
                ? "You don't have any animals to pet!"
                : "Select an animal to pet (increases happiness):");

            const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

            if (animals.length > 0) {
              const animalsList = animals.map((a: any, idx: number) =>
                `**Slot ${idx + 1}:** ${a.name}`
              ).join("\\n");
              embed.addFields({ name: "🐾 Your Animals", value: animalsList, inline: false });

              const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`action:pet:${userId}`)
                .setPlaceholder("Select animal to pet...")
                .addOptions(animals.slice(0, 25).map((animal: any, idx: number) => ({
                  label: `Slot ${idx + 1}: ${animal.name}`,
                  value: String(idx + 1)
                })));
              components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));
            }

            const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(BUTTONS.barn().setLabel("← Back to Barn"));
            components.push(addBackButton([backRow], userId, messageId)[0]);

            await interaction.update({ content: "", embeds: [embed], components, files: [] });
          } catch (err) {
            logger.error(`Pet inline error:`, err);
            await interaction.followUp({ content: "Failed to load pet view. Try `/pet`.", flags: MessageFlags.Ephemeral });
          }
          return;
        }

        // Help - show inline help!
        if (target === "help") {
          try {
            const messageId = interaction.message?.id;
            if (messageId) pushView(userId, messageId, 'dashboard');

            const embed = new EmbedBuilder()
              .setTitle("❓ Earth Farm Help")
              .setColor(COLORS.PRIMARY)
              .setDescription("Quick command reference:")
              .addFields(
                { name: "🌾 Farming", value: "`/plant` · `/harvest` · `/farm`", inline: true },
                { name: "🐔 Animals", value: "`/raise` · `/feed` · `/clean` · `/pet`", inline: true },
                { name: "💰 Economy", value: "`/sell` · `/market` · `/daily` · `/scratch`", inline: true },
                { name: "📊 Stats", value: "`/xp` · `/gold` · `/farmer` · `/leaderboard`", inline: true },
                { name: "🏠 Navigation", value: "`/dashboard` · `/barn`", inline: true }
              )
              .setFooter({ text: "Tip: Use /dashboard for one-click access to everything!" });

            const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(BUTTONS.dashboard());
            await interaction.update({ content: "", embeds: [embed], components: addBackButton([backRow], userId, messageId), files: [] });
          } catch (err) {
            logger.error(`Help inline error:`, err);
            await interaction.followUp({ content: "Failed to load help. Try `/help`.", flags: MessageFlags.Ephemeral });
          }
          return;
        }

        // For other commands that can't be shown inline, show ephemeral hint
        // All known commands now have inline handlers above
        await interaction.reply({ content: `Type \`/${target}\` to use this command!`, flags: MessageFlags.Ephemeral });
      } catch (err) {
        logger.error(`Nav button error:`, err);
        await interaction.reply({ content: `❌ Error! Type the command instead.`, flags: MessageFlags.Ephemeral }).catch(() => { });
      }
      return;
    }

    // Handle market category buttons - UPDATE in place
    if (customId.startsWith("market:")) {
      const action = customId.split(":")[1];
      const userId = interaction.user.id;

      try {
        // Get user profile
        let userProfile: any = userProfileCache.get(userId);
        if (!userProfile) {
          const dbProfile = await database.findUser(userId);
          if (!dbProfile) {
            const welcome = (await import('./utils/onboarding.ts')).createNoProfileEmbed(userId);
            await interaction.reply({ ...welcome, flags: MessageFlags.Ephemeral });
            return;
          }
          userProfile = (dbProfile as any).toObject();
          userProfileCache.set(userId, userProfile);
        }

        // Category switching
        if (["main", "animals", "seeds", "upgrades"].includes(action)) {
          const messageId = interaction.message?.id;
          if (messageId) pushView(userId, messageId, 'market');
          const view = createMarketView(action, userProfile.gold || 0, null, userId, messageId);
          await interaction.update(view);
          return;
        }

        // Item selection from dropdown is handled by select menu handler below
        // Buy buttons need original command's context, show hint
        if (action === "buy") {
          await interaction.reply({ content: "💡 Use `/market` to buy items!", flags: MessageFlags.Ephemeral });
          return;
        }

      } catch (err) {
        logger.error(`Market button error:`, err);
        await interaction.reply({ content: `❌ Error! Use \`/market\` instead.`, flags: MessageFlags.Ephemeral }).catch(() => { });
      }
      return;
    }

    // Handle onboarding button - CREATE PROFILE from any command
    if (customId.startsWith("onboard:")) {
      const action = customId.split(":")[1];
      const userId = interaction.user.id;
      const username = interaction.user.username;

      if (action === "create") {
        try {
          // Check if profile already exists
          const existingProfile = await database.findUser(userId);
          if (existingProfile) {
            await interaction.reply({ content: "✅ You already have a farm! Use `/dashboard` to manage it.", flags: MessageFlags.Ephemeral });
            return;
          }

          // Create new profile with starter bonus
          const newUser = await database.createUser(userId, username);
          if (newUser) {
            const profile = newUser as any;

            // Add starter bonus
            profile.gold = (profile.gold || 0) + STARTER_BONUS.gold;

            // Add starter seeds to storage
            for (const seed of STARTER_BONUS.seeds) {
              const existing = profile.storage.market_items.find((i: any) => i?.name === seed.name);
              if (existing) {
                existing.amount += seed.amount;
              } else {
                profile.storage.market_items.push({ name: seed.name, amount: seed.amount });
              }
            }

            profile.markModified("gold");
            profile.markModified("storage.market_items");
            await profile.save();

            // Cache the profile
            userProfileCache.set(userId, profile.toObject());

            // Show welcome message
            const welcome = createWelcomeEmbed(username, userId);
            await interaction.update(welcome);
          } else {
            await interaction.reply({ content: "❌ Failed to create profile. Try `/farmer` instead.", flags: MessageFlags.Ephemeral });
          }
        } catch (err) {
          logger.error("Onboard error:", err);
          await interaction.reply({ content: "❌ Error creating profile. Try `/farmer` instead.", flags: MessageFlags.Ephemeral }).catch(() => { });
        }
        return;
      }
    }

    // Note: view: and care: buttons are handled by dashboard.ts collector
    // The collector's .on('end') handler disables buttons after timeout
    // No global fallback needed here - collectors handle their own interactions
    return;
  }

  // Handle select menu interactions globally
  if (interaction.isStringSelectMenu()) {
    const customId = interaction.customId;
    const selectedValue = interaction.values[0];

    // Log select menu interaction (console + Discord channel)
    logger.select(customId, selectedValue, interaction.user.id, interaction.guild?.name);
    void logSelectMenu(client, customId, selectedValue, interaction.user.id, interaction.user.username, interaction.guild?.name, interaction.guild?.id);

    // Handle market item selection
    if (customId.startsWith("market:select_")) {
      const category = customId.replace("market:select_", "");
      const selectedValue = interaction.values[0];
      const userId = interaction.user.id;

      try {
        // Get user profile
        let userProfile: any = userProfileCache.get(userId);
        if (!userProfile) {
          const dbProfile = await database.findUser(userId);
          if (!dbProfile) {
            const welcome = (await import('./utils/onboarding.ts')).createNoProfileEmbed(userId);
            await interaction.reply({ ...welcome, flags: MessageFlags.Ephemeral });
            return;
          }
          userProfile = (dbProfile as any).toObject();
          userProfileCache.set(userId, userProfile);
        }

        // Find matched item (handle Bun ES module JSON format)
        const marketItemsRaw = require("./config/items/market_items.json");
        const marketItems = marketItemsRaw.default || marketItemsRaw;
        const selectedItem = marketItems.find((item: any) => item.name.toLowerCase() === selectedValue);

        if (selectedItem) {
          const messageId = interaction.message?.id;
          const view = createMarketView(category, userProfile.gold || 0, selectedItem, userId, messageId);
          await interaction.update(view);
        }
      } catch (err) {
        logger.error(`Market select error:`, err);
        await interaction.reply({ content: `❌ Error! Use \`/market\` instead.`, flags: MessageFlags.Ephemeral }).catch(() => { });
      }
      return;
    }

    // Handle leaderboard type selection
    if (customId.startsWith("lb_select:")) {
      const userId = customId.split(":")[1];

      // Verify owner
      if (interaction.user.id !== userId) {
        await interaction.reply({ content: "You can only use your own leaderboard selector.", flags: MessageFlags.Ephemeral });
        return;
      }

      const selectedType = interaction.values[0]; // "xp" or "gold"

      try {
        await interaction.deferUpdate();
        const allProfiles = await database.getAllUsers() as unknown as UserProfile[];

        // Sort by selected type
        const sortedProfiles = allProfiles.sort((a, b) => {
          if (selectedType === "xp") return (b.xp || 0) - (a.xp || 0);
          return (b.gold || 0) - (a.gold || 0);
        });

        const totalPages = Math.ceil(sortedProfiles.length / USERS_PER_PAGE);
        const lbEmbed = createLeaderboardEmbed(sortedProfiles, selectedType, 0, totalPages, userId);

        // Create back to dashboard button row
        const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          BUTTONS.backDashboard().setLabel("← Back to Dashboard")
        );

        if (totalPages <= 1) {
          await interaction.editReply({ embeds: [lbEmbed], components: [backRow] });
        } else {
          const lbRow = createPaginationButtons(0, totalPages);
          await interaction.editReply({ embeds: [lbEmbed], components: [lbRow, backRow] });
        }
      } catch (err) {
        logger.error(`Leaderboard select error:`, err);
        await interaction.editReply({ content: "Failed to load leaderboard.", embeds: [], components: [] });
      }
      return;
    }
  }

  if (!interaction.isCommand()) return;
  if (interaction.user.bot) return await interaction.reply({ content: "bots are not allowed to use me.", flags: MessageFlags.Ephemeral });

  if (cooldowns.has(interaction.user.id)) {
    const cooldown = Number(cooldowns.get(interaction.user.id));
    if (Date.now() < cooldown) {
      const timeLeft = Math.ceil((cooldown - Date.now()) / 1000);
      return await interaction.reply({ content: `You need to wait **${timeLeft}** seconds before using a command again!`, flags: MessageFlags.Ephemeral });
    }
  }

  // Log command usage (console + Discord with rich embed)
  logger.cmd(interaction.commandName, interaction.user.id, interaction.guild?.name);

  const cmdLogEmbed = new EmbedBuilder()
    .setTitle(`⚡ Command Used`)
    .setColor(0x5865F2)
    .setDescription(
      `**Command:** \`/${interaction.commandName}\`\n` +
      `**User:** ${interaction.user.username} (${interaction.user.id})\n` +
      `**Guild:** ${interaction.guild?.name || "DM"} (${interaction.guild?.id || "DM"})`
    )
    .setThumbnail(interaction.user.displayAvatarURL({ size: 64 }))
    .setTimestamp();

  void commandsLogChannel.send({ embeds: [cmdLogEmbed] }).catch(() => logger.warn("Discord log channel send failed"));

  const { commandName } = interaction;
  if (commands[commandName as keyof typeof commands]) await commands[commandName as keyof typeof commands].execute(interaction);
  else await interaction.reply({ content: "That command doesn't exist.", flags: MessageFlags.Ephemeral });

  cooldowns.set(interaction.user.id, Date.now() + 3000); // 3 seconds cooldown
  setTimeout(() => cooldowns.delete(interaction.user.id), 3000);
});

client.on("messageCreate", (message) => {
  if (message.author.id != process.env.ADMIN_USER_ID!) return;

  if (message.content.includes("wipe")) {
    userProfileCache.flushAll();
    return message.reply({ content: "done!" });
  }
});

client.login(process.env.token!);