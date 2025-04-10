import { CommandInteraction, SlashCommandBuilder, AttachmentBuilder, MessageFlags } from "discord.js";
import database from "../database/methods.ts";
import levels from "../config/data/levels.json";
import Canvas from 'canvas';
import { join } from "path";
import { userProfileCache } from "../index.ts";

let baseImage: any;
let bar: any;

//load the images on the program start so it doesn't get loaded everytime the command is executed
(async() => {
    baseImage = await Canvas.loadImage(join(__dirname, "../assets", "barholder.png"));
    bar = await Canvas.loadImage(join(__dirname, "../assets", "bar.png"));
})();

export const data = new SlashCommandBuilder()
    .setName("xp")
    .setDescription("show's a farmers xp")
    .addUserOption(option =>
        option
            .setName("farmer")
            .setDescription("show a farmer's xp")
    )

export async function execute(interaction: CommandInteraction) {
    let user = interaction.options.get("farmer")?.user;
    if(user?.bot) return interaction.reply({ content: "you can't interact with bots!", flags: MessageFlags.Ephemeral});
    if (!user) user = interaction.user;
    
    await interaction.deferReply();

    // Check cache first
    let userData: any = userProfileCache.get(user.id);
    
    // If not in cache, get from database and cache it
    if (!userData) {
        const dbProfile = await database.findUser(user.id);
        if (!dbProfile) return interaction.editReply({ content: `${user.username}'s xp wasn't found.` });
        
        // Cache the plain object
        userData = (dbProfile as any).toObject();
        userProfileCache.set(user.id, userData);
    }

    const xp = userData?.xp;
    const currentLevel = userData?.level;
    const requiredXp = levels.find(obj => obj.level === currentLevel)?.xp_to_upgrade!;

    let barsToAdd: number = 0;

    if(xp >= requiredXp) barsToAdd = 10;
    else barsToAdd = Math.floor((xp/requiredXp*10));

    const canvas = Canvas.createCanvas(400, 100);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = "white";

    ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
    
    ctx.fillText(`Level: ${currentLevel} - XP: ${xp}/${requiredXp}`, 20, 25);

    let barWidth = 27;
    let barHeight = 41;
    
    for(let i = 0; i < barsToAdd; i++) {
        ctx.drawImage(bar, barWidth, barHeight, 20, 30);
        barWidth += 25;
    }

    const finalAttachment = new AttachmentBuilder(canvas.toBuffer(), { name: `level_${Date.now()}.png` });

    await interaction.editReply({ files: [finalAttachment] });
}