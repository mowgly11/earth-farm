import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import database from "../database/methods.ts";
import { Document } from "mongoose";
import { logError } from "../utils/error_logger.ts";

interface UserProfile extends Document {
    userId: string;
    username: string;
    level: number;
    xp: number;
    gold: number;
}

export const data = new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the server's leaderboard")
    .addStringOption(option =>
        option
            .setName("type")
            .setDescription("What to rank players by")
            .setRequired(true)
            .addChoices(
                { name: "Experience Points (XP)", value: "xp" },
                { name: "Gold Balance", value: "gold" }
            )
    );

export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const type = interaction.options.getString("type")!;
    
    try {
        // Get all user profiles
        const allProfiles = await database.getAllUsers() as unknown as UserProfile[];
        
        // Sort profiles based on selected type
        const sortedProfiles = allProfiles.sort((a: UserProfile, b: UserProfile) => {
            if (type === "xp") {
                return (b.xp || 0) - (a.xp || 0);
            } else {
                return (b.gold || 0) - (a.gold || 0);
            }
        });

        // Get top 10 profiles
        const top10 = sortedProfiles.slice(0, 10);

        // Create embed
        const embed = new EmbedBuilder()
            .setTitle(`🏆 Farming Simulator Leaderboard - ${type.toUpperCase()}`)
            .setColor("#FFD700")
            .setTimestamp();

        // Build leaderboard description
        let description = "";
        for (let i = 0; i < top10.length; i++) {
            const profile = top10[i];
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "👤";
            
            if (type === "xp") {
                description += `${medal} **${i + 1}.** ${profile.username} - Level ${profile.level} (${profile.xp} XP)\n`;
            } else {
                description += `${medal} **${i + 1}.** ${profile.username} - ${profile.gold} 🪙\n`;
            }
        }

        // Add user's rank if not in top 10
        const userProfile = sortedProfiles.find((p: UserProfile) => p.userId === interaction.user.id);
        if (userProfile) {
            const userRank = sortedProfiles.findIndex((p: UserProfile) => p.userId === interaction.user.id) + 1;
            if (userRank > 10) {
                description += "\n─────────────────────────\n";
                if (type === "xp") {
                    description += `👤 **${userRank}.** You - Level ${userProfile.level} (${userProfile.xp} XP)\n`;
                } else {
                    description += `👤 **${userRank}.** You - ${userProfile.gold} 🪙\n`;
                }
            }
        }

        embed.setDescription(description);
        return await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        logError(interaction.client, {
            path: "leaderboard.ts",
            error
        })
        return await interaction.editReply({ content: "Failed to fetch leaderboard data. Please try again later." });
    }
}
