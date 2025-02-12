import { CommandInteraction, SlashCommandBuilder, MessageFlags } from "discord.js";
import database from "../database/methods.ts";

export const data = new SlashCommandBuilder()
  .setName("harvest")
  .setDescription("harvest a specific plant.")

export async function execute(interaction: CommandInteraction) {
  await interaction.deferReply();

  const userId = interaction.user.id;

  const userProfile: any = await database.findUser(userId);
  if (!userProfile) return interaction.editReply({ content: "Please make a profile using `/farmer` before trying to buy anything from the market." });

  const harvested = await database.harvestReadyPlants(userProfile);
  const harvestedString = stringifyProductsList(harvested);

  await interaction.editReply({ content: harvestedString === "" ? "Nothing to harvest." : `Successfully harvested ${harvestedString}` });

  const canLevelUp = await database.checkEligibleForlevelUp(userProfile);
  if(canLevelUp) interaction.followUp({ content: `Congrats! you are now level **${userProfile.level}**` })
}

function stringifyProductsList(products: any): string {
  if (products.length === 0) return "";
  let finalString = "\n";
  
  for(let i = 0; i < products.length; i++) {
    finalString += `**Slot ${i+1}:** ${products[i].amount} ${products[i].name}\n`;
  }

  return finalString;
}