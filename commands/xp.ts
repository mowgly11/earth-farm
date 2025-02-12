import { CommandInteraction, SlashCommandBuilder, AttachmentBuilder, MessageFlags } from "discord.js";
import database from "../database/methods.ts";
import levels from "../config/data/levels.json";
import Canvas from 'canvas';
import { join } from "path";

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
    await interaction.deferReply();

    let user = interaction.options.get("farmer")?.user;
    if (!user) user = interaction.user;

    let userData: any = await database.findUser(user.id);
    if(!userData) return interaction.editReply({ content: `${user.username}'s xp wasn't found.` });

    const xp = userData?.xp;
    const currentLevel = userData?.level;
    const requiredXp = levels.find(obj => obj.level === currentLevel)?.xp_to_upgrade!;

    const barsToAdd = Math.floor((xp/requiredXp*10)); // dividing the current xp on the required xp. gives a float value, we round it down to give us the amount of bars needed

    const canvas = Canvas.createCanvas(400, 100);
    const ctx = canvas.getContext('2d');

    ctx.font = "14px sans-serif";
    ctx.fillStyle = "white";

    ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
    
    ctx.fillText(`Level: ${currentLevel} - XP: ${xp}/${requiredXp}`, 20, 25);

    let barWidth = 27;
    let barHeight = 41;
    
    for(let i = 0; i < barsToAdd; i++) {
        ctx.drawImage(bar, barWidth, barHeight, 20, 30);
        barWidth += 25;
    }

    const finalAttachment = new AttachmentBuilder(canvas.toBuffer(), { name: "level.png" });

    await interaction.editReply({ files: [finalAttachment] });
}