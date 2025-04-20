import { CommandInteraction, SlashCommandBuilder, MessageFlags } from "discord.js";
import database from "../database/methods.ts";
import levels from "../config/data/levels.json";
import { userProfileCache } from "../index.ts";

export const data = new SlashCommandBuilder()
    .setName("xp")
    .setDescription("show's a farmers xp")
    .addUserOption(option =>
        option
            .setName("farmer")
            .setDescription("show a farmer's xp")
    )

export async function execute(interaction: CommandInteraction) {
    let user = interaction.options.get("farmer")?.user;
    if(user?.bot) return await interaction.reply({ content: "you can't interact with bots!", flags: MessageFlags.Ephemeral});
    if (!user) user = interaction.user;
    
    await interaction.deferReply();

    // Check cache first
    let userData: any = userProfileCache.get(user.id);
    
    // If not in cache, get from database and cache it
    if (!userData) {
        const dbProfile = await database.findUser(user.id);
        if (!dbProfile) return await interaction.editReply({ content: `${user.username}'s xp wasn't found.` });
        
        // Cache the plain object
        userData = (dbProfile as any).toObject();
        userProfileCache.set(user.id, userData);
    }

    const xp = userData?.xp;
    const currentLevel = userData?.level;
    let requiredXp = levels.find(obj => obj.level === currentLevel)?.xp_to_upgrade!;
    if(xp == null) requiredXp = -1;

    await interaction.editReply({
        content: `**${user.username}** has **${xp}/${requiredXp === -1 ? "max" : requiredXp}** xp and is currently at level **${currentLevel}**`, 
    })
}