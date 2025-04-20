import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Display a user's avatar")
    .addUserOption(option =>
        option
            .setName("user")
            .setDescription("The user whose avatar you want to see")
            .setRequired(false)
    );

export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const targetUser = interaction.options.getUser("user") || interaction.user;

    const embed = new EmbedBuilder()
        .setTitle(`${targetUser.username}'s Avatar`)
        .setImage(targetUser.displayAvatarURL({ size: 4096 }))
        .setColor("#FFD700")
        .setTimestamp()
        .setFooter({ text: `Requested by ${interaction.user.username}` });

    return await interaction.editReply({ embeds: [embed] });
}