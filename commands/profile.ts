import { CommandInteraction, SlashCommandBuilder, AttachmentBuilder, MessageFlags, User, ButtonBuilder, ActionRowBuilder, EmbedBuilder } from "discord.js";
import database from '../database/methods.ts';
import { userProfileCache } from "../services/profile_service.ts";
import Canvas from "canvas";
import path from "path";
import { BUTTONS } from "../utils/buttons.ts";
import { COLORS } from "../utils/constants.ts";
import { getProfile, updateCache } from "../services/index.ts";
import { formatNumber, storageIndicator } from "../utils/ux.ts";
import levels from "../config/data/levels.json";

Canvas.registerFont(path.join(__dirname, "../fonts", "lumber.ttf"), { family: 'CustomFont' });

let baseProfileImagePath: string = path.join(__dirname, '../assets', "base", 'profile.jpg');
let baseProfileImage: Canvas.Image;

(async () => {
  baseProfileImage = await Canvas.loadImage(baseProfileImagePath);
})();

/**
 * Ensure base profile image is loaded
 */
async function ensureImageLoaded(): Promise<void> {
  if (!baseProfileImage) {
    baseProfileImage = await Canvas.loadImage(baseProfileImagePath);
  }
}

/**
 * Create profile canvas image - reusable for both /profile command and dashboard
 */
export async function createProfileImage(
  username: string,
  avatarUrl: string,
  profile: any
): Promise<AttachmentBuilder> {
  await ensureImageLoaded();

  const statsToDisplay: Array<string> = [
    `Gold: ${profile?.gold ?? 0}`,
    `Level: ${profile?.level ?? 1}`,
    `XP: ${profile?.xp ?? 0}`,
    `Farm Level: ${profile?.farm?.level ?? 1}`,
    `Crop Slots: ${profile?.farm?.available_crop_slots ?? 0}`,
    `Animals Slots: ${profile?.farm?.available_animal_slots ?? 0}`,
    `Storage Limit: ${profile?.farm?.storage_limit ?? 50}`,
  ];

  const canvas = Canvas.createCanvas(450, 300);
  const ctx = canvas.getContext("2d");
  ctx.font = "bold 20px CustomFont";
  ctx.fillStyle = "#673c07";

  ctx.drawImage(baseProfileImage, 0, 0, canvas.width, canvas.height);

  // Title
  ctx.fillText(`${username}'s Profile`, 60, 80);

  // Stats
  let lastXandYValue = [30, 110];
  for (let i = 0; i < statsToDisplay.length; i++) {
    if (i > 0 && i % 4 === 0) {
      lastXandYValue[0] += 110;
      lastXandYValue[1] = 110;
    }
    ctx.fillText(statsToDisplay[i], lastXandYValue[0], lastXandYValue[1]);
    lastXandYValue[1] += 20;
  }

  // Force PNG format for avatar (canvas doesn't support webp)
  let pngAvatarUrl = avatarUrl;
  if (avatarUrl.includes('?')) {
    pngAvatarUrl = avatarUrl.replace(/\.(webp|gif)(\?|$)/, '.png$2');
  } else {
    pngAvatarUrl = avatarUrl.replace(/\.(webp|gif)$/, '.png');
  }
  // Ensure .png extension
  if (!pngAvatarUrl.includes('.png')) {
    pngAvatarUrl = pngAvatarUrl + (pngAvatarUrl.includes('?') ? '&format=png' : '?format=png');
  }

  // Avatar clipping and drawing
  ctx.save(); // Save state before clipping
  ctx.beginPath();
  ctx.arc(370, 150, 30, 0, 2 * Math.PI);
  ctx.closePath();
  ctx.clip();

  try {
    const avatar = await Canvas.loadImage(pngAvatarUrl);
    ctx.drawImage(avatar, 338, 120, 62, 62);
  } catch (err) {
    // If avatar fails, just skip it - profile still works
    console.error('[PROFILE] Avatar load failed:', err);
  }
  ctx.restore(); // Restore state after clipping

  return new AttachmentBuilder(canvas.toBuffer(), { name: "profile.png" });
}

export const data = new SlashCommandBuilder()
  .setName("profile")
  .setDescription("View your profile!")
  .addUserOption(option =>
    option
      .setName("target")
      .setDescription("View another player's profile")
  )

export async function execute(interaction: CommandInteraction) {

  const mentionedUser = interaction.options.get("target")?.user;
  let user: any;

  if (mentionedUser?.bot) return await interaction.reply({ content: "You can't interact with bots!", flags: MessageFlags.Ephemeral });

  await interaction.deferReply();

  let discordUser: User;
  const isSelf = !mentionedUser || mentionedUser.id === interaction.user.id;

  if (mentionedUser) {
    discordUser = mentionedUser;

    // Get profile for mentioned user (using ProfileService)
    const profileResult = await getProfile(mentionedUser.id);
    if (!profileResult) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Profile Not Found")
        .setColor(COLORS.ERROR)
        .setDescription(`**${mentionedUser.username}** doesn't have a farm yet.`);
      return await interaction.editReply({ embeds: [embed] });
    }
    user = profileResult.profile;
  } else {
    discordUser = interaction.user;
    const username = interaction.user?.username;

    if (discordUser.id) {
      // Try to get profile (using ProfileService)
      const profileResult = await getProfile(discordUser.id);

      if (!profileResult) {
        // Profile doesn't exist - create new user
        const newUser = await database.createUser(discordUser.id, username);
        if (newUser) {
          const userProfile = (newUser as any).toObject();
          updateCache(discordUser.id, userProfile);

          // Welcome message with buttons
          const embed = new EmbedBuilder()
            .setTitle("🌾 Welcome to Earth Farm!")
            .setColor(COLORS.SUCCESS)
            .setDescription(`Hey there **${interaction.user.username}**! Your farm has been created. Let's get started!`)
            .addFields(
              { name: "🎁 First Step", value: "Claim your daily reward!", inline: false }
            );

          const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            BUTTONS.claimDaily(),
            BUTTONS.dashboard().setStyle(1) // PRIMARY
          );

          return await interaction.editReply({ embeds: [embed], components: [buttons] });
        }
        return await interaction.editReply({ content: "An error occurred" });
      }

      user = profileResult.profile;
    }
  }

  // Handle users with default avatars (no custom avatar)
  const avatarUrl = discordUser.avatar
    ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
    : discordUser.displayAvatarURL({ extension: 'png', size: 128 });

  // Generate profile image using reusable function
  const attachment = await createProfileImage(discordUser.username, avatarUrl, user);

  // Calculate stats for embed
  const currentLevel = levels.find((l: any) => l.level === user.level);
  const xpToNext = currentLevel?.xp_to_upgrade || 1000;
  let storageCount = 0;
  user.storage?.market_items?.forEach((v: any) => storageCount += v?.amount ?? 0);
  user.storage?.products?.forEach((v: any) => storageCount += v?.amount ?? 0);

  // Create profile embed matching dashboard style
  const embed = new EmbedBuilder()
    .setTitle(`👨‍🌾 ${discordUser.username}'s Profile`)
    .setColor(COLORS.PRIMARY)
    .setImage('attachment://profile.png')
    .addFields(
      { name: "⭐ Level", value: `**${user.level ?? 1}**`, inline: true },
      { name: "✨ XP", value: `**${formatNumber(user.xp ?? 0)}** / ${formatNumber(xpToNext)}`, inline: true },
      { name: "💰 Gold", value: `**${formatNumber(user.gold ?? 0)}**`, inline: true }
    )
    .addFields(
      { name: "🌱 Farm Level", value: `**${user.farm?.level ?? 1}**`, inline: true },
      { name: "📦 Storage", value: storageIndicator(storageCount, user.farm?.storage_limit ?? 50), inline: true },
      { name: "🌾 Crop Slots", value: `**${user.farm?.available_crop_slots ?? 0}**`, inline: true }
    )
    .addFields(
      { name: "🐔 Animal Slots", value: `**${user.farm?.available_animal_slots ?? 0}**`, inline: true }
    )
    .setTimestamp();

  // Navigation buttons for self
  if (isSelf) {
    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      BUTTONS.farm(),
      BUTTONS.viewBarn(),
      BUTTONS.dashboard()
    );

    return await interaction.editReply({ embeds: [embed], files: [attachment], components: [buttons] });
  }

  await interaction.editReply({ embeds: [embed], files: [attachment] });
}