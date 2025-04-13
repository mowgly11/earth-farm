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
                value: "`/farmer` - Create or view your profile\n`/leaderboard` - View the leaderboard\n`/gold` - Check gold balance\n`/xp` - View experience progress\n`/daily` - Collect daily rewards\n`/scratch` - Scratch a card every 8 hours to gain gold or xp\n`/barn` - View your storage",
                inline: false
            },
            {
                name: "🌱 Farming Commands", 
                value: "`/farm` - View your farm\n`/plant` - Plant seeds\n`/harvest` - Harvest crops\n`/upgradefarm` - Upgrade your farm\n`/buy` - Buy items from the market\n`/sell` - Sell items to the market\n`/trade` - Trade with other players",
                inline: false
            },
            {
                name: "🐮 Animal Care Actions",
                value: "`/feed [slot]` - Boosts production by 5%\n`/pet [slot]` - Boosts production by 1%\n`/clean [slot]` - Boosts production by 3%\n`/raise` - Deploy an animal\n`/unraise` - Remove an animal\n*Boosts last for 2 hours and can stack*",
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