import { CommandInteraction, SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType, MessageFlags } from "discord.js";
import marketItems from "../config/items/market_items.json";
import upgrades from "../config/upgrades/farms.json";

export const data = new SlashCommandBuilder()
    .setName("market")
    .setDescription("shows the current market items");

export async function execute(interaction: CommandInteraction) {
    const marketLandingPage = new EmbedBuilder()
        .setTitle("🏪 The Market")
        .setColor("#FFD700")
        .setTimestamp()
        .setDescription("Welcome to the farm market! Here you can buy all the items you need to move further with your farming.\n\n**Categories:**\n• 🤠 Animals - Raise animals for products\n• 🌱 Seeds - Plant and harvest crops\n• ⏫ Upgrades - Improve your farm\n\nCheck the buttons below to explore the current market items.")
        .setImage("https://i.postimg.cc/BnK28KBq/farm.webp");

    const marketAnimalsPage = new EmbedBuilder()
        .setTitle("🤠 Animals Market")
        .setTimestamp()
        .setColor("#FFD700")
        .setDescription("Browse available animals to raise on your farm.")
        .setFooter({ text: "Tip: Use /buy to purchase animals" })
        .setImage("https://i.postimg.cc/BnK28KBq/farm.webp");

    const marketSeedsPage = new EmbedBuilder()
        .setTitle("🌱 Seeds Market")
        .setTimestamp()
        .setColor("#FFD700")
        .setDescription("Browse available seeds to plant on your farm.")
        .setFooter({ text: "Tip: Use /buy to purchase seeds" })
        .setImage("https://i.postimg.cc/BnK28KBq/farm.webp");

    const marketUpgradesPage = new EmbedBuilder()
        .setTitle("⏫ Farm Upgrades")
        .setTimestamp()
        .setColor("#FFD700")
        .setDescription("Upgrade your farm to increase slots and storage capacity.")
        .setFooter({ text: "Tip: Use /upgradefarm to upgrade your farm" })
        .setImage("https://i.postimg.cc/BnK28KBq/farm.webp");

    // Format market items
    const animals = marketItems.filter(item => item.type === "animals");
    const seeds = marketItems.filter(item => item.type === "seeds");

    // Add animals to the animals page
    animals.forEach(animal => {
        marketAnimalsPage.addFields({
            name: animal.name,
            value: `**Level:** ${animal.level}\n**Price:** ${animal.buy_price} 🪙\n**Ready Time:** ${animal.ready_time / 1000 / 60}mins\n**Produces:** ${animal.gives}\n**Lifetime:** ${animal.lifetime!/1000/60/60}h`,
            inline: true
        });
    });

    // Add seeds to the seeds page
    seeds.forEach(seed => {
        marketSeedsPage.addFields({
            name: seed.name,
            value: `**Level:** ${seed.level}\n**Price:** ${seed.buy_price} 🪙\n**Ready Time:** ${seed.ready_time / 1000 / 60}mins\n**Produces:** ${seed.gives}`,
            inline: true
        });
    });

    // Add upgrades to the upgrades page
    upgrades.forEach(upgrade => {
        if (upgrade.level === 1) return; // Skip the first level as it's the starting point
        marketUpgradesPage.addFields({
            name: `Level ${upgrade.level}`,
            value: `**Price:** ${upgrade.price} 🪙\n**Crop Slots:** ${upgrade.available_crop_slots}\n**Animal Slots:** ${upgrade.available_animal_slots}\n**Storage:** ${upgrade.storage_limit}`,
            inline: true
        });
    });

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