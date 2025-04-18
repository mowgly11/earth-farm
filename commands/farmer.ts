import { CommandInteraction, SlashCommandBuilder, AttachmentBuilder, MessageFlags, User } from "discord.js";
import database from '../database/methods.ts';
import { userProfileCache } from "../index.ts";
import Canvas from "canvas";
import path from "path";

Canvas.registerFont(path.join(__dirname, "../fonts", "lumber.ttf"), { family: 'CustomFont' });

let baseProfileImagePath: string = path.join(__dirname, '../assets', "base", 'profile.jpg');
let baseProfileImage: Canvas.Image;

(async () => {
  baseProfileImage = await Canvas.loadImage(baseProfileImagePath);
})();

export const data = new SlashCommandBuilder()
  .setName("farmer")
  .setDescription("shows your farm stats.")
  .addUserOption(option =>
    option
      .setName("target")
      .setDescription("shows a farmer's stats.")
  )

export async function execute(interaction: CommandInteraction) {

  const mentionedUser = interaction.options.get("target")?.user;
  let user: any;

  if (mentionedUser?.bot) return interaction.reply({ content: "you can't interact with bots!", flags: MessageFlags.Ephemeral });

  await interaction.deferReply();

  let discordUser: User;

  if (mentionedUser) {
    discordUser = mentionedUser;
    // Check cache first for mentioned user
    let userProfile: any = userProfileCache.get(mentionedUser.id);

    // If not in cache, get from database and cache it
    if (!userProfile) {
      const dbProfile = await database.findUser(mentionedUser.id);
      if (!dbProfile) return interaction.editReply({ content: `**${mentionedUser.username}**'s farm wasn't found.` });

      // Cache the plain object
      userProfile = (dbProfile as any).toObject();
      userProfileCache.set(mentionedUser.id, userProfile);
    }
    user = userProfile;
  } else {
    discordUser = interaction.user;
    const username = interaction.user?.username;

    if (discordUser.id) {
      // Check cache first
      let userProfile: any = userProfileCache.get(discordUser.id);

      // If not in cache, get from database and cache it
      if (!userProfile) {
        const dbProfile = await database.findUser(discordUser.id);
        if (!dbProfile) {
          const newUser = await database.createUser(discordUser.id, username);
          if (newUser) {
            // Cache the new user
            userProfile = (newUser as any).toObject();
            userProfileCache.set(discordUser.id, userProfile);
            return interaction.editReply({ content: `Hey there **${interaction.user.username}**! looks like its your first time playing Earth bot. i'll setup everything you'll need through your adventure. Enjoy!` });
          }
          return interaction.editReply({ content: "an error occurred" });
        }

        // Cache the plain object
        userProfile = (dbProfile as any).toObject();
        userProfileCache.set(discordUser.id, userProfile);
      }
      user = userProfile;
    }
  }

  let statsToDisplay: Array<string> = [
    `Gold: ${user?.gold}`,
    `Level: ${user?.level}`,
    `XP: ${user?.xp}`,
    `Farm Level: ${user?.farm?.level}`,
    `Crop Slots: ${user?.farm?.available_crop_slots}`,
    `Animals Slots: ${user?.farm?.available_animal_slots}`,
    `Storage Limit: ${user?.farm?.storage_limit}`,
  ]

  const canvas = Canvas.createCanvas(450, 300);
  const ctx = canvas.getContext("2d");
  ctx.font = "bold 20px CustomFont";
  ctx.fillStyle = "#673c07";

  ctx.drawImage(baseProfileImage, 0, 0, canvas.width, canvas.height);

  // all the text and stats

  ctx.fillText(`${discordUser.username}'s Profile`, 60, 80);

  let lastXandYValue = [30, 110];
  for(let i = 0; i < statsToDisplay.length; i++) {
    if(i > 0 && i % 4 === 0) {
      lastXandYValue[0]+=110;
      lastXandYValue[1] = 110;
    } 
    
    ctx.fillText(statsToDisplay[i], lastXandYValue[0], lastXandYValue[1]);
    lastXandYValue[1] += 20;
  }

  // avatar clipping and drawing

  ctx.beginPath();
  ctx.arc(370, 150, 30, 0, 2 * Math.PI);
  ctx.closePath();
  ctx.clip();

  const avatar = await Canvas.loadImage(`https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`);

  ctx.drawImage(avatar, 338, 120, 62, 62) // X=limn  Y=lfo9

  // crafting the final attachment

  const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: "farmer.png" });

  await interaction.editReply({ files: [attachment] });
}