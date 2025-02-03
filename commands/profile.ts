import { CommandInteraction, SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("profile")
  .setDescription("Replies with Pong!");

export async function execute(interaction: CommandInteraction) {
  return interaction.reply("profile is empty");
}