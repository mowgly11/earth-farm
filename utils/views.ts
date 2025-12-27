import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder } from "discord.js";
import marketItems from "../config/items/market_items.json";
import upgrades from "../config/upgrades/farms.json";
import { COLORS } from "./constants.ts";
import { BTN_STYLE } from "./button_handler.ts";
import { VIEWS_MARKET_BUTTONS, BUTTONS } from "./buttons.ts";
import { formatNumber, getRandomTip } from "./ux.ts";
import { addBackButton } from "./nav_history.ts";

// Emoji mapping for items
const itemEmojis: Record<string, string> = {
    // Animals
    "chicken": "🐔",
    "cow": "🐄",
    "sheep": "🐑",
    "pig": "🐷",
    "duck": "🦆",
    "goat": "🐐",
    "horse": "🐴",
    "rabbit": "🐰",
    "turkey": "🦃",
    // Seeds
    "wheat seeds": "🌾",
    "corn seeds": "🌽",
    "carrot seeds": "🥕",
    "potato seeds": "🥔",
    "tomato seeds": "🍅",
    "pumpkin seeds": "🎃",
    "strawberry seeds": "🍓",
    "lettuce seeds": "🥬",
    "pepper seeds": "🌶️",
    "onion seeds": "🧅",
    "watermelon seeds": "🍉",
    "blueberry seeds": "🫐",
    "coffee seeds": "☕"
};

function getItemEmoji(name: string, type: string): string {
    const key = name.toLowerCase();
    if (itemEmojis[key]) return itemEmojis[key];
    // Fallback
    return type === "animals" ? "🐾" : "🌱";
}

/**
 * Create the market view embed and components
 * Can be used both by /market command and nav:market button
 */
export function createMarketView(category: string, gold: number, selectedItem: any, userId: string, messageId?: string) {
    const animals = marketItems.filter(item => item.type === "animals");
    const seeds = marketItems.filter(item => item.type === "seeds");

    // Category buttons
    const categoryRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        VIEWS_MARKET_BUTTONS.home(category === "main"),
        VIEWS_MARKET_BUTTONS.animals(category === "animals"),
        VIEWS_MARKET_BUTTONS.seeds(category === "seeds"),
        VIEWS_MARKET_BUTTONS.upgrades(category === "upgrades")
    );

    const components: any[] = [categoryRow];
    let embed: EmbedBuilder;

    if (category === "main") {
        embed = new EmbedBuilder()
            .setTitle("🏪 The Market")
            .setColor(COLORS.PRIMARY)
            .setDescription(`💰 Your Gold: **${formatNumber(gold)}** 🪙\n\nWelcome to the farm market! Browse categories above.`)
            .addFields(
                { name: "🐔 Animals", value: `${animals.length} available`, inline: true },
                { name: "🌱 Seeds", value: `${seeds.length} available`, inline: true },
                { name: "⏫ Upgrades", value: `${upgrades.length - 1} levels`, inline: true }
            )
            .setFooter({ text: "Select a category to browse items" })
            .setTimestamp();

    } else if (category === "animals" || category === "seeds") {
        const items = category === "animals" ? animals : seeds;
        const emoji = category === "animals" ? "🐔" : "🌱";

        embed = new EmbedBuilder()
            .setTitle(`${emoji} ${category.charAt(0).toUpperCase() + category.slice(1)} Market`)
            .setColor(COLORS.PRIMARY)
            .setDescription(`💰 Your Gold: **${formatNumber(gold)}** 🪙\n\nSelect an item to see details.`)
            .setTimestamp();

        // Add select menu with specific emojis
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`market:select_${category}`)
            .setPlaceholder(`Select ${category === "animals" ? "an animal" : "a seed"}...`)
            .addOptions(items.map(item => ({
                label: item.name,
                description: `${formatNumber(item.buy_price)} 🪙 | ${(item.ready_time / 1000 / 60).toFixed(0)} min`,
                value: item.name.toLowerCase(),
                emoji: getItemEmoji(item.name, item.type)
            })));

        components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));

        // If item selected, show details and buy buttons
        if (selectedItem) {
            const canAfford = Math.floor(gold / selectedItem.buy_price);
            embed.addFields(
                { name: "📦 Selected", value: `**${selectedItem.name}**`, inline: true },
                { name: "💰 Price", value: `${formatNumber(selectedItem.buy_price)} 🪙`, inline: true },
                { name: "🛒 Can Afford", value: `${canAfford}x`, inline: true }
            );
            embed.addFields(
                { name: "⏱️ Ready Time", value: `${(selectedItem.ready_time / 1000 / 60).toFixed(0)} min`, inline: true },
                { name: "📦 Produces", value: selectedItem.gives, inline: true },
                { name: "⭐ Req. Level", value: `${selectedItem.level}`, inline: true }
            );

            // Buy buttons
            const buyRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                VIEWS_MARKET_BUTTONS.buyAmount(1, userId)
                    .setLabel("Buy 1").setStyle(canAfford >= 1 ? 3 : 2) // SUCCESS : SECONDARY
                    .setDisabled(canAfford < 1),
                VIEWS_MARKET_BUTTONS.buyAmount(5, userId)
                    .setLabel("Buy 5").setStyle(canAfford >= 5 ? 3 : 2)
                    .setDisabled(canAfford < 5),
                VIEWS_MARKET_BUTTONS.buyAmount(canAfford, userId)
                    .setLabel(`Buy Max (${canAfford})`).setStyle(canAfford >= 1 ? 1 : 2) // PRIMARY : SECONDARY
                    .setDisabled(canAfford < 1)
            );
            components.push(buyRow);

            embed.setFooter({ text: getRandomTip() });
        } else {
            embed.setFooter({ text: "Select an item from the dropdown above" });
        }

    } else if (category === "upgrades") {
        embed = new EmbedBuilder()
            .setTitle("⏫ Farm Upgrades")
            .setColor(COLORS.PRIMARY)
            .setDescription(`💰 Your Gold: **${formatNumber(gold)}** 🪙\n\nUse \`/upgradefarm\` to upgrade!`)
            .setFooter({ text: "Upgrades increase crop/animal slots and storage" })
            .setTimestamp();

        upgrades.forEach(upgrade => {
            if (upgrade.level === 1) return;
            embed.addFields({
                name: `Level ${upgrade.level} - ${formatNumber(upgrade.price)} 🪙`,
                value: `🌱 ${upgrade.available_crop_slots} crops | 🐔 ${upgrade.available_animal_slots} animals`,
                inline: true
            });
        });
    } else {
        embed = new EmbedBuilder().setTitle("Market").setColor(COLORS.PRIMARY);
    }

    // Add dashboard navigation row
    const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(BUTTONS.dashboard());
    components.push(navRow);

    return { embeds: [embed], components: addBackButton(components, userId, messageId) };
}
