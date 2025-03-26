import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import database from "../database/methods.ts";
import actions from "../config/data/actions.json";

export const data = new SlashCommandBuilder()
    .setName("clean")
    .setDescription(actions.actions.cleaning.description)
    .addIntegerOption(option => 
        option.setName("slot")
        .setDescription("The animal slot number to clean")
        .setRequired(true)
        .setMinValue(1));

export async function execute(interaction: CommandInteraction) {
    await interaction.deferReply();
    
    const userId = interaction.user.id;
    const userProfile: any = await database.findUser(userId);
    const slotNumber = interaction.options.get("slot")?.value as number;
    
    if (!userProfile) {
        return interaction.editReply({ content: "Please create a profile first using `/farmer`!" });
    }

    if (!userProfile.farm.occupied_animal_slots.length) {
        return interaction.editReply({ content: "You don't have any animals' area to clean!" });
    }

    if (slotNumber > userProfile.farm.occupied_animal_slots.length) {
        return interaction.editReply({ content: `Slot ${slotNumber} doesn't exist! You only have ${userProfile.farm.occupied_animal_slots.length} animal slots occupied.` });
    }

    const now = Date.now();
    const lastCleaned = userProfile.actions?.lastCleaned || 0;
    const cooldown = actions.actions.cleaning.cooldown;

    if (lastCleaned + cooldown > now) {
        const timeLeft = Math.ceil((lastCleaned + cooldown - now) / 1000 / 60);
        return interaction.editReply({ content: `You need to wait ${timeLeft} minutes before cleaning again!` });
    }

    const boost = actions.actions.cleaning.boost;
    const animalSlot = userProfile.farm.occupied_animal_slots[slotNumber - 1];
    const timeLeft = animalSlot.ready_at - now;

    if (timeLeft <= 0) {
        return interaction.editReply({ content: `The animal in slot ${slotNumber} is ready to harvest! No need to clean its area.` });
    }

    // Check if previous boost has expired
    if (animalSlot.boost_expires_at && now > animalSlot.boost_expires_at) {
        animalSlot.total_boost = 0;
    }

    // Update total boost and set expiration
    if (!animalSlot.total_boost) animalSlot.total_boost = 0;
    animalSlot.total_boost += boost;
    animalSlot.boost_expires_at = now + (2 * 60 * 60 * 1000); // 2 hours from now

    // Apply boost to production time
    const originalTime = timeLeft;
    const boostDecimal = boost * Math.pow(10, -2);
    const reduction = originalTime * boostDecimal;
    animalSlot.ready_at = Math.floor(now + (originalTime - reduction));

    if (!userProfile.actions) userProfile.actions = {};
    userProfile.actions.lastCleaned = now;

    await database.saveNestedObject(userProfile, "farm");
    await database.saveNestedObject(userProfile, "actions");

    return interaction.editReply({ content: `Successfully cleaned area for animal in slot ${slotNumber}! Production speed increased by ${boost}% (Total boost: ${animalSlot.total_boost}%)` });
}
