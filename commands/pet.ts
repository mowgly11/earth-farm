import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import database from "../database/methods.ts";
import actions from "../config/data/actions.json";

export const data = new SlashCommandBuilder()
    .setName("pet")
    .setDescription(actions.actions.petting.description)
    .addIntegerOption(option => 
        option.setName("slot")
        .setDescription("The animal slot number to pet")
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

    // Check if user has any animals
    if (!userProfile.farm.occupied_animal_slots.length) {
        return interaction.editReply({ content: "You don't have any animals to pet!" });
    }

    // Check if slot exists
    if (slotNumber > userProfile.farm.occupied_animal_slots.length) {
        return interaction.editReply({ content: `Slot ${slotNumber} doesn't exist! You only have ${userProfile.farm.occupied_animal_slots.length} animal slots occupied.` });
    }

    // Check cooldown
    const now = Date.now();
    const lastPet = userProfile.actions?.lastPet || 0;
    const cooldown = actions.actions.petting.cooldown;

    if (lastPet + cooldown > now) {
        const timeLeft = Math.ceil((lastPet + cooldown - now) / 1000 / 60);
        return interaction.editReply({ content: `You need to wait ${timeLeft} minutes before petting again!` });
    }

    // Apply boost to specific animal
    const boost = actions.actions.petting.boost;
    const animalSlot = userProfile.farm.occupied_animal_slots[slotNumber - 1];
    const timeLeft = animalSlot.ready_at - now;
    
    if (timeLeft <= 0) {
        return interaction.editReply({ content: `The animal in slot ${slotNumber} is ready to harvest! No need to pet it.` });
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

    // Update cooldown
    if (!userProfile.actions) userProfile.actions = {};
    userProfile.actions.lastPet = now;

    await database.saveNestedObject(userProfile, "farm");
    await database.saveNestedObject(userProfile, "actions");

    return interaction.editReply({ content: `Successfully pet animal in slot ${slotNumber}! Production speed increased by ${boost}% (Total boost: ${animalSlot.total_boost}%)` });
}
