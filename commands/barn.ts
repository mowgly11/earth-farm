import { CommandInteraction, SlashCommandBuilder, MessageFlags, AttachmentBuilder, ButtonBuilder, ActionRowBuilder, EmbedBuilder } from "discord.js";
import database from "../database/methods.ts";
import { userProfileCache } from "../index.ts";
import { join } from "path";
import fs from "fs";
import Canvas, { type Image } from "canvas";
import getImage from "../utils/image_loading.ts";
import { BUTTONS } from "../utils/buttons.ts";
import { COLORS } from "../utils/constants.ts";

let productsDir = join(__dirname, '../assets', 'products');
let productsFiles = fs.readdirSync(productsDir);
let imagesObj: Record<string, Image> = {};
let imagesLoaded = false;
let loadingPromise: Promise<void> | null = null;

/**
 * Ensures all barn product images are loaded before proceeding
 */
async function ensureImagesLoaded(): Promise<void> {
    if (imagesLoaded) return;
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
        for (const file of productsFiles) {
            try {
                const image = await getImage(join(productsDir, file));
                imagesObj[file.replace(".png", "").replace(".jpeg", "")] = image;
            } catch (err) {
                console.error(`Failed to load barn image: ${file}`, err);
            }
        }
        imagesLoaded = true;
    })();

    return loadingPromise;
}

export const data = new SlashCommandBuilder()
    .setName("barn")
    .setDescription("View your storage and products!")
    .addUserOption(option =>
        option
            .setName("farmer")
            .setDescription("View another farmer's barn")
    )

export async function execute(interaction: CommandInteraction) {
    let user = interaction.options.get("farmer")?.user;
    if (user?.bot) return await interaction.reply({ content: "You can't view a bot's barn!", flags: MessageFlags.Ephemeral });
    if (!user) user = interaction.user;

    const isSelf = user.id === interaction.user.id;

    await interaction.deferReply();

    // Ensure all images are loaded before proceeding
    await ensureImagesLoaded();

  
    let userProfile: any = userProfileCache.get(user.id);

      if (!userProfile) {
        userProfile = await database.findUser(user.id);
        if (!userProfile) {
            const embed = new EmbedBuilder()
                .setTitle("❌ Barn Not Found")
                .setColor(COLORS.ERROR)
                .setDescription(isSelf ? "You need to create a profile first!" : `**${user.username}** doesn't have a farm yet.`);

            if (isSelf) {
                const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    BUTTONS.farmer()
                );
                return await interaction.editReply({ embeds: [embed], components: [buttons] });
            }
            return await interaction.editReply({ embeds: [embed] });
        }

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

    // Add navigation buttons for self
    if (isSelf) {
        const hasProducts = userProfile.storage.products.length > 0;
        const hasAnimals = userProfile.farm.occupied_animal_slots?.length > 0;

        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            BUTTONS.harvest().setStyle(hasAnimals ? 3 : 2), // SUCCESS : SECONDARY
            BUTTONS.sell().setStyle(hasProducts ? 3 : 2),
            BUTTONS.dashboard()
        );

        return await interaction.editReply({ content: textMessage, files: [attachment], components: [buttons] });
    }

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

    if (productsCount > 15) {
        let diffWidth = 100 * 15 / productsCount + 1;
        let diffHeight = 100 * 15 / productsCount + 1;

        dimensions.imageWidth *= (diffWidth * Math.pow(10, -2));
        dimensions.imageHeight *= (diffHeight * Math.pow(10, -2));

        dimensions.additionXAxis *= (diffWidth * .9 * Math.pow(10, -2));
        dimensions.additionYAxis *= (diffHeight * 1.2 * Math.pow(10, -2));

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