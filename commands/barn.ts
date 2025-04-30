import { CommandInteraction, SlashCommandBuilder, MessageFlags, AttachmentBuilder } from "discord.js";
import database from "../database/methods.ts";
import { userProfileCache } from "../index.ts";
import { join } from "path";
import fs from "fs";
import Canvas, { type Image } from "canvas";
import getImage from "../utils/image_loading.ts";

let productsDir = join(__dirname, '../assets', 'products');
let productsFiles = fs.readdirSync(productsDir);
let imagesObj: Record<string, Image> = {};

productsFiles.forEach(async (file) => {
    const image = await getImage(join(productsDir, file));
    imagesObj[file.replace(".png", "").replace(".jpeg", "")] = image;
});

export const data = new SlashCommandBuilder()
    .setName("barn")
    .setDescription("show's your/others barn")
    .addUserOption(option =>
        option
            .setName("farmer")
            .setDescription("the farmer you want to view their barn")
    )

export async function execute(interaction: CommandInteraction) {
    let user = interaction.options.get("farmer")?.user;
    if (user?.bot) return await interaction.reply({ content: "you can't interact with bots!", flags: MessageFlags.Ephemeral });
    if (!user) user = interaction.user;

    await interaction.deferReply();

    // Check cache first

    let userProfile: any = userProfileCache.get(user.id);

    // If not in cache, get from database and cache it
    if (!userProfile) {
        userProfile = await database.findUser(user.id);
        if (!userProfile) return await interaction.editReply({ content: "user's barn wasn't found." });

        // Convert Mongoose document to plain object before caching
        const plainProfile = userProfile.toObject();
        userProfileCache.set(user.id, plainProfile);
        userProfile = plainProfile;
    }

    const canvas = Canvas.createCanvas(300, 300);
    const ctx = canvas.getContext("2d");

    ctx.drawImage(imagesObj['barn_interior_base'], 0, 0, canvas.width, canvas.height);

    let dimensions = getDimensions(userProfile.storage.products.length);

    let lastDrawnCropXandY = [dimensions.startXAxis, dimensions.startYAxis]; // X - Y

    if (userProfile.storage.products.length > 0) {
        for (let i = 0; i < userProfile.storage.products.length; i++) {
            const product = userProfile.storage.products[i];
            const productImage = imagesObj[`${product.name.split(" ").join("").toLowerCase()}_bag`];

            if (i > 0 && i % dimensions.prodsPerShelf === 0) {
                lastDrawnCropXandY[0] = dimensions.startXAxis;
                lastDrawnCropXandY[1] += dimensions.additionYAxis;
            }

            ctx.drawImage(productImage, lastDrawnCropXandY[0], lastDrawnCropXandY[1], dimensions.imageWidth, dimensions.imageHeight);
            lastDrawnCropXandY[0] += dimensions.additionXAxis;
        }
    }

    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: "barn.png" });

    let storageCount = 0;
    userProfile.storage.market_items.forEach((v: any) => storageCount += v.amount);
    userProfile.storage.products.forEach((v: any) => storageCount += v.amount);

    // Assume these are already defined:
    const storage = formatstorage(userProfile.storage); // returns an array of { name, value } or similar
    const formattedStorage = storage.map(item => `• **${item.name}**:\n${item.value}`).join('\n');

    const textMessage = `
🏭 **${user.username}'s Barn**

🟡 **Storage:** **${storageCount}/${userProfile.farm.storage_limit}** slots used

${formattedStorage}

Here is a picture of your barn:
`;

    return await interaction.editReply({ content: textMessage, files: [attachment] });
}

function getDimensions(productsCount: number): Dimensions {
    let dimensions: Dimensions = {
        imageWidth: 27,
        imageHeight: 30,
        startXAxis: 55,
        startYAxis: 105,
        additionXAxis: 40,
        additionYAxis: 40,
        prodsPerShelf: 5
    };

    if(productsCount > 15) {
        let diffWidth = 100 * 15 / productsCount + 1;
        let diffHeight = 100 * 15 / productsCount + 1;
        
        dimensions.imageWidth *= (diffWidth * Math.pow(10,-2));
        dimensions.imageHeight *= (diffHeight * Math.pow(10,-2));

        dimensions.additionXAxis *= (diffWidth * .9 * Math.pow(10,-2));
        dimensions.additionYAxis *= (diffHeight * 1.2 * Math.pow(10,-2));

        dimensions.prodsPerShelf = Math.ceil(productsCount / 3);
    }

    return dimensions;
}

function formatstorage(fields: Record<string, Array<Record<string, string | number>>>): Array<UserInfoFields> {
    let finalArray: Array<UserInfoFields> = [];

    const keys = Object.keys(fields);
    let currentFieldString = "";
    for (let i = 0; i < keys.length; i++) {
        currentFieldString = fields[keys[i]].map(v => `${v.amount} ${v.name}`).join("\n");
        finalArray.push({
            name: keys[i].replace(/_/g, " "),
            value: currentFieldString === "" ? "No items here yet." : currentFieldString,
        });
        currentFieldString = "";
    }

    return finalArray;
}

type UserInfoFields = {
    name: string;
    value: string;
    inline?: boolean;
}


type Dimensions = {
    imageWidth: number,
    imageHeight: number,
    startXAxis: number,
    startYAxis: number,
    additionXAxis: number,
    additionYAxis: number,
    prodsPerShelf: number
}