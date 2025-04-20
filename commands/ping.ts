import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import database from "../database/methods.ts";

export const data = new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check the bot's latency");

export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    // Get Discord API latency by measuring time to edit reply
    const apiStart = Date.now();
    await interaction.editReply("Measuring latency...");
    const discordLatency = Date.now() - apiStart;

    // Get database latency
    const dbStart = Date.now();
    await database.findUser(interaction.user.id);
    const dbLatency = Date.now() - dbStart;

    // Get bot latency (time between command and response)
    const botLatency = Date.now() - interaction.createdTimestamp - discordLatency - dbLatency;

    const embed = new EmbedBuilder()
        .setTitle("🏓 Pong!")
        .setColor("#00FF00")
        .addFields(
            { name: "🤖 Bot Latency", value: `${botLatency}ms`, inline: true },
            { name: "🌐 Discord API", value: `${discordLatency}ms`, inline: true },
            { name: "💾 Database", value: `${dbLatency}ms`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: "Lower numbers are better!" });

    return await interaction.editReply({ embeds: [embed] });
} 