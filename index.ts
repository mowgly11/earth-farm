import { ActivityType, Client, Events, GatewayIntentBits, MessageFlags, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ButtonInteraction, StringSelectMenuInteraction } from 'discord.js';
import { deployCommands } from './handlers/command.ts';
import { commands } from './commands';
import MongooseInit from "./database/connect.ts";
// NodeCache import removed - now using unified cache from profile_service.ts
import { createMarketView } from './utils/views.ts';
import { formatNumber } from './utils/ux.ts';
import { createMainView, setupDashboardCollector, executeDailyAction, executeScratchAction, executeHarvestAction, executeSellAction } from './commands/dashboard.ts';
import { createFarmView } from './commands/farm.ts';
import { createBarnView } from './commands/barn.ts';
import { createLeaderboardEmbed, createPaginationButtons, USERS_PER_PAGE } from './commands/leaderboard.ts';
import { createWelcomeEmbed, STARTER_BONUS } from './utils/onboarding.ts';
import database from "./database/methods.ts";
import { BUTTONS } from "./utils/buttons.ts";
import { COLORS, ERRORS, BOT_VERSION, INTERVALS } from "./utils/constants.ts";
import { logger, silentCatch } from "./utils/logger.ts";
import { logButtonClick, logSelectMenu } from "./utils/interaction_logger.ts";
import { pushView, popView, getDepth, clearWidget, startCleanupInterval, addBackButton, setCurrentView } from "./utils/nav_history.ts";
import { getProfile } from "./services/index.ts";
import { dispatchNavigation, type NavContext } from "./handlers/navigation.ts";
import fs from "fs";
import type { UserProfile, StorageItem, OccupiedAnimalSlot, MarketItem } from "./types/database_types.ts";

// Global error handlers to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT EXCEPTION]', error);
  logger.error(`Uncaught Exception: ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
  logger.error(`Unhandled Rejection: ${reason}`);
});

// Unified cache - re-exported from profile_service.ts to fix cache desync bug
import { userProfileCache } from './services/profile_service.ts';
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

  // Status rotation interval - store reference for cleanup
  const statusInterval = setInterval(() => {
    currentStatus[1] = `${client.guilds.cache.size} servers`;
    client.user?.setActivity(currentStatus[i], { type: ActivityType.Watching });
    i = (i + 1) % currentStatus.length;
  }, INTERVALS.STATUS_ROTATION);

  // Graceful shutdown handler
  const gracefulShutdown = () => {
    logger.info("Shutting down gracefully...");
    clearInterval(statusInterval);
    client.destroy();
    process.exit(0);
  };

  process.on("SIGINT", gracefulShutdown);
  process.on("SIGTERM", gracefulShutdown);

  // Memory monitoring - log every 5 minutes to console
  setInterval(() => {
    const { heapUsed, rss } = process.memoryUsage();
    const heapMB = Math.round(heapUsed / 1024 / 1024);
    const rssMB = Math.round(rss / 1024 / 1024);
    if (heapMB > 400) {
      logger.warn(`Memory high: heap=${heapMB}MB rss=${rssMB}MB`);
    } else {
      logger.info(`Memory: heap=${heapMB}MB rss=${rssMB}MB`);
    }
  }, 5 * 60 * 1000);

  // Hourly uptime logging to Discord channel with beautiful embed
  const uptimeLogChannelId = process.env.UPTIME_LOG_CHANNEL_ID;
  if (uptimeLogChannelId) {
    const startTime = Date.now();

    // Get container memory limit dynamically
    const getMemoryLimitMB = (): number => {
      try {
        // Try cgroups v2 first (modern Docker/Linux)
        const cgroupV2 = '/sys/fs/cgroup/memory.max';
        if (fs.existsSync(cgroupV2)) {
          const content = fs.readFileSync(cgroupV2, 'utf8').trim();
          if (content !== 'max') {
            return Math.round(parseInt(content) / 1024 / 1024);
          }
        }

        // Try cgroups v1 (older Docker/Linux)
        const cgroupV1 = '/sys/fs/cgroup/memory/memory.limit_in_bytes';
        if (fs.existsSync(cgroupV1)) {
          const bytes = parseInt(fs.readFileSync(cgroupV1, 'utf8').trim());
          // Check if it's not the "unlimited" value (huge number)
          if (bytes < 1e15) {
            return Math.round(bytes / 1024 / 1024);
          }
        }
      } catch (e) {
        // Ignore errors, use fallback
      }

      // Fallback: use total system memory
      const os = require('os');
      return Math.round(os.totalmem() / 1024 / 1024);
    };

    const memoryLimitMB = getMemoryLimitMB();
    logger.info(`Container memory limit detected: ${memoryLimitMB}MB`);

    const sendUptimeEmbed = async () => {
      try {
        const channel = client.channels.cache.get(uptimeLogChannelId) as TextChannel;
        if (!channel) {
          logger.warn(`Uptime log channel not found: ${uptimeLogChannelId}`);
          return;
        }

        const { heapUsed, rss, external, heapTotal } = process.memoryUsage();
        const heapMB = Math.round(heapUsed / 1024 / 1024);
        const heapTotalMB = Math.round(heapTotal / 1024 / 1024);
        const rssMB = Math.round(rss / 1024 / 1024);
        const externalMB = Math.round(external / 1024 / 1024);

        const uptimeMs = Date.now() - startTime;
        const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
        const uptimeMinutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
        const uptimeDays = Math.floor(uptimeHours / 24);
        const remainingHours = uptimeHours % 24;

        // Use RSS as reference for memory percentage (accurate for container environments)
        const memoryPercent = Math.min(100, Math.max(0, Math.round((rssMB / memoryLimitMB) * 100)));
        const filledBars = Math.min(10, Math.max(0, Math.floor(memoryPercent / 10)));
        const emptyBars = Math.max(0, 10 - filledBars);
        const memoryBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);

        // Determine status color based on RSS memory (container perspective)
        const statusColor = rssMB > 400 ? 0xFF4444 : rssMB > 256 ? 0xFFAA00 : 0x00FF88;
        const statusEmoji = rssMB > 400 ? '🔴' : rssMB > 256 ? '🟡' : '🟢';

        const uptimeEmbed = new EmbedBuilder()
          .setColor(statusColor)
          .setTitle(`${statusEmoji} Earth Farm Bot - Hourly Status`)
          .setDescription(`**Status:** Online and Healthy`)
          .addFields(
            {
              name: '⏱️ Uptime',
              value: uptimeDays > 0
                ? `\`${uptimeDays}d ${remainingHours}h ${uptimeMinutes}m\``
                : `\`${uptimeHours}h ${uptimeMinutes}m\``,
              inline: true
            },
            {
              name: '🌐 Servers',
              value: `\`${client.guilds.cache.size}\``,
              inline: true
            },
            {
              name: '📦 Version',
              value: `\`${BOT_VERSION}\``,
              inline: true
            },
            {
              name: '💾 Memory Usage',
              value: `\`\`\`\n${memoryBar} ${memoryPercent}% of ${memoryLimitMB}MB\n\nRSS:      ${rssMB}MB (total)\nHeap:     ${heapMB}MB used\nExternal: ${externalMB}MB\n\`\`\``,
              inline: false
            }
          )
          .setFooter({ text: `🌾 Earth Farm Bot • Next update in 1 hour` })
          .setTimestamp();

        await channel.send({ embeds: [uptimeEmbed] });
        logger.info(`Uptime embed sent to channel ${uptimeLogChannelId}`);
      } catch (error) {
        logger.error('Failed to send uptime embed:', error);
      }
    };

    // Send first embed after 1 minute (to let bot fully start)
    setTimeout(sendUptimeEmbed, 60 * 1000);

    // Then send every hour
    setInterval(sendUptimeEmbed, 60 * 60 * 1000);
    logger.info(`Hourly uptime logging enabled for channel ${uptimeLogChannelId}`);
  }
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

          const previousViewState = popView(userId, targetMessageId);

          // Debug: Log what view we're navigating to
          logger.info(`NavHistory: nav:back handler - user=${userId.slice(-6)} poppedView=${previousViewState?.view || 'null'} navigatingTo=${!previousViewState || previousViewState.view === 'dashboard' ? 'dashboard' : previousViewState.view}`);

          // If no history, go to dashboard
          if (!previousViewState || previousViewState.view === 'dashboard') {
            // Get profile for dashboard (using ProfileService)
            const profileResult = await getProfile(userId);
            if (!profileResult) {
              await interaction.reply({ content: "Profile not found!", flags: MessageFlags.Ephemeral });
              return;
            }
            const userProfile = profileResult.profile;

            const username = interaction.user.username;
            const avatar = interaction.user.displayAvatarURL({ size: 128 });
            const view = createMainView(userProfile, username, avatar, userId);
            const response = await interaction.update({ embeds: [view.embed], components: view.components, files: [], withResponse: true });
            const message = response.resource?.message;
            if (message) {
              setupDashboardCollector(message, userId, username, avatar, interaction.client);
              // Set current view after rendering dashboard
              setCurrentView(userId, targetMessageId, 'dashboard');
            }
            return;
          }

          // Get profile for rendering (using ProfileService)
          const renderProfileResult = await getProfile(userId);
          if (!renderProfileResult) {
            await interaction.reply({ content: "Profile not found!", flags: MessageFlags.Ephemeral });
            return;
          }
          const userProfile = renderProfileResult.profile;

          const username = interaction.user.username;
          const avatar = interaction.user.displayAvatarURL({ size: 128 });
          const messageId = interaction.message?.id || targetMessageId;
          const previousView = previousViewState.view;

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
              // Use state if available for page number
              const page = previousViewState.state?.page ?? 0;
              const lbEmbed = createLeaderboardEmbed(sortedProfiles, 'xp', page, totalPages, userId);
              const lbRow = createPaginationButtons(page, totalPages);
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

        // Get user profile for views (using ProfileService)
        const profileResult = await getProfile(userId);
        if (!profileResult) {
          const welcome = (await import('./utils/onboarding.ts')).createNoProfileEmbed(userId);
          await interaction.reply({ ...welcome, flags: MessageFlags.Ephemeral });
          return;
        }
        const userProfile = profileResult.profile;

        // Dispatch to extracted navigation handlers (farm, barn, harvest, sell, daily, scratch, dashboard, help)
        const navCtx: NavContext = {
          interaction: interaction as any,
          userId,
          userProfile,
          username: interaction.user.username,
          avatar: interaction.user.displayAvatarURL({ size: 128 }),
          messageId: interaction.message?.id
        };
        if (await dispatchNavigation(target, navCtx)) return;



















        // For other commands that can't be shown inline, show ephemeral hint
        // All known commands now have inline handlers above
        await interaction.reply({ content: `Type \`/${target}\` to use this command!`, flags: MessageFlags.Ephemeral });
      } catch (err) {
        logger.error(`Nav button error:`, err);
        await interaction.reply({ content: `❌ Error! Type the command instead.`, flags: MessageFlags.Ephemeral }).catch(silentCatch('nav:errorReply'));
      }
      return;
    }

    // Handle market category buttons - UPDATE in place
    if (customId.startsWith("market:")) {
      const action = customId.split(":")[1];
      const userId = interaction.user.id;

      try {
        // Get user profile (using ProfileService)
        const profileResult = await getProfile(userId);
        if (!profileResult) {
          const welcome = (await import('./utils/onboarding.ts')).createNoProfileEmbed(userId);
          await interaction.reply({ ...welcome, flags: MessageFlags.Ephemeral });
          return;
        }
        const userProfile = profileResult.profile;

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
        await interaction.reply({ content: `❌ Error! Use \`/market\` instead.`, flags: MessageFlags.Ephemeral }).catch(silentCatch('market:errorReply'));
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
          await interaction.reply({ content: "❌ Error creating profile. Try `/farmer` instead.", flags: MessageFlags.Ephemeral }).catch(silentCatch('onboard:errorReply'));
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
        // Get user profile (using ProfileService)
        const profileResult = await getProfile(userId);
        if (!profileResult) {
          const welcome = (await import('./utils/onboarding.ts')).createNoProfileEmbed(userId);
          await interaction.reply({ ...welcome, flags: MessageFlags.Ephemeral });
          return;
        }
        const userProfile = profileResult.profile;

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
        await interaction.reply({ content: `❌ Error! Use \`/market\` instead.`, flags: MessageFlags.Ephemeral }).catch(silentCatch('marketSelect:errorReply'));
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

  // Handle autocomplete interactions for commands with autocomplete options
  if (interaction.isAutocomplete()) {
    const { commandName } = interaction;
    const command = commands[commandName as keyof typeof commands];
    if (command?.autocomplete) {
      try {
        await command.autocomplete(interaction);
      } catch (err) {
        logger.error(`Autocomplete error for ${commandName}:`, err);
      }
    }
    return;
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

  const expiresAt = Date.now() + 3000;
  cooldowns.set(interaction.user.id, expiresAt);
  setTimeout(() => {
    if (cooldowns.get(interaction.user.id) === expiresAt) {
      cooldowns.delete(interaction.user.id);
    }
  }, 3000);
});

client.on("messageCreate", (message) => {
  if (message.author.id != process.env.ADMIN_USER_ID!) return;

  if (message.content.includes("wipe")) {
    userProfileCache.flushAll();
    return message.reply({ content: "done!" });
  }
});

client.login(process.env.token!);