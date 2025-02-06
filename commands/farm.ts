import { CommandInteraction, SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import database from '../database/methods.ts';

export const data = new SlashCommandBuilder()
  .setName("farm")
  .setDescription("shows your farm stats.")
  .addUserOption(option =>
    option
      .setName("farmer")
      .setDescription("show's a farmer's farm stats.")
  )

export async function execute(interaction: CommandInteraction) {
  const mentionedUserId = interaction.options.get("farmer")?.user?.id;
  let user: any;

  if (mentionedUserId) {
    user = await database.findUser(mentionedUserId);
    if (!user) return interaction.reply({ content: "user's farm wasn't found.", flags: MessageFlags.Ephemeral });
  } else {
    const userId = interaction.user?.id;
    const username = interaction.user?.username;

    if (userId) {
      user = await database.findUser(userId);
      if (!user) {
        const newUser = await database.createUser(userId, username);
        if (newUser) return interaction.reply({ content: "user doesn't have a profile yet, let me fix that.", flags: MessageFlags.Ephemeral });
        else return interaction.reply({ content: "an error occurred", flags: MessageFlags.Ephemeral });
      }
    }
  }

  await interaction.deferReply();

  let userInfoFields: Array<UserInfoField> = [
    {
      name: "Farm Level",
      value: String(user?.farm?.level),
      inline: true,
    },
    {
      name: "Crop Slots",
      value: String(user?.farm?.crop_slots),
      inline: true,
    },
    {
      name: "Animal Slots",
      value: String(user?.farm?.animal_slots),
      inline: true,
    }
  ];

  const farmEmbed = new EmbedBuilder()
    .setAuthor({ name: `${user.username}'s Farm` })
    .setColor("Yellow")
    .addFields(...userInfoFields)

  await interaction.followUp({ embeds: [farmEmbed] });
}

type UserInfoField = {
  name: string;
  value: string,
  inline: boolean;
}