import { CommandInteraction, SlashCommandBuilder, MessageFlags } from "discord.js";
import products from "../config/items/products.json";
import database from "../database/methods.ts";

let choices: Array<ChoicesArray> = [];
products.map(option => {
  choices.push({
    name: option.name,
    value: option.name
  });
});

export const data = new SlashCommandBuilder()
  .setName("sell_product")
  .setDescription("sell a product from your storage")
  .addStringOption(option =>
    option
      .setName("product")
      .setDescription("the name of the product you're trying to sell")
      .setRequired(true)
      .addChoices(...choices)
  )
  .addNumberOption(option =>
    option
      .setName("quantity")
      .setDescription("how much quantity do you want to sell?")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(100)
  )

export async function execute(interaction: CommandInteraction) {
  await interaction.deferReply();
  const item: string = String(interaction.options.get("product")?.value)?.trim();
  let quantity: any = interaction.options.get("quantity")?.value;
  quantity = parseInt(quantity);

  const userId = interaction.user.id;

  const userProfile: any = await database.findUser(userId);
  if (!userProfile) return interaction.editReply({ content: "Please make a profile using `/farmer` before trying to sell anything from the market." })

  if (!userProfile.storage.products.find((v: Record<string, string | number>) => v?.name === item && v?.amount >= quantity)
  ) return interaction.editReply({ content: `you can't sell ${item}. you either don't own it or don't own ${quantity} of it.` });

  const findItemInDatabase = products.find(v => v.name === item)!;

  const sellingPrice: number = Number(findItemInDatabase?.sell_price!) * quantity;

  await database.removeItemFromstorage(userProfile, findItemInDatabase?.name, quantity, "products");
  await database.makePayment(userProfile, sellingPrice);

  return interaction.editReply({ content: `Successfully sold ${quantity} of ${item} for a total price of ${sellingPrice}.` });
}

type ChoicesArray = {
  name: string;
  value: string;
}