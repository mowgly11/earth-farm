import { CommandInteraction, SlashCommandBuilder, MessageFlags } from "discord.js";
import database from "../database/methods.ts";
import { userProfileCache } from "../index.ts";
import schema from "../database/schema.ts";
import { logError } from "../utils/error_logger.ts";

export const data = new SlashCommandBuilder()
  .setName("harvest")
  .setDescription("Harvests all matured crops and animal products.")

export async function execute(interaction: CommandInteraction) {
  await interaction.deferReply();

  const userId = interaction.user.id;

  // Check cache first
  let userProfile: any = userProfileCache.get(userId);

  // If not in cache, get from database and cache it
  if (!userProfile) {
    const dbProfile = await database.findUser(userId);
    if (!dbProfile) return await interaction.editReply({ content: "Please make a profile using `/farmer` before trying to buy anything from the market." });

    // Cache the plain object
    userProfile = (dbProfile as any).toObject();
    userProfileCache.set(userId, userProfile);
  }

  let storageCount = 0;
  userProfile.storage.market_items.forEach((v: any) => storageCount += v.amount);
  userProfile.storage.products.forEach((v: any) => storageCount += v.amount);

  let storageLeft = userProfile.farm.storage_limit - storageCount;

  if (storageLeft <= 0) return await interaction.editReply({ content: "Storage limit exceeded." });

  // Hydrate the cached profile into a Mongoose document
  const dbProfile = schema.hydrate(userProfile);
  if (!dbProfile) {
    userProfileCache.del(userId);
    return await interaction.editReply({ content: "An error occurred while processing your request." });
  }

  try {
    const harvestedPlants = await database.harvestReadyPlants(dbProfile, storageLeft);
    const harvestedAnimals = await database.gatherReadyProducts(dbProfile, storageLeft - harvestedPlants.length);

    const harvestedString = stringifyProductsList([...harvestedPlants, ...harvestedAnimals]);

    let deadAnimals: string[] = [];
    if(harvestedString !== "") deadAnimals = await database.checkAndRemoveDeadAnimals(dbProfile);
    
    // Update cache with latest data
    const updatedProfile = (dbProfile as any).toObject();
    userProfileCache.set(userId, updatedProfile);

    await interaction.editReply({ content: harvestedString === "" ? "Nothing to harvest." : `Successfully harvested ${harvestedString}` });

    if (deadAnimals?.length > 0) {
      interaction.followUp({ content: `You have some deceased animals in your farm **(${deadAnimals.join(",")})**, i got rid of them for you.` });
      await database.saveNestedObject(dbProfile, "farm");
    }
    // checking for dead animals

    const canLevelUp = await database.checkEligibleForlevelUp(dbProfile);
    if (canLevelUp) {
      // Update cache again after level up
      const leveledUpProfile = (dbProfile as any).toObject();
      userProfileCache.set(userId, leveledUpProfile);
      interaction.followUp({ content: `✨ Congrats! you are now level **${leveledUpProfile.level}**` });
    }
  } catch (error) {
    logError(interaction.client, {
      path: "harvest.ts",
      error
    });
    userProfileCache.del(userId);
    return await interaction.editReply({ content: "An error occurred while processing your request." });
  }
}

function stringifyProductsList(products: any): string {
  if (products.length === 0) return "";
  let finalString = "\n";

  for (let i = 0; i < products.length; i++) {
    finalString += `**Slot ${i + 1}:** ${products[i].name}\n`;
  }

  return finalString;
}