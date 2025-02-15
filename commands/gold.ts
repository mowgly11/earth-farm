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
  let user = interaction.options.get("farmer")?.user;
  if(user?.bot) return interaction.reply({ content: "you can't interact with bots!", flags: MessageFlags.Ephemeral});
  await interaction.deferReply();
  if (!user) user = interaction.user;

  let balance: any = await database.findUser(user?.id);
  if (!balance) return interaction.editReply({ content: `${user.username}'s gold stash wasn't found. ${user.id === interaction.user.id ? "please use `/farmer` before trying to check your gold balance." : ""}` });

  return interaction.editReply({ content: `${balance.username} has a total of **${balance?.gold}** 🪙` });
}