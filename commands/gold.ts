import { CommandInteraction, SlashCommandBuilder, MessageFlags, EmbedBuilder, ButtonBuilder, ActionRowBuilder } from "discord.js";
import { COLORS } from "../utils/constants.ts";
import { BUTTONS } from "../utils/buttons.ts";
import { formatNumber } from "../utils/ux.ts";
import { getProfile } from "../services/index.ts";

export const data = new SlashCommandBuilder()
  .setName("gold")
  .setDescription("View your gold balance!")
  .addUserOption(option =>
    option
      .setName("farmer")
      .setDescription("View another farmer's gold balance")
  )

export async function execute(interaction: CommandInteraction) {
  let user = interaction.options.get("farmer")?.user;
  if (user?.bot) return await interaction.reply({ content: "You can't interact with bots!", flags: MessageFlags.Ephemeral });
  await interaction.deferReply();
  if (!user) user = interaction.user;

  const isSelf = user.id === interaction.user.id;

  // Get user profile (using ProfileService)
  const profileResult = await getProfile(user.id);
  if (!profileResult) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Profile Not Found")
      .setColor(COLORS.ERROR)
      .setDescription(isSelf ? "You need to create a profile first!" : `**${user.username}** doesn't have a farm yet.`);

    if (isSelf) {
      const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        BUTTONS.farmer()
      );
      return await interaction.editReply({ embeds: [embed], components: [buttons] });
    }
    return await interaction.editReply({ embeds: [embed] });
  }
  let userProfile = profileResult.profile;

  // Create embed
  const embed = new EmbedBuilder()
    .setTitle(`💰 ${isSelf ? "Your" : `${userProfile.username}'s`} Gold`)
    .setColor(COLORS.PRIMARY)
    .setThumbnail(user.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: "🪙 Balance", value: `**${formatNumber(userProfile.gold)}** gold`, inline: true },
      { name: "⭐ Level", value: `${userProfile.level}`, inline: true }
    )
    .setTimestamp();

  // Add earning suggestions for self
  if (isSelf) {
    const now = Date.now();
    const dailyReady = !userProfile.daily || userProfile.daily <= now;
    const scratchReady = !userProfile.scratch || userProfile.scratch <= now;

    let earningTips = [];
    if (dailyReady) earningTips.push("🎁 Daily reward is ready!");
    if (scratchReady) earningTips.push("🎰 Scratch card is ready!");
    earningTips.push("🌾 Harvest crops for gold");
    earningTips.push("📦 Sell products for gold");

    embed.addFields({
      name: "💡 Ways to Earn",
      value: earningTips.slice(0, 3).join("\n"),
      inline: false
    });

    // Buttons for self
    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      BUTTONS.daily().setStyle(dailyReady ? 3 : 2), // SUCCESS : SECONDARY
      BUTTONS.market(),
      BUTTONS.dashboard()
    );

    return await interaction.editReply({ embeds: [embed], components: [buttons] });
  }

  // No buttons for viewing others
  return await interaction.editReply({ embeds: [embed] });
}