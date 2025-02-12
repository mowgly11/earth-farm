import { CommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
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
    await interaction.deferReply();
    let user: any = interaction.options.get("farmer")?.user;
    if (!user) user = interaction.user;

    let userProfile: any = await database.findUser(user.id);
    if (!userProfile) return interaction.editReply({ content: `${user.username}'s farm wasn't found.` });

    let userInfoFields: Array<UserInfoFields> = [...stringifySlots(userProfile.farm)];

    const farmerEmbed = new EmbedBuilder()
        .setTitle(`${user.username}'s Farm stats`)
        .setColor("Yellow")
        .addFields(...userInfoFields)

    await interaction.editReply({ embeds: [farmerEmbed] });
}

function stringifySlots(farmDetails: any): Array<UserInfoFields> {
    let arrOfUserData: Array<UserInfoFields> = [];
    const keys = Object.keys(farmDetails);
    for (let i = 0; i < keys.length; i++) {
        const val = farmDetails[keys[i]];
        if (typeof val !== "object") arrOfUserData.push({
            name: keys[i].replace(/_/g, " "),
            value: String(val),
            inline: true
        });
        else {
            for (let j = 0; j < val.length; j++) {
                let objKeys = Object.keys(val[j]);
                for (let k = 0; k < objKeys.length; k++) {
                    arrOfUserData.push({
                        name: `Slot ${j+1} plant ` + objKeys[k].replace(/_/g, " ") + ":",
                        value: objKeys[k] === "ready_at" ? String(((val[j][objKeys[k]] - Date.now()) / 1000) < 0 ? "Ready!" : ((val[j][objKeys[k]] - Date.now()) / 1000).toFixed(0) + 's') : val[j][objKeys[k]],
                    });
                }
            }
        }
    }

    return arrOfUserData;
}

type UserInfoFields = {
    name: string;
    value: string;
    inline?: boolean;
}