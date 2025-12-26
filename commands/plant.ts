import { CommandInteraction, SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder } from "discord.js";
import marketItems from "../config/items/market_items.json";
import database from "../database/methods.ts";
import { userProfileCache } from "../index.ts";
import schema from "../database/schema.ts";
import { logError } from "../utils/error_logger.ts";
import { ERRORS, COLORS } from "../utils/constants.ts";
import { createNoProfileEmbed } from "../utils/onboarding.ts";
import { BUTTONS } from "../utils/buttons.ts";
import { formatNumber, relativeTimestamp } from "../utils/ux.ts";

let choices: Array<ChoicesArray> = [];
marketItems.map(option => {
  if (option.type === "seeds") choices.push({
    name: option.name,
    value: option.name
  });
});

export const data = new SlashCommandBuilder()
  .setName("plant")
  .setDescription("Plant seeds in your farm!")
  .addStringOption(option =>
    option
      .setName("seed")
      .setDescription("The seed you want to plant")
      .addChoices(...choices)
      .setRequired(true)
  )
  .addNumberOption(option =>
    option
      .setName("amount")
      .setDescription("How many seeds to plant (1-30)")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(30)
  )

export async function execute(interaction: CommandInteraction) {
  await interaction.deferReply();

  const item: string = String(interaction.options.get("seed")?.value)?.trim();
  let quantity: any = interaction.options.get("amount")?.value;
  quantity = parseInt(quantity);

  const userId = interaction.user.id;

  let userProfile: any = userProfileCache.get(userId);

  if (!userProfile) {
    const dbProfile = await database.findUser(userId);
    if (!dbProfile) return await interaction.editReply(createNoProfileEmbed(interaction.user.id));

    userProfile = (dbProfile as any).toObject();
    userProfileCache.set(userId, userProfile);
  }

  // Check if user has the seeds
  const seedInStorage = userProfile.storage.market_items.find((v: Record<string, string | number>) => v?.name === item);
  if (!seedInStorage || seedInStorage.amount < quantity) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Not Enough Seeds")
      .setColor(COLORS.ERROR)
      .setDescription(`You don't have **${quantity}x ${item}** in storage.`)
      .addFields({ name: "📦 You Have", value: seedInStorage ? `${seedInStorage.amount}x` : "0x", inline: true });

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      BUTTONS.buySeeds(),
      BUTTONS.dashboard()
    );

    return await interaction.editReply({ embeds: [embed], components: [buttons] });
  }

  // Check available slots
  const availableSlots = userProfile.farm.available_crop_slots - userProfile.farm.occupied_crop_slots.length;
  if (availableSlots < quantity) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Not Enough Slots")
      .setColor(COLORS.ERROR)
      .setDescription(`You need **${quantity}** slots but only have **${availableSlots}** available.`)
      .addFields(
        { name: "🌱 Occupied", value: `${userProfile.farm.occupied_crop_slots.length}`, inline: true },
        { name: "📊 Total", value: `${userProfile.farm.available_crop_slots}`, inline: true }
      );

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      BUTTONS.harvestFirst(),
      BUTTONS.upgradeFarm()
    );

    return await interaction.editReply({ embeds: [embed], components: [buttons] });
  }

  const findItemInDatabase = marketItems.find(v => v.name === item)!;

  // Hydrate the cached profile into a Mongoose document
  const dbProfile = schema.hydrate(userProfile);
  if (!dbProfile) {
    userProfileCache.del(userId);
    return await interaction.editReply({ content: ERRORS.GENERIC });
  }

  try {
    await database.removeItemFromstorage(dbProfile, item, quantity, "market_items");
    for (let i = 0; i < quantity; i++) {
      await database.plantSeed(dbProfile, item, findItemInDatabase?.ready_time, findItemInDatabase.gives);
    }

    await database.saveNestedObject(dbProfile, "farm");

    // Update cache with latest data
    const updatedProfile = (dbProfile as any).toObject();
    userProfileCache.set(userId, updatedProfile);

    // Calculate ready time
    const readyAt = Date.now() + findItemInDatabase.ready_time;
    const readyMins = Math.round(findItemInDatabase.ready_time / 1000 / 60);

    // Success embed
    const embed = new EmbedBuilder()
      .setTitle("🌱 Seeds Planted!")
      .setColor(COLORS.SUCCESS)
      .setDescription(`Successfully planted **${quantity}x ${findItemInDatabase.name}**`)
      .addFields(
        { name: "⏱️ Ready In", value: `${readyMins} minutes`, inline: true },
        { name: "🕐 Ready At", value: relativeTimestamp(readyAt), inline: true },
        { name: "🎁 Produces", value: findItemInDatabase.gives, inline: true }
      )
      .addFields(
        { name: "🌱 Slots Used", value: `${updatedProfile.farm.occupied_crop_slots.length}/${updatedProfile.farm.available_crop_slots}`, inline: true }
      )
      .setFooter({ text: "Come back when ready to harvest!" })
      .setTimestamp();

    // Follow-up buttons
    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      BUTTONS.farm(),
      BUTTONS.plantMore(),
      BUTTONS.dashboard()
    );

    return await interaction.editReply({ embeds: [embed], components: [buttons] });

  } catch (error) {
    logError(interaction.client, {
      path: "plant.ts",
      error
    });
    userProfileCache.del(userId);
    return await interaction.editReply({ content: ERRORS.GENERIC });
  }
}

type ChoicesArray = {
  name: string;
  value: string;
}