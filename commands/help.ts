import { CommandInteraction, SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType, ButtonInteraction, MessageFlags } from "discord.js";
import actions from "../config/data/actions.json";
import { COLORS } from "../utils/constants.ts";
import { parseButtonId, isButtonOwner, BTN_STYLE } from "../utils/button_handler.ts";
import { HELP_BUTTONS, BUTTONS } from "../utils/buttons.ts";
import { getRandomTip } from "../utils/ux.ts";

export const data = new SlashCommandBuilder()
    .setName("help")
    .setDescription("Shows all available commands with interactive navigation!");

// Help categories
const categories = {
    overview: {
        title: "🌾 Earth Farm Help",
        emoji: "🏠",
        description: "Welcome to Earth Farm! Select a category below to learn more about the available commands.",
        fields: [
            { name: "💰 Economy", value: "Daily rewards, scratch cards, buying & selling", inline: true },
            { name: "🌱 Farming", value: "Plant seeds, harvest crops, upgrade farm", inline: true },
            { name: "🐔 Animals", value: "Raise animals, feed, pet, clean", inline: true },
            { name: "📊 Stats", value: "Leaderboards, profiles, balances", inline: true },
            { name: "⚙️ Other", value: "Utility commands and more", inline: true }
        ]
    },
    economy: {
        title: "💰 Economy Commands",
        emoji: "💰",
        description: "Earn gold and manage your finances!",
        fields: [
            { name: "`/daily`", value: "Claim your daily gold reward (24h cooldown)", inline: false },
            { name: "`/scratch`", value: "Play scratch card for gold or XP (8h cooldown)", inline: false },
            { name: "`/buy <item> [amount]`", value: "Purchase seeds or animals from the market", inline: false },
            { name: "`/sell <item> [amount]`", value: "Sell your products for gold", inline: false },
            { name: "`/trade @user`", value: "Trade items with another player", inline: false }
        ]
    },
    farming: {
        title: "🌱 Farming Commands",
        emoji: "🌱",
        description: "Grow crops and manage your farm!",
        fields: [
            { name: "`/farm`", value: "View your farm with planted crops", inline: false },
            { name: "`/plant <seed>`", value: "Plant seeds in available slots", inline: false },
            { name: "`/harvest`", value: "Harvest ready crops and animal products", inline: false },
            { name: "`/upgradefarm`", value: "Upgrade your farm for more slots & storage", inline: false },
            { name: "`/market`", value: "Browse available seeds and animals", inline: false }
        ]
    },
    animals: {
        title: "🐔 Animal Commands",
        emoji: "🐔",
        description: "Raise animals and boost their production!",
        fields: [
            { name: "`/barn`", value: "View your barn with raised animals", inline: false },
            { name: "`/raise <animal>`", value: "Deploy an animal to start producing", inline: false },
            { name: "`/unraise <slot>`", value: "Return an animal to storage", inline: false },
            { name: "`/feed <slot>`", value: `Feed an animal (+${actions.actions.feeding.boost}% boost)`, inline: false },
            { name: "`/pet <slot>`", value: `Pet an animal (+${actions.actions.petting.boost}% boost)`, inline: false },
            { name: "`/clean <slot>`", value: `Clean an animal (+${actions.actions.cleaning.boost}% boost)`, inline: false }
        ]
    },
    stats: {
        title: "📊 Stats Commands",
        emoji: "📊",
        description: "Check your progress and compare with others!",
        fields: [
            { name: "`/farmer [@user]`", value: "View your or another player's profile", inline: false },
            { name: "`/leaderboard <type>`", value: "View XP or Gold leaderboards", inline: false },
            { name: "`/gold`", value: "Check your gold balance", inline: false },
            { name: "`/xp`", value: "View your experience progress", inline: false },
            { name: "`/dashboard`", value: "Open interactive dashboard with quick actions", inline: false }
        ]
    },
    other: {
        title: "⚙️ Other Commands",
        emoji: "⚙️",
        description: "Utility and miscellaneous commands!",
        fields: [
            { name: "`/help`", value: "Show this help menu", inline: false },
            { name: "`/avatar [@user]`", value: "Display a user's avatar", inline: false },
            { name: "`/ping`", value: "Check bot latency", inline: false }
        ]
    }
};

export async function execute(interaction: CommandInteraction) {
    await interaction.deferReply();

    const userId = interaction.user.id;

    // Show overview
    const { embed, components } = createHelpView("overview", userId);
    const response = await interaction.editReply({ embeds: [embed], components });

    // Create collector
    const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000 // 5 minutes
    });

    collector.on("collect", async (i: ButtonInteraction) => {
        // Allow nav: buttons through - they navigate away and are handled by index.ts
        if (i.customId.startsWith("nav:")) {
            // Don't block nav buttons - let them fall through to index.ts handler
            return;
        }

        // Verify ownership for help-specific buttons
        if (!isButtonOwner(i.customId, i.user.id)) {
            await i.reply({ content: "❌ This isn't your help menu! Use `/help` to open your own.", flags: MessageFlags.Ephemeral });
            return;
        }

        const { subaction: category } = parseButtonId(i.customId);

        // Update view
        const newView = createHelpView(category, userId);
        await i.update({ embeds: [newView.embed], components: newView.components });
    });

    collector.on("end", async () => {
        // Disable buttons
        const finalView = createHelpView("overview", userId);
        finalView.components.forEach(row => {
            row.components.forEach(btn => btn.setDisabled(true));
        });
        await interaction.editReply({ components: finalView.components }).catch(() => { });
    });
}

export function createHelpView(category: string, userId: string) {
    const cat = categories[category as keyof typeof categories] || categories.overview;

    const embed = new EmbedBuilder()
        .setTitle(cat.title)
        .setColor(COLORS.PRIMARY)
        .setDescription(cat.description)
        .addFields(cat.fields)
        .setFooter({ text: category === "overview" ? "Select a category to see detailed commands" : getRandomTip() })
        .setTimestamp();

    // Create category buttons
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        HELP_BUTTONS.economy(userId, category === "economy"),
        HELP_BUTTONS.farming(userId, category === "farming"),
        HELP_BUTTONS.animals(userId, category === "animals")
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        HELP_BUTTONS.stats(userId, category === "stats"),
        HELP_BUTTONS.other(userId, category === "other"),
        HELP_BUTTONS.overview(userId, category === "overview"),
        BUTTONS.dashboard()
    );

    return { embed, components: [row1, row2] };
}