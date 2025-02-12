import { CommandInteraction, SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType, MessageFlags } from "discord.js";
import marketItems from "../config/items/market_items.json";
import upgrades from "../config/upgrades/farms.json";

let seedsData = stringifyMarketData(marketItems, "seeds");
let animalsData = stringifyMarketData(marketItems, "animals");
let upgradesData = stringifyMarketData(upgrades);

export const data = new SlashCommandBuilder()
    .setName("market")
    .setDescription("shows the current market items");

export async function execute(interaction: CommandInteraction) {
    const marketLandingPage = new EmbedBuilder()
        .setTitle("The Market")
        .setColor("Yellow")
        .setTimestamp()
        .setDescription("Welcome to the farm market! here you can buy all the items you need to move further with your farming.\n check the buttons down below to explore the current market items.")
        .setImage("https://i.postimg.cc/BnK28KBq/farm.webp")

    const marketAnimalsPage = new EmbedBuilder()
        .setTitle("Animals")
        .setTimestamp()
        .setThumbnail("https://i.imgur.com/Lnsq74n.png")
        .setColor("Yellow")
        .setDescription(animalsData)
        .setImage("https://i.postimg.cc/BnK28KBq/farm.webp")

    const marketSeedsPage = new EmbedBuilder()
        .setTitle("Seeds")
        .setThumbnail("https://i.imgur.com/pVTdWwO.png")
        .setTimestamp()
        .setColor("Yellow")
        .setDescription(seedsData)
        .setImage("https://i.postimg.cc/BnK28KBq/farm.webp")

    const marketUpgradesPage = new EmbedBuilder()
        .setTitle("Upgrades")
        .setThumbnail("https://i.imgur.com/KNAbCUO.png")
        .setTimestamp()
        .setColor("Yellow")
        .setDescription(upgradesData)
        .setImage("https://i.postimg.cc/BnK28KBq/farm.webp")

    const animalsBtn = new ButtonBuilder()
        .setCustomId('animals')
        .setLabel('Animals 🤠')
        .setStyle(ButtonStyle.Primary)

    const seedsBtn = new ButtonBuilder()
        .setCustomId('seeds')
        .setLabel('Seeds 🌱')
        .setStyle(ButtonStyle.Primary);

    const upgradesBtn = new ButtonBuilder()
        .setCustomId('upgrades')
        .setLabel('Upgrades ⏫')
        .setStyle(ButtonStyle.Primary);

    const mainMenu = new ButtonBuilder()
        .setCustomId('mainmenu')
        .setLabel('Main Menu')
        .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(mainMenu, animalsBtn, seedsBtn, upgradesBtn);

    const response = await interaction.reply({
        embeds: [marketLandingPage],
        components: [row],
        withResponse: true
    });

    let timeout = 120_000;
    const collector = response?.resource?.message?.createMessageComponentCollector({ filter: (m) => m.user.id === interaction.user.id, componentType: ComponentType.Button, time: timeout });

    collector?.on("collect", async data => {
        await data.deferUpdate();

        row.components.forEach(component => component.setStyle(ButtonStyle.Primary).setDisabled(false));

        switch (data.customId) {
            case "mainmenu":
                row.components[0].setStyle(ButtonStyle.Success).setDisabled(true);
                await interaction.editReply({ embeds: [marketLandingPage], components: [row] });
                break;
            case "animals":
                row.components[1].setStyle(ButtonStyle.Success).setDisabled(true);
                await interaction.editReply({ embeds: [marketAnimalsPage], components: [row] });
                break;
            case "seeds":
                row.components[2].setStyle(ButtonStyle.Success).setDisabled(true);
                await interaction.editReply({ embeds: [marketSeedsPage], components: [row] });
                break;
            case "upgrades":
                row.components[3].setStyle(ButtonStyle.Success).setDisabled(true);
                await interaction.editReply({ embeds: [marketUpgradesPage], components: [row] });
                break;
        }
    });

    collector?.on("end", async () => {
        row.components.forEach(component => component.data.disabled = true);
        await interaction.editReply({ components: [row] });
    })
}

function stringifyMarketData(data: Array<Record<string, string | number>>, type: "seeds" | "animals" | null = null): string {
    let finalString: string = "";
    data.map(record => {
        const keys = Object.keys(record);

        if (record['type'] && record['type'] !== type) return;

        keys.map(key => {
            let newReadyTime: string = "";
            let cleanKey = key.replace("_", " ");
            if (key === "ready_time") newReadyTime = `${Number(record[key]) / 1000 / 60}mins`;
            finalString += `**${cleanKey}:** ${key==="ready_time" ? newReadyTime : record[key]}\n`;
        });
        
        finalString += "\n\n";
    })
    return finalString;
}