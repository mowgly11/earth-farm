import { CommandInteraction, SlashCommandBuilder, MessageFlags, EmbedBuilder, ButtonBuilder, ActionRowBuilder } from "discord.js";
import database from "../database/methods.ts";
import levels from "../config/data/levels.json";
import { userProfileCache } from "../index.ts";
import { COLORS } from "../utils/constants.ts";
import { BUTTONS } from "../utils/buttons.ts";
import { formatNumber, createProgressBar } from "../utils/ux.ts";

export const data = new SlashCommandBuilder()
    .setName("xp")
    .setDescription("View your XP progress!")
    .addUserOption(option =>
        option
            .setName("farmer")
            .setDescription("View another farmer's XP")
    )

export async function execute(interaction: CommandInteraction) {
    let user = interaction.options.get("farmer")?.user;
    if (user?.bot) return await interaction.reply({ content: "You can't interact with bots!", flags: MessageFlags.Ephemeral });
    if (!user) user = interaction.user;

    await interaction.deferReply();

    const isSelf = user.id === interaction.user.id;

      let userData: any = userProfileCache.get(user.id);

      if (!userData) {
        const dbProfile = await database.findUser(user.id);
        if (!dbProfile) {
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

        userData = (dbProfile as any).toObject();
        userProfileCache.set(user.id, userData);
    }

    const xp = userData?.xp || 0;
    const currentLevel = userData?.level || 1;
    const levelData = levels.find(obj => obj.level === currentLevel);
    const requiredXp = levelData?.xp_to_upgrade || 1000;
    const isMaxLevel = !levelData?.xp_to_upgrade;

    // Calculate progress
    const progress = isMaxLevel ? 100 : Math.min(100, Math.round((xp / requiredXp) * 100));
    const progressBar = createProgressBar(xp, requiredXp, 12);

    // Create embed
    const embed = new EmbedBuilder()
        .setTitle(`⭐ ${isSelf ? "Your" : `${userData.username}'s`} Experience`)
        .setColor(COLORS.PRIMARY)
        .setThumbnail(user.displayAvatarURL({ size: 128 }))
        .addFields(
            { name: "📊 Level", value: `**${currentLevel}**`, inline: true },
            { name: "✨ XP", value: `**${formatNumber(xp)}** / ${isMaxLevel ? "MAX" : formatNumber(requiredXp)}`, inline: true },
            { name: "📈 Progress", value: `${progress}%`, inline: true }
        )
        .addFields({
            name: "🔋 Progress Bar",
            value: progressBar,
            inline: false
        })
        .setTimestamp();

    // Add XP earning tips for self
    if (isSelf && !isMaxLevel) {
        embed.addFields({
            name: "💡 Ways to Earn XP",
            value: "🌾 Harvest crops\n🎰 Play scratch cards\n🛒 Buy & sell items",
            inline: false
        });

        embed.setFooter({ text: `${formatNumber(requiredXp - xp)} XP to next level!` });
    } else if (isMaxLevel) {
        embed.setFooter({ text: "🎉 Maximum level reached!" });
    }

    // Buttons for self
    if (isSelf) {
        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            BUTTONS.harvestXp(),
            BUTTONS.leaderboard().setStyle(1), // PRIMARY
            BUTTONS.dashboard().setEmoji("🏠")
        );

        return await interaction.editReply({ embeds: [embed], components: [buttons] });
    }

    return await interaction.editReply({ embeds: [embed] });
}