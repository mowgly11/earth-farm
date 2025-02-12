import { CommandInteraction, SlashCommandBuilder, MessageFlags, EmbedBuilder } from "discord.js";
import database from "../database/methods.ts";

export const data = new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("show's your/others inventory")
    .addUserOption(option =>
        option
            .setName("farmer")
            .setDescription("the farmer you want to view their inventory")
    )

export async function execute(interaction: CommandInteraction) {
    await interaction.deferReply();
    let user = interaction.options.get("farmer")?.user;
    if (!user) user = interaction.user;

    let userProfile: any = await database.findUser(user.id);
    if (!userProfile) return interaction.editReply({ content: "user's inventory wasn't found." });


    const inventoryEmbed = new EmbedBuilder()
        .setAuthor({ name: user.username })
        .setTitle(`${user.username}'s Inventory`)
        .setColor("Yellow")
        .addFields(...formatInventory(userProfile.inventory))
        .setImage("https://i.imgur.com/JhrMFfI.png")

    return interaction.editReply({ embeds: [inventoryEmbed] });
}

function formatInventory(fields: Record<string, Array<Record<string, string | number>>>): Array<UserInfoFields> {
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