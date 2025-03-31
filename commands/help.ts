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
                value: "`/farmer` - Create or view your profile\n`/inventory` - View your inventory\n`/stats` - View your stats\n`/leaderboard` - View the leaderboard",
                inline: false
            },
            {
                name: "🌱 Farming Commands",
                value: "`/farm` - View your farm\n`/plant` - Plant seeds\n`/harvest` - Harvest crops\n`/upgradefarm` - Upgrade your farm\n`/buy` - Buy items from the market\n`/sell` - Sell items to the market\n`/trade` - Trade with other players",
                inline: false
            },
            {
                name: "🐮 Animal Care Actions",
                value: "`/feed [slot]` - Boosts production by 5%\n`/pet [slot]` - Boosts production by 1%\n`/clean [slot]` - Boosts production by 3%\n*Boosts last for 2 hours and can stack*",
                inline: false
            },
            {
                name: "🛠️ Common Commands",
                value: "`/avatar [user]` - Display a user's avatar\n`/ping` - Check bot latency",
                inline: false
            },
            {
                name: "📊 Market Commands",
                value: "`/market` - View the market\n`/buy` - Buy items from the market\n`/sell` - Sell items to the market\n`/trade` - Trade with other players",
                inline: false
            },
            {
                name: "❓ Help",
                value: "`/help` - Show this help message",
                inline: false
            }
        )
        .setFooter({ text: "Tip: Use / before any command to see its detailed options" })
        .setImage("https://i.imgur.com/NiXXCZf.png");

    await interaction.editReply({ embeds: [helpEmbed] });
}