import { ActivityType, Client, Events, GatewayIntentBits, MessageFlags, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder } from 'discord.js';
import { deployCommands, flushCommands } from './handlers/command.ts';
import { commands } from './commands';
import MongooseInit from "./database/connect.ts";
import NodeCache from 'node-cache';
import { createMarketView } from './utils/views.ts';
import { createMainView, setupDashboardCollector } from './commands/dashboard.ts';
import { createLeaderboardEmbed, createPaginationButtons, USERS_PER_PAGE, type UserProfile } from './commands/leaderboard.ts';
import { createWelcomeEmbed, STARTER_BONUS } from './utils/onboarding.ts';
import database from "./database/methods.ts";
import { BTN_STYLE } from "./utils/button_handler.ts";
import { BUTTONS } from "./utils/buttons.ts";
import { COLORS, ERRORS, BOT_VERSION } from "./utils/constants.ts";
import { logger } from "./utils/logger.ts";

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
            // Get all user profiles
            const allProfiles = await database.getAllUsers() as unknown as UserProfile[];
            const sortedProfiles = allProfiles.sort((a, b) => (b.xp || 0) - (a.xp || 0));
            const totalPages = Math.ceil(sortedProfiles.length / USERS_PER_PAGE);
            let currentPage = 0;

            // Create initial embed
            const embed = createLeaderboardEmbed(sortedProfiles, "xp", currentPage, totalPages, userId);

            // Create back to dashboard button row
            const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
              BUTTONS.backDashboard().setLabel("← Back to Dashboard")
            );

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

        // For other commands that can't be shown inline, show ephemeral hint embed
        const hintEmbeds: Record<string, { title: string; desc: string; usage: string; color: number }> = {
          "market": {
            title: "🛒 Market",
            desc: "Browse and buy seeds, animals, and upgrades!",
            usage: "`/market` → Select a category",
            color: 0x2ECC71
          },
          "farm": {
            title: "🌱 Your Farm",
            desc: "View your farm with growing crops visualized!",
            usage: "`/farm` or `/farm @user`",
            color: 0x27AE60
          },
          "barn": {
            title: "🐔 Your Barn",
            desc: "See all your animals and their products!",
            usage: "`/barn` or `/barn @user`",
            color: 0xE67E22
          },
          "farmer": {
            title: "👤 Farmer Profile",
            desc: "View your profile card with stats!",
            usage: "`/farmer` or `/farmer @user`",
            color: 0x9B59B6
          },
          "daily": {
            title: "🎁 Daily Reward",
            desc: "Claim your daily gold and XP bonus!",
            usage: "`/daily`",
            color: 0xF1C40F
          },
          "harvest": {
            title: "🌾 Harvest",
            desc: "Collect all ready crops and animal products!",
            usage: "`/harvest`",
            color: 0xF39C12
          },
          "sell": {
            title: "💰 Sell Items",
            desc: "Sell products from storage for gold!",
            usage: "`/sell` → Choose amounts",
            color: 0xE74C3C
          },
          "leaderboard": {
            title: "🏆 Leaderboard",
            desc: "See top farmers ranked by XP or Gold!",
            usage: "`/leaderboard xp` or `/leaderboard gold`",
            color: 0xF1C40F
          },
          "xp": {
            title: "⭐ XP Progress",
            desc: "Check your experience and level progress!",
            usage: "`/xp`",
            color: 0x3498DB
          },
          "gold": {
            title: "💰 Gold Balance",
            desc: "View your current gold and earnings!",
            usage: "`/gold`",
            color: 0xF1C40F
          },
          "scratch": {
            title: "🎰 Scratch Card",
            desc: "Try your luck! Win gold or XP!",
            usage: "`/scratch` (8h cooldown)",
            color: 0x9B59B6
          },
          "plant": {
            title: "🌱 Plant Seeds",
            desc: "Plant seeds in available crop slots!",
            usage: "`/plant` → Select seed type",
            color: 0x27AE60
          },
          "raise": {
            title: "🐔 Raise Animal",
            desc: "Add an animal to your barn!",
            usage: "`/raise` → Select animal type",
            color: 0xE67E22
          },
          "feed": {
            title: "🍖 Feed Animal",
            desc: "Feed an animal to reset production timer!",
            usage: "`/feed <slot>` (1-10)",
            color: 0xE67E22
          },
          "clean": {
            title: "🧹 Clean Area",
            desc: "Clean animal area for production boost!",
            usage: "`/clean <slot>` (1-10)",
            color: 0x3498DB
          },
          "pet": {
            title: "❤️ Pet Animal",
            desc: "Pet your animal for happiness boost!",
            usage: "`/pet <slot>` (1-10)",
            color: 0xE91E63
          },
          "help": {
            title: "❓ Help",
            desc: "View all available commands!",
            usage: "`/help`",
            color: 0x3498DB
          }
        };

        const hint = hintEmbeds[target];
        if (hint) {
          const hintEmbed = new EmbedBuilder()
            .setTitle(hint.title)
            .setColor(hint.color)
            .setDescription(hint.desc)
            .addFields({ name: "📝 Usage", value: hint.usage, inline: false })
            .setFooter({ text: "💡 Click/type the command to use it!" });

          await interaction.reply({ embeds: [hintEmbed], flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: `Type \`/${target}\` to use this command!`, flags: MessageFlags.Ephemeral });
        }
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
          const view = createMarketView(action, userProfile.gold || 0, null, userId);
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
          const view = createMarketView(category, userProfile.gold || 0, selectedItem, userId);
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

  // Log command usage
  logger.cmd(interaction.commandName, interaction.user.id, interaction.guild?.name);
  void commandsLogChannel.send(`\`/${interaction.commandName}\` was used by **${interaction.user.username}** (${interaction.user.id}) in **${interaction.guild?.name ? interaction.guild.name : "DM"}** (${interaction.guild?.id ? interaction.guild.id : "DM"})`).catch(() => logger.warn("Discord log channel send failed"));

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