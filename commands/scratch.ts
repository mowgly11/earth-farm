import { CommandInteraction, SlashCommandBuilder, MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder } from "discord.js";
import database from "../database/methods.js";
import { userProfileCache } from "../index.ts";
import schema from "../database/schema.ts";
import { logError } from "../utils/error_logger.ts";
import { join } from "path";

let beforeScratchImage = new AttachmentBuilder(join(__dirname, '../assets', 'cards', 'scratching_card.png'));
let afterScratchImageGold = new AttachmentBuilder(join(__dirname, '../assets', 'cards', 'scratching_card_gold.png'));
let afterScratchImageXP = new AttachmentBuilder(join(__dirname, '../assets', 'cards', 'scratching_card_xp.png'));

export const data = new SlashCommandBuilder()
    .setName("scratch")
    .setDescription("scratch a card every 8 hours to earn a reward.")

export async function execute(interaction: CommandInteraction) {
    let user = interaction.options.get("farmer")?.user;
    if (user?.bot) return interaction.reply({ content: "you can't interact with bots!", flags: MessageFlags.Ephemeral });

    let response = await interaction.deferReply({ withResponse: true });

    if (!user) user = interaction.user;

    // Check cache first
    let userProfile: any = userProfileCache.get(user.id);

    // If not in cache, get from database and cache it
    if (!userProfile) {
        const dbProfile = await database.findUser(user.id);
        if (!dbProfile) return interaction.editReply({ content: "please use `/farmer` before trying to claim your scratching card reward." });

        // Cache the plain object
        userProfile = (dbProfile as any).toObject();
        userProfileCache.set(user.id, userProfile);
    }

    let timeLeft = userProfile.scratch - Date.now();
    if (timeLeft > 0) return interaction.editReply({ content: `You still have to wait **${formatTimestamp(timeLeft)}** to claim your next scratching card reward.` });

    let rewardsList: string[] = [`gold:${Math.floor(Math.random() * (80 - 25 + 1)) + 25}`, `xp:${Math.floor(Math.random() * (15 - 3 + 1)) + 1}`];
    let reward = rewardsList[Math.floor(Math.random() * rewardsList.length)];

    let scratchBtn = new ButtonBuilder()
        .setCustomId("scratch")
        .setLabel("Scratch")
        .setStyle(ButtonStyle.Secondary)

    let row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(scratchBtn)

    await interaction.editReply({
        content: `Start scratching the card!`,
        components: [row],
        files: [beforeScratchImage],
    });

    const collector = await response.resource?.message?.awaitMessageComponent({
        filter: (i) => i.user.id === user.id,
        time: 30000, // 30 seconds
    });

    await collector?.deferUpdate();

    if (collector?.customId !== "scratch") return;

    let won = reward.split(":");

    const updatedProfile = { ...userProfile };
    updatedProfile.scratch = Date.now() + 1000 * 60 * 60 * 8; // 8h

    if(won[0] === "gold") updatedProfile.gold += parseInt(won[1]);
    else updatedProfile.xp += parseInt(won[1]);
    
    // Update cache
    userProfileCache.set(user.id, updatedProfile);

    // Hydrate the cached profile into a Mongoose document
    const dbProfile = schema.hydrate(updatedProfile);
    if (!dbProfile) {
        userProfileCache.del(user.id);
        return interaction.editReply({ content: "An error occurred while processing your request." });
    }

    try {
        dbProfile.markModified("scratch");
        dbProfile.markModified("gold");
        dbProfile.markModified("xp");
        
        await dbProfile.save();
    } catch (error) {
        logError(interaction.client, {
            path: 'scratch.ts',
            error
        })
        userProfileCache.del(user.id);
        return interaction.editReply({ content: "An error occurred while processing your request." });
    }

    row.components[0].setDisabled(true);
    row.components[0].setLabel("Woohoo!");

    await interaction?.editReply({
        content: `Scratching...`,
    });

    let image = won[0] === "gold" ? afterScratchImageGold : afterScratchImageXP;

    await interaction?.editReply({
        content: `You scratched the card and earned **${won[1]} ${won[0].toUpperCase()}**!`,
        files: [image],
        components: [row],
    });
}

function formatTimestamp(timestamp: number): string {
    const seconds = Math.floor(timestamp / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
}