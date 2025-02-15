import { CommandInteraction, SlashCommandBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ActionRowBuilder, ComponentType } from "discord.js";
import database from "../database/methods.ts";
import farmLevels from "../config/upgrades/farms.json";

export const data = new SlashCommandBuilder()
    .setName("upgradefarm")
    .setDescription("Upgrade your farm to the next level and gain its benefits.")

export async function execute(interaction: CommandInteraction) {
    const userId = interaction.user.id;

    const userProfile: any = await database.findUser(userId);
    if (!userProfile) return interaction.editReply({ content: "Please make a profile using `/farmer` before trying to buy anything from the market." });

    const nextLevelData = farmLevels.find(v => v.level === userProfile.farm.level + 1);
    if (!nextLevelData) return interaction.reply({ content: "you are at the max level." });
    if (userProfile.gold < nextLevelData.price) return interaction.reply({ content: `you do not have enough gold to upgrade. the next farm level is priced at **${nextLevelData.price}** 🪙` });

    const confirmationEmbed = new EmbedBuilder()
        .setTitle(`Upgrade Farm to level ${userProfile.farm.level + 1}`)
        .setDescription(`are you sure you want to upgrade for **${nextLevelData.price}** 🪙?`)
        .setTimestamp()
        .setColor("Green")

    const confirmBtn = new ButtonBuilder().setCustomId("confirm").setLabel("Confirm").setStyle(ButtonStyle.Success);
    const cancelBtn = new ButtonBuilder().setCustomId("cancel").setLabel("Cancel").setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(confirmBtn, cancelBtn);

    const response = await interaction.reply({ embeds: [confirmationEmbed], components: [row], withResponse: true });

    let timeout = 60 * 1000;
    const collector = response?.resource?.message?.createMessageComponentCollector({ filter: (m) => m.user.id === interaction.user.id, componentType: ComponentType.Button, time: timeout });

    collector?.on("collect", async (col) => {
        await col.deferUpdate();

        switch (col.customId) {
            case "confirm":
                await database.makePayment(userProfile, -nextLevelData.price);
                await database.upgradeFarm(userProfile, nextLevelData);
                confirmationEmbed.setDescription("✨ Yeehaaa!, your farm is now at level " + nextLevelData.level)
                break;
            case "cancel":
                confirmationEmbed.setDescription("Upgrade cancelled.").setColor("Red")
                break;
        }

        row.components.forEach(component => component.data.disabled = true);

        await interaction.editReply({ embeds: [confirmationEmbed], components: [row] });
    });

    collector?.on("end", async () => {
        row.components.forEach(component => component.data.disabled = true);
        await interaction.editReply({ components: [row] });
    })
}