import { CommandInteraction, SlashCommandBuilder, MessageFlags } from "discord.js";
import database from "../database/methods.js";

export const data = new SlashCommandBuilder()
    .setName("daily")
    .setDescription("collect your daily gold reward.")

export async function execute(interaction: CommandInteraction) {
    let user = interaction.options.get("farmer")?.user;
    if (user?.bot) return interaction.reply({ content: "you can't interact with bots!", flags: MessageFlags.Ephemeral });
    await interaction.deferReply();
    if (!user) user = interaction.user;

    let userProfile: any = await database.findUser(user?.id);
    if (!userProfile) return interaction.editReply({ content: "please use `/farmer` before trying to claim your daily reward." });
    
    let timeLeft = userProfile.daily - Date.now();
    if (timeLeft > 0) return interaction.editReply({ content: `You still have to wait **${formatTimestamp(timeLeft)}** to claim your next daily reward.` });

    let reward = Math.floor(Math.random() * (250 - 100 + 1)) + 100;

    userProfile.daily = Date.now() + 1000 * 60 * 60 * 24; // 24h
    userProfile.gold += reward;

    await userProfile.save();

    return interaction.editReply({ content: `${userProfile.username} has earned a total of **${reward}** 🪙` });
}

function formatTimestamp(timestamp: number): string {
    const seconds = Math.floor(timestamp / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    return `${hours}h ${minutes%60}m ${seconds%60}s`;
}