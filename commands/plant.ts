import { CommandInteraction, SlashCommandBuilder, MessageFlags } from "discord.js";
import marketItems from "../config/items/market_items.json";
import database from "../database/methods.ts";
import { userProfileCache } from "../index.ts";
import schema from "../database/schema.ts";

let choices: Array<ChoicesArray> = [];
marketItems.map(option => {
  if (option.type === "seeds") choices.push({
    name: option.name,
    value: option.name
  });
});

export const data = new SlashCommandBuilder()
  .setName("plant")
  .setDescription("plant a specific seed.")
  .addStringOption(option =>
    option
      .setName("seed")
      .setDescription("the seed you're trying to plant")
      .addChoices(...choices)
      .setRequired(true)
  )
  .addNumberOption(option =>
    option
      .setName("amount")
      .setDescription("the amount of this seed that you want to plant")
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

  // Check cache first
  let userProfile: any = userProfileCache.get(userId);
  
  // If not in cache, get from database and cache it
  if (!userProfile) {
    const dbProfile = await database.findUser(userId);
    if (!dbProfile) return interaction.editReply({ content: "Please make a profile using `/farmer` before trying to buy anything from the market." });
    
    // Cache the plain object
    userProfile = (dbProfile as any).toObject();
    userProfileCache.set(userId, userProfile);
  }

  if (!userProfile.storage.market_items.find((v: Record<string, string | number>) => v?.name === item && v?.amount >= quantity)
  ) return interaction.editReply({ content: `you can't plant ${item}.` });

  if ((userProfile.farm.available_crop_slots - userProfile.farm.occupied_crop_slots.length) < quantity
  ) return interaction.editReply({ content: `you can't plant ${item}, not enough slots to plant this amount.` });

  if (userProfile.farm.occupied_crop_slots.length >= userProfile.farm.available_crop_slots
  ) return interaction.editReply({ content: `you can't plant ${item}, all slots are occupied.` });

  const findItemInDatabase = marketItems.find(v => v.name === item)!;

  // Hydrate the cached profile into a Mongoose document
  const dbProfile = schema.hydrate(userProfile);
  if (!dbProfile) {
    userProfileCache.del(userId);
    return interaction.editReply({ content: "An error occurred while processing your request." });
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

    return interaction.editReply({ content: `Successfully planted **${quantity}** of **${findItemInDatabase.name}**. it will be ready in **${findItemInDatabase.ready_time / 1000}s**` });
  } catch (error) {
    console.error('Error during planting:', error);
    userProfileCache.del(userId);
    return interaction.editReply({ content: "An error occurred while processing your request." });
  }
}

type ChoicesArray = {
  name: string;
  value: string;
}