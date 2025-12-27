import { CommandInteraction, SlashCommandBuilder, MessageFlags, EmbedBuilder } from "discord.js";
import database from "../database/methods.ts";
import { userProfileCache } from "../index.ts";
import schema from "../database/schema.ts";
import { logError } from "../utils/error_logger.ts";
import { ERRORS, COLORS } from "../utils/constants.ts";
import { createNoProfileEmbed } from "../utils/onboarding.ts";
import { formatNumber, storageIndicator, getItemEmoji, createProgressBar, getRandomTip } from "../utils/ux.ts";
import { createHarvestButtons } from "../utils/button_handler.ts";
import { getProfile, updateCache } from "../services/index.ts";

export const data = new SlashCommandBuilder()
  .setName("harvest")
  .setDescription("Harvest all matured crops and animal products!")

export async function execute(interaction: CommandInteraction) {
  await interaction.deferReply();

  const userId = interaction.user.id;

  // Get user profile (using ProfileService)
  const profileResult = await getProfile(userId);
  if (!profileResult) return await interaction.editReply(createNoProfileEmbed(interaction.user.id));
  let userProfile = profileResult.profile;

  let storageCount = 0;
  userProfile.storage.market_items.forEach((v: any) => storageCount += v.amount);
  userProfile.storage.products.forEach((v: any) => storageCount += v.amount);

  let storageLeft = userProfile.farm.storage_limit - storageCount;

  // Storage full error embed
  if (storageLeft <= 0) {
    const storageEmbed = new EmbedBuilder()
      .setTitle("📦 Storage Full!")
      .setColor(COLORS.ERROR)
      .setDescription("You can't harvest because your storage is full!")
      .addFields(
        { name: "📦 Storage", value: storageIndicator(storageCount, userProfile.farm.storage_limit), inline: true },
        { name: "💡 Solution", value: "Sell some items or upgrade your farm!", inline: true }
      )
      .setFooter({ text: "Use /sell to make room" })
      .setTimestamp();

    return await interaction.editReply({ embeds: [storageEmbed] });
  }

  // Hydrate the cached profile into a Mongoose document
  const dbProfile = schema.hydrate(userProfile);
  if (!dbProfile) {
    userProfileCache.del(userId);
    return await interaction.editReply({ content: ERRORS.GENERIC });
  }

  const xpBefore = userProfile.xp;

  try {
    const harvestedPlants = await database.harvestReadyPlants(dbProfile, storageLeft);
    const harvestedAnimals = await database.gatherReadyProducts(dbProfile, storageLeft - harvestedPlants.length);

    const allHarvested = [...harvestedPlants, ...harvestedAnimals];
    const totalHarvested = allHarvested.length;

    // Nothing to harvest embed
    if (totalHarvested === 0) {
      const nothingEmbed = new EmbedBuilder()
        .setTitle("🌾 Nothing to Harvest")
        .setColor(COLORS.WARNING)
        .setDescription("There's nothing ready to harvest yet!")
        .addFields(
          {
            name: "🌱 Crops",
            value: userProfile.farm.occupied_crop_slots.length > 0
              ? `**${userProfile.farm.occupied_crop_slots.length}** growing`
              : "None planted",
            inline: true
          },
          {
            name: "🐔 Animals",
            value: userProfile.farm.occupied_animal_slots.length > 0
              ? `**${userProfile.farm.occupied_animal_slots.length}** on farm`
              : "None raised",
            inline: true
          }
        )
        .setFooter({ text: "Use /plant or /raise to start farming!" })
        .setTimestamp();

      return await interaction.editReply({ embeds: [nothingEmbed] });
    }

    // Calculate totals
    const totalXP = allHarvested.reduce((sum: number, item: any) => sum + (item.xp_gain || 0), 0);

    // Check for dead animals
    let deadAnimals: string[] = [];
    deadAnimals = await database.checkAndRemoveDeadAnimals(dbProfile);

    // Update cache with latest data
    const updatedProfile = (dbProfile as any).toObject();
    userProfileCache.set(userId, updatedProfile);

    // Calculate new storage
    let newStorageCount = 0;
    updatedProfile.storage.market_items.forEach((v: any) => newStorageCount += v.amount);
    updatedProfile.storage.products.forEach((v: any) => newStorageCount += v.amount);

    // Format harvested items with emojis
    const cropsHarvested = harvestedPlants.map((p: any) => `${getItemEmoji('crops')} ${p.name}`).join('\n') || 'None';
    const productsHarvested = harvestedAnimals.map((p: any) => `${getItemEmoji('animal_products')} ${p.name}`).join('\n') || 'None';

    // Create success embed
    const harvestEmbed = new EmbedBuilder()
      .setTitle("🌾 Harvest Complete!")
      .setColor(COLORS.SUCCESS)
      .setDescription(`**${interaction.user.username}** harvested **${totalHarvested}** items!`)
      .addFields(
        {
          name: "🌱 Crops Harvested",
          value: cropsHarvested.substring(0, 1024),
          inline: true
        },
        {
          name: "🥚 Products Gathered",
          value: productsHarvested.substring(0, 1024),
          inline: true
        }
      )
      .addFields(
        {
          name: "⭐ XP Earned",
          value: `**+${formatNumber(totalXP)}** XP`,
          inline: true
        },
        {
          name: "📦 Storage",
          value: storageIndicator(newStorageCount, updatedProfile.farm.storage_limit),
          inline: true
        }
      )
      .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }))
      .setFooter({ text: getRandomTip() })
      .setTimestamp();

    // Add follow-up action buttons
    const actionButtons = createHarvestButtons(userId);

    await interaction.editReply({ embeds: [harvestEmbed], components: [actionButtons] });

    // Dead animals notification
    if (deadAnimals?.length > 0) {
      const deadEmbed = new EmbedBuilder()
        .setTitle("💀 Animals Passed Away")
        .setColor(COLORS.ERROR)
        .setDescription(`Unfortunately, some animals have died of old age:`)
        .addFields(
          { name: "🪦 Deceased", value: deadAnimals.map(a => `• ${a}`).join('\n'), inline: false }
        )
        .setFooter({ text: "Buy new animals from the market to replace them!" });

      await interaction.followUp({ embeds: [deadEmbed] });
      await database.saveNestedObject(dbProfile, "farm");
    }

    // Level up check
    const canLevelUp = await database.checkEligibleForlevelUp(dbProfile);
    if (canLevelUp) {
      // Update cache again after level up
      const leveledUpProfile = (dbProfile as any).toObject();
      userProfileCache.set(userId, leveledUpProfile);

      const newLevel = leveledUpProfile.level;

      // Level-based unlocks and rewards
      const levelRewards: Record<number, string[]> = {
        2: ["🌱 +2 Crop Slots", "🐔 +1 Animal Slot", "📦 +25 Storage"],
        3: ["🌱 +1 Crop Slot", "🔓 Sheep Unlocked", "📦 +25 Storage"],
        4: ["🌱 +2 Crop Slots", "🐔 +1 Animal Slot", "🔓 Goat Unlocked"],
        5: ["🌱 +2 Crop Slots", "🐔 +1 Animal Slot", "📦 +25 Storage"],
        6: ["🌱 +2 Crop Slots", "🐔 +1 Animal Slot", "🔓 Raspberry Unlocked"],
        7: ["🌱 +2 Crop Slots", "🐔 +1 Animal Slot", "📦 +30 Storage"],
        8: ["🌱 +2 Crop Slots", "🐔 +1 Animal Slot", "🔓 Blueberry Unlocked"],
        9: ["🌱 +2 Crop Slots", "🐔 +2 Animal Slots", "📦 +30 Storage"],
        10: ["🌱 +2 Crop Slots", "🐔 +2 Animal Slots", "👑 Max Level!"]
      };

      const rewards = levelRewards[newLevel] || ["New items unlocked!", "Higher daily rewards!"];
      const rewardsStr = rewards.map(r => `• ${r}`).join('\n');

      // Confetti art for celebration
      const confetti = "✨🎊🎉🥳🎊✨";

      const levelUpEmbed = new EmbedBuilder()
        .setTitle(`${confetti} LEVEL UP! ${confetti}`)
        .setColor(0xFFD700)
        .setDescription(
          `\`\`\`\n` +
          `   ⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐\n` +
          `         LEVEL ${newLevel}\n` +
          `   ⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐\n` +
          `\`\`\`\n\n` +
          `Congratulations **${interaction.user.username}**!\n` +
          `You've reached **Level ${newLevel}**! 🚀`
        )
        .addFields(
          { name: "🎁 Rewards Unlocked", value: rewardsStr, inline: true },
          { name: "📊 Progress", value: `Level ${newLevel - 1} → Level ${newLevel}`, inline: true }
        )
        .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
        .setFooter({ text: "Keep farming to unlock more rewards! 🌾" })
        .setTimestamp();

      await interaction.followUp({ embeds: [levelUpEmbed] });
    }
  } catch (error) {
    logError(interaction.client, {
      path: "harvest.ts",
      error
    });
    userProfileCache.del(userId);
    return await interaction.editReply({ content: ERRORS.GENERIC });
  }
}