import { CommandInteraction, SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import database from '../database/methods.ts';

export const data = new SlashCommandBuilder()
  .setName("farmer")
  .setDescription("shows your farm stats.")
  .addUserOption(option =>
    option
      .setName("target")
      .setDescription("shows a farmer's stats.")
  )

export async function execute(interaction: CommandInteraction) {
  await interaction.deferReply();

  const mentionedUserId = interaction.options.get("target")?.user?.id;
  let user: any;

  if (mentionedUserId) {
    user = await database.findUser(mentionedUserId);
    if (!user) return interaction.editReply({ content: `${interaction.user.username}'s farm wasn't found.` });
  } else {
    const userId = interaction.user?.id;
    const username = interaction.user?.username;

    if (userId) {
      user = await database.findUser(userId);
      if (!user) {
        const newUser = await database.createUser(userId, username);
        if (newUser) return interaction.editReply({ content: `Hey there **${interaction.user.username}**! looks like its your first time playing Earth bot. i'll setup everything you'll need through your adventure. Enjoy!` });
        else return interaction.editReply({ content: "an error occurred" });
      }
    }
  }


  let userInfoFields: Array<UserInfoFields> = [{
    name: "Gold",
    value: String(user?.gold),
    inline: true,
  },
  {
    name: "Level",
    value: String(user?.level),
    inline: true,
  },
  {
    name: "Experience Points (XP)",
    value: String(user?.xp),
    inline: true,
  },
  {
    name: "Farm Level",
    value: String(user?.farm?.level),
    inline: true,
  },
  {
    name: "Crop Slots",
    value: String(user?.farm?.available_crop_slots),
    inline: true,
  },
  {
    name: "Animals Slots",
    value: String(user?.farm?.available_animal_slots),
    inline: true,
  },];

  const farmerEmbed = new EmbedBuilder()
    .setTitle(`${user.username}'s Stats`)
    .setColor("Yellow")
    .addFields(...userInfoFields)
    .setImage("https://i.imgur.com/NiXXCZf.png")

  await interaction.editReply({ embeds: [farmerEmbed] });
}

type UserInfoFields = {
  name: string;
  value: string;
  inline?: boolean;
}