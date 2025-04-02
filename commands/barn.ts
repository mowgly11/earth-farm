import { CommandInteraction, SlashCommandBuilder, MessageFlags, EmbedBuilder } from "discord.js";
import database from "../database/methods.ts";
import { userProfileCache } from "../index.ts";

export const data = new SlashCommandBuilder()
    .setName("barn")
    .setDescription("show's your/others barn")
    .addUserOption(option =>
        option
            .setName("farmer")
            .setDescription("the farmer you want to view their barn")
    )

export async function execute(interaction: CommandInteraction) {
    let user = interaction.options.get("farmer")?.user;
    if(user?.bot) return interaction.reply({ content: "you can't interact with bots!", flags: MessageFlags.Ephemeral});
    if (!user) user = interaction.user;
    
    await interaction.deferReply();
    
    // Check cache first

    let userProfile: any = userProfileCache.get(user.id);
    
    // If not in cache, get from database and cache it
    if (!userProfile) {
        userProfile = await database.findUser(user.id);
        if (!userProfile) return interaction.editReply({ content: "user's barn wasn't found." });
        
        // Convert Mongoose document to plain object before caching
        const plainProfile = userProfile.toObject();
        userProfileCache.set(user.id, plainProfile);
        userProfile = plainProfile;
    }

    let storageCount = 0;
    userProfile.storage.market_items.forEach((v:any) => storageCount += v.amount);
    userProfile.storage.products.forEach((v:any) => storageCount += v.amount);

    const storageEmbed = new EmbedBuilder()
        .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
        .setTitle(`🏭 ${user.username}'s Barn`)
        .setColor("#FFD700")
        .setDescription(`Storage: **${storageCount}/${userProfile.farm.storage_limit}** slots used`)
        .addFields(...formatstorage(userProfile.storage))
        .setFooter({ text: `Farm Level ${userProfile.farm.level}` })
        .setTimestamp()
        .setImage("https://i.imgur.com/JhrMFfI.png");

    return interaction.editReply({ embeds: [storageEmbed] });
}

function formatstorage(fields: Record<string, Array<Record<string, string | number>>>): Array<UserInfoFields> {
    let finalArray: Array<UserInfoFields> = [];

    const keys = Object.keys(fields);
    let currentFieldString = "";
    for (let i = 0; i < keys.length; i++) {
        currentFieldString = fields[keys[i]].map(v => `${v.amount} ${v.name}`).join("\n");
        finalArray.push({
            name: keys[i].replace(/_/g, " "),
            value: currentFieldString === "" ? "No items here yet." : currentFieldString,
        });
        currentFieldString = "";
    }

    return finalArray;
}

type UserInfoFields = {
    name: string;
    value: string;
    inline?: boolean;
}