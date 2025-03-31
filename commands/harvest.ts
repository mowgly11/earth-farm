import { CommandInteraction, SlashCommandBuilder, MessageFlags } from "discord.js";
import database from "../database/methods.ts";

export const data = new SlashCommandBuilder()
  .setName("harvest")
  .setDescription("Harvests all matured crops and animal products.")

export async function execute(interaction: CommandInteraction) {
  await interaction.deferReply();

  const userId = interaction.user.id;

  const userProfile: any = await database.findUser(userId);
  if (!userProfile) return interaction.editReply({ content: "Please make a profile using `/farmer` before trying to buy anything from the market." });

  let storageCount = 0;
  userProfile.storage.market_items.forEach((v:any) => storageCount += v.amount);
  userProfile.storage.products.forEach((v:any) => storageCount += v.amount);

  let storageLeft = userProfile.farm.storage_limit - storageCount;

  if (storageLeft <= 0) return interaction.editReply({ content: "storage limit exceeded." });

  const harvestedPlants = await database.harvestReadyPlants(userProfile, storageLeft);
  const harvestedAnimals = await database.gatherReadyPlants(userProfile, storageLeft - harvestedPlants.length);
  
  const harvestedString = stringifyProductsList([...harvestedPlants, ...harvestedAnimals]);

  await interaction.editReply({ content: harvestedString === "" ? "Nothing to harvest." : `Successfully harvested ${harvestedString}` });

  const canLevelUp = await database.checkEligibleForlevelUp(userProfile);
  if(canLevelUp) interaction.followUp({ content: `✨ Congrats! you are now level **${userProfile.level}**` });
}

function stringifyProductsList(products: any): string {
  if (products.length === 0) return "";
  let finalString = "\n";
  
  for(let i = 0; i < products.length; i++) {
    finalString += `**Slot ${i+1}:** ${products[i].name}\n`;
  }

  return finalString;
}