import { CommandInteraction, SlashCommandBuilder, MessageFlags } from "discord.js";
import database from "../database/methods.js";
import { userProfileCache } from "../index.ts";
import schema from "../database/schema.ts";

export const data = new SlashCommandBuilder()
    .setName("daily")
    .setDescription("collect your daily gold reward.")

export async function execute(interaction: CommandInteraction) {
    let user = interaction.options.get("farmer")?.user;
    if (user?.bot) return interaction.reply({ content: "you can't interact with bots!", flags: MessageFlags.Ephemeral });
    await interaction.deferReply();
    if (!user) user = interaction.user;

    // Check cache first
    let userProfile: any = userProfileCache.get(user.id);
    
    // If not in cache, get from database and cache it
    if (!userProfile) {
        const dbProfile = await database.findUser(user.id);
        if (!dbProfile) return interaction.editReply({ content: "please use `/farmer` before trying to claim your daily reward." });
        
        // Cache the plain object
        userProfile = (dbProfile as any).toObject();
        userProfileCache.set(user.id, userProfile);
    }
    
    let timeLeft = userProfile.daily - Date.now();
    if (timeLeft > 0) return interaction.editReply({ content: `You still have to wait **${formatTimestamp(timeLeft)}** to claim your next daily reward.` });

    let reward = Math.floor(Math.random() * (250 - 100 + 1)) + 100;

    // Update cache immediately
    const updatedProfile = { ...userProfile };
    updatedProfile.daily = Date.now() + 1000 * 60 * 60 * 24; // 24h
    updatedProfile.gold += reward;
    
    // Update cache
    userProfileCache.set(user.id, updatedProfile);

    // Hydrate the cached profile into a Mongoose document
    const dbProfile = schema.hydrate(updatedProfile);
    if (!dbProfile) {
        userProfileCache.del(user.id);
        return interaction.editReply({ content: "An error occurred while processing your request." });
    }

    try {
        await dbProfile.save();
    } catch (error) {
        console.error('Error updating database:', error);
        userProfileCache.del(user.id);
        return interaction.editReply({ content: "An error occurred while processing your request." });
    }

    return interaction.editReply({ content: `${userProfile.username} has earned a total of **${reward}** 🪙` });
}

function formatTimestamp(timestamp: number): string {
    const seconds = Math.floor(timestamp / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    return `${hours}h ${minutes%60}m ${seconds%60}s`;
}