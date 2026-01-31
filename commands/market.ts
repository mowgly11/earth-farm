import { CommandInteraction, SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType, StringSelectMenuBuilder, StringSelectMenuInteraction, ButtonInteraction, MessageFlags } from "discord.js";
import marketItems from "../config/items/market_items.json";
import upgrades from "../config/upgrades/farms.json";
import database from "../database/methods.ts";
import { userProfileCache } from "../services/profile_service.ts";
import { COLORS, ERRORS } from "../utils/constants.ts";
import { createNoProfileEmbed } from "../utils/onboarding.ts";
import { formatNumber, getRandomTip } from "../utils/ux.ts";
import { BTN_STYLE, parseButtonId, isButtonOwner } from "../utils/button_handler.ts";
import { MARKET_BUTTONS, BUTTONS } from "../utils/buttons.ts";
import { getProfile } from "../services/index.ts";

export const data = new SlashCommandBuilder()
    .setName("market")
    .setDescription("Browse and buy items from the market!");

export async function execute(interaction: CommandInteraction) {
    const userId = interaction.user.id;

    // Get user profile (using ProfileService)
    const profileResult = await getProfile(userId);
    if (!profileResult) return await interaction.reply({ ...createNoProfileEmbed(userId), flags: MessageFlags.Ephemeral });
    let userProfile = profileResult.profile;

    // Track selected item
    let selectedItem: any = null;
    let currentCategory = "main";

    // Send initial view
    const response = await interaction.reply({
        ...createMarketView(currentCategory, userProfile.gold, selectedItem, userId),
        withResponse: true
    });

    // Collector for all interactions
    const collector = response?.resource?.message?.createMessageComponentCollector({
        filter: (m) => {
            // Check ownership via customId for buttons
            if (m.isButton()) {
                const parts = m.customId.split(":");
                return parts.length < 3 || parts[2] === userId;
            }
            return m.user.id === userId;
        },
        time: 300000 // 5 minutes
    });

    collector?.on("collect", async (i) => {
        // Refresh profile
        const dbProfile = await database.findUser(userId);
        if (!dbProfile) {
            await i.reply({ ...createNoProfileEmbed(i.user.id), flags: MessageFlags.Ephemeral });
            return;
        }
        userProfile = (dbProfile as any).toObject();
        userProfileCache.set(userId, userProfile);

        if (i.isStringSelectMenu()) {
            // Item selected
            await i.deferUpdate();
            const itemName = i.values[0];
            selectedItem = marketItems.find(item => item.name.toLowerCase() === itemName.toLowerCase());

            const view = createMarketView(currentCategory, userProfile.gold, selectedItem, userId);
            await interaction.editReply(view);

        } else if (i.isButton()) {
            const customId = i.customId;

            // Category buttons
            if (["main", "animals", "seeds", "upgrades"].includes(customId)) {
                await i.deferUpdate();
                currentCategory = customId;
                selectedItem = null;

                const view = createMarketView(currentCategory, userProfile.gold, selectedItem, userId);
                await interaction.editReply(view);

            } else if (customId.startsWith("buy:")) {
                // Buy action
                const parts = customId.split(":");
                const amount = parseInt(parts[1]);

                if (!selectedItem) {
                    await i.reply({ content: "❌ No item selected!", flags: MessageFlags.Ephemeral });
                    return;
                }

                const totalCost = selectedItem.buy_price * amount;
                if (userProfile.gold < totalCost) {
                    await i.reply({
                        content: `❌ You need **${formatNumber(totalCost)}** 🪙 but only have **${formatNumber(userProfile.gold)}** 🪙`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                // Perform purchase
                const profile = dbProfile as any;
                profile.gold -= totalCost;

                // Add to storage
                const storageKey = selectedItem.type === "seeds" ? "market_items" : "market_items";
                const existingItem = profile.storage[storageKey].find((s: any) => s.name === selectedItem.name);
                if (existingItem) {
                    existingItem.amount += amount;
                } else {
                    profile.storage[storageKey].push({ name: selectedItem.name, amount });
                }

                profile.markModified("gold");
                profile.markModified("storage");
                await profile.save();

                // Update cache
                userProfile = profile.toObject();
                userProfileCache.set(userId, userProfile);

                await i.reply({
                    content: `✅ Purchased **${amount}x ${selectedItem.name}** for **${formatNumber(totalCost)}** 🪙!\n💰 New balance: **${formatNumber(userProfile.gold)}** 🪙`,
                    flags: MessageFlags.Ephemeral
                });

                // Refresh view
                const view = createMarketView(currentCategory, userProfile.gold, selectedItem, userId);
                await interaction.editReply(view);

            } else if (customId.startsWith("dashboard:")) {
                await i.reply({ content: "💡 Use `/dashboard` for the interactive hub!", flags: MessageFlags.Ephemeral });
            }
        }
    });

    collector?.on("end", async () => {
        const view = createMarketView(currentCategory, userProfile.gold, null, userId);
        view.components.forEach((row: any) => {
            row.components.forEach((c: any) => {
                if (c.data) c.data.disabled = true;
                else if (c.setDisabled) c.setDisabled(true);
            });
        });
        await interaction.editReply(view).catch(() => { });
    });
}

function createMarketView(category: string, gold: number, selectedItem: any, userId: string) {
    const animals = marketItems.filter(item => item.type === "animals");
    const seeds = marketItems.filter(item => item.type === "seeds");

    // Category buttons + dashboard
    const categoryRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        MARKET_BUTTONS.home(category === "main"),
        MARKET_BUTTONS.animals(category === "animals"),
        MARKET_BUTTONS.seeds(category === "seeds"),
        MARKET_BUTTONS.upgrades(category === "upgrades"),
        BUTTONS.dashboard()
    );

    const components: any[] = [categoryRow];
    let embed: EmbedBuilder;

    if (category === "main") {
        embed = new EmbedBuilder()
            .setTitle("🏪 The Market")
            .setColor(COLORS.PRIMARY)
            .setDescription(`💰 Your Gold: **${formatNumber(gold)}** 🪙\n\nWelcome to the farm market! Browse categories above to find items.`)
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
            .setDescription(`💰 Your Gold: **${formatNumber(gold)}** 🪙\n\nSelect an item from the dropdown to see details and buy.`)
            .setTimestamp();

        // Add select menu
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`select_${category}`)
            .setPlaceholder(`Select ${category === "animals" ? "an animal" : "a seed"}...`)
            .addOptions(items.map(item => ({
                label: item.name,
                description: `${formatNumber(item.buy_price)} 🪙 | ${(item.ready_time / 1000 / 60).toFixed(0)} min`,
                value: item.name.toLowerCase(),
                emoji: category === "animals" ? "🐔" : "🌱"
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
                MARKET_BUTTONS.buyAmount(1, userId)
                    .setLabel("Buy 1").setStyle(canAfford >= 1 ? 3 : 2) // SUCCESS : SECONDARY
                    .setDisabled(canAfford < 1),
                MARKET_BUTTONS.buyAmount(5, userId)
                    .setLabel("Buy 5").setStyle(canAfford >= 5 ? 3 : 2)
                    .setDisabled(canAfford < 5),
                MARKET_BUTTONS.buyAmount(canAfford, userId)
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
            .setDescription(`💰 Your Gold: **${formatNumber(gold)}** 🪙\n\nUse \`/upgradefarm\` to upgrade your farm!`)
            .setFooter({ text: "Upgrades increase crop/animal slots and storage" })
            .setTimestamp();

        upgrades.forEach(upgrade => {
            if (upgrade.level === 1) return;
            embed.addFields({
                name: `Level ${upgrade.level} - ${formatNumber(upgrade.price)} 🪙`,
                value: `🌱 ${upgrade.available_crop_slots} crops | 🐔 ${upgrade.available_animal_slots} animals | 📦 ${upgrade.storage_limit} storage`,
                inline: true
            });
        });
    } else {
        embed = new EmbedBuilder().setTitle("Market").setColor(COLORS.PRIMARY);
    }

    return { embeds: [embed], components };
}