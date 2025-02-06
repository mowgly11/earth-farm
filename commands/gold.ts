import { CommandInteraction, SlashCommandBuilder, MessageFlags } from "discord.js";
import database from "../database/methods.js";

export const data = new SlashCommandBuilder()
  .setName("gold")
  .setDescription("view your/someone's gold balance")
  .addUserOption(option => 
    option
      .setName("farmer")
      .setDescription("show's a farmer's gold balance.")
  )

export async function execute(interaction: CommandInteraction) {
  let userId = interaction.options.get("farmer")?.user?.id;
  if(!userId) userId = interaction.user.id;
  
  let balance: any = await database.findUser(userId);
  if(!balance) return interaction.reply({ content: "user's gold stash wasn't found.", flags: MessageFlags.Ephemeral });

  return interaction.reply({ content: `${balance.username} has a total of **${balance?.coins}** 🪙` })
}