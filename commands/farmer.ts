import { CommandInteraction, SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import database from '../database/methods.ts';
import { userProfileCache } from "../index.ts";
import schema from "../database/schema.ts";

export const data = new SlashCommandBuilder()
  .setName("farmer")
  .setDescription("shows your farm stats.")
  .addUserOption(option =>
    option
      .setName("target")
      .setDescription("shows a farmer's stats.")
  )

export async function execute(interaction: CommandInteraction) {

  const mentionedUserId = interaction.options.get("target")?.user;
  let user: any;

  if (mentionedUserId?.bot) return interaction.reply({ content: "you can't interact with bots!", flags: MessageFlags.Ephemeral });

  await interaction.deferReply();

  if (mentionedUserId) {
    // Check cache first for mentioned user
    let userProfile: any = userProfileCache.get(mentionedUserId.id);
    
    // If not in cache, get from database and cache it
    if (!userProfile) {
      const dbProfile = await database.findUser(mentionedUserId.id);
      if (!dbProfile) return interaction.editReply({ content: `${mentionedUserId.username}'s farm wasn't found.` });
      
      // Cache the plain object
      userProfile = (dbProfile as any).toObject();
      userProfileCache.set(mentionedUserId.id, userProfile);
    }
    user = userProfile;
  } else {
    const userId = interaction.user?.id;
    const username = interaction.user?.username;

    if (userId) {
      // Check cache first
      let userProfile: any = userProfileCache.get(userId);
      
      // If not in cache, get from database and cache it
      if (!userProfile) {
        const dbProfile = await database.findUser(userId);
        if (!dbProfile) {
          const newUser = await database.createUser(userId, username);
          if (newUser) {
            // Cache the new user
            userProfile = (newUser as any).toObject();
            userProfileCache.set(userId, userProfile);
            return interaction.editReply({ content: `Hey there **${interaction.user.username}**! looks like its your first time playing Earth bot. i'll setup everything you'll need through your adventure. Enjoy!` });
          }
          return interaction.editReply({ content: "an error occurred" });
        }
        
        // Cache the plain object
        userProfile = (dbProfile as any).toObject();
        userProfileCache.set(userId, userProfile);
      }
      user = userProfile;
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
  },
  {
    name: "Storage Limit",
    value: String(user?.farm?.storage_limit),
    inline: true,
  }];

  const farmerEmbed = new EmbedBuilder()
    .setTitle(`👤 ${user.username}'s Profile`)
    .setColor("#FFD700")
    .setThumbnail(interaction.user.displayAvatarURL())
    .setDescription(`**Level ${user?.level}** Farmer`)
    .addFields(...userInfoFields)
    .setFooter({ text: `Farm Level ${user?.farm?.level}` })
    .setTimestamp()
    .setImage("https://i.imgur.com/NiXXCZf.png");

  await interaction.editReply({ embeds: [farmerEmbed] });
}

type UserInfoFields = {
  name: string;
  value: string;
  inline?: boolean;
}