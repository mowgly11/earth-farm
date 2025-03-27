import { CommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
    .setName("help")
    .setDescription("Shows all available commands and their usage");

export async function execute(interaction: CommandInteraction) {
    await interaction.deferReply();

    const helpEmbed = new EmbedBuilder()
        .setTitle("🌾 Earth Farm Bot Commands")
        .setColor("Yellow")
        .setDescription("Here are all the available commands to help you on your farming journey!")
        .addFields(
            {
                name: "👤 Profile Commands",
                value: "`/farmer [target]` - Create or view your farming profile\n`/daily` - Collect your daily gold reward\n`/gold [farmer]` - Check your gold balance\n`/xp [farmer]` - View your experience points and level progress",
                inline: false
            },
            {
                name: "🌱 Farming Commands",
                value: "`/farm [farmer]` - View your farm stats and slots\n`/plant [seed] [amount]` - Plant seeds in your farm\n`/harvest` - Harvest ready crops and animal products\n`/raise [animal]` - raise an animal on your farm\n`/barn [farmer]` - View your storage and inventory",
                inline: false
            },
            {
                name: "🐮 Animal Care Actions",
                value: "`/feed [slot]` - Feed an animal to boost production by 5%\n`/pet [slot]` - Pet an animal to boost production by 1%\n`/clean [slot]` - Clean an animal's area to boost production by 3%\n\n*Note: Boosts last for 2 hours and stack with each other!*",
                inline: false
            },
            {
                name: "🏪 Market Commands",
                value: "`/market` - Browse the market for items\n`/buy [item] [quantity]` - Purchase items from the market\n`/sell item [name] [quantity]` - Sell market items\n`/sell product [name] [quantity]` - Sell harvested products",
                inline: false
            },
            {
                name: "⚡ Upgrade Commands",
                value: "`/upgradefarm` - Upgrade your farm to get more slots and storage",
                inline: false
            }
        )
        .setFooter({ text: "Tip: Use / before any command to see its detailed options" })
        .setImage("https://i.imgur.com/NiXXCZf.png");

    await interaction.editReply({ embeds: [helpEmbed] });
}