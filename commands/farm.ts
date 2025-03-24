import { CommandInteraction, SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import database from "../database/methods.ts";

export const data = new SlashCommandBuilder()
    .setName("farm")
    .setDescription("check your farm stats and occupied crop & animal slots")
    .addUserOption(option =>
        option
            .setName("farmer")
            .setDescription("check another farmer's farm stats")
    )

export async function execute(interaction: CommandInteraction) {
    let user: any = interaction.options.get("farmer")?.user;
    if (!user) user = interaction.user;

    if (user.bot) return interaction.reply({ content: "you can't interact with bots!", flags: MessageFlags.Ephemeral });
    await interaction.deferReply();

    let userProfile: any = await database.findUser(user.id);
    if (!userProfile) return interaction.editReply({ content: `${user.username}'s farm wasn't found.` });

    const farmerEmbed = new EmbedBuilder()
        .setTitle(`🌾 ${user.username}'s Farm`)
        .setColor("#FFD700")
        .setDescription(stringifySlots(userProfile.farm))
        .setThumbnail(user.displayAvatarURL())
        .setFooter({ text: `Farm Level ${userProfile.farm.level}` })
        .setTimestamp()
        .setImage("https://i.imgur.com/NiXXCZf.png");

    await interaction.editReply({ embeds: [farmerEmbed] });
}

function stringifySlots(farmDetails: any) {
    let strOfUserData: string = "";
    const keys = Object.keys(farmDetails);
    for (let i = 0; i < keys.length; i++) {
        const val = farmDetails[keys[i]];
        if (typeof val !== "object") strOfUserData += `**${keys[i].replace(/_/g, " ")}:** ${String(val)}\n`;

        else {
            strOfUserData += "\n";
            for (let j = 0; j < val.length; j++) {
                let slotType = keys[i] === "occupied_crop_slots" ? "plant" : "animal";
                let objKeys = Object.keys(val[j]);
                for (let k = 0; k < objKeys.length; k++) {
                    if (objKeys[k] === "gives" || objKeys[k] === "ready_time") continue;
                    strOfUserData += `**Slot ${j + 1} ${slotType} ${objKeys[k].replace(/_/g, " ")}:** ${objKeys[k] === "ready_at" ? String(((val[j][objKeys[k]] - Date.now()) / 1000) < 0 ? "Ready!" : ((val[j][objKeys[k]] - Date.now()) / 1000).toFixed(0) + 's') : val[j][objKeys[k]]}\n`;
                }
                strOfUserData += "\n";
            }
        }
    }

    return strOfUserData;
}