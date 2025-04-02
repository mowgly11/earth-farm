import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import database from "../database/methods.ts";
import actions from "../config/data/actions.json";
import { userProfileCache } from "../index.ts";
import schema from "../database/schema.ts";

export const data = new SlashCommandBuilder()
    .setName("feed")
    .setDescription(actions.actions.feeding.description)
    .addIntegerOption(option => 
        option.setName("slot")
        .setDescription("The animal slot number to feed")
        .setRequired(true)
        .setMinValue(1));

export async function execute(interaction: CommandInteraction) {
    await interaction.deferReply();
    
    const userId = interaction.user.id;
    
    // Check cache first
    let userProfile: any = userProfileCache.get(userId);
    
    // If not in cache, get from database and cache it
    if (!userProfile) {
        const dbProfile = await database.findUser(userId);
        if (!dbProfile) return interaction.editReply({ content: "Please create a profile first using `/farmer`!" });
        
        // Cache the plain object
        userProfile = (dbProfile as any).toObject();
        userProfileCache.set(userId, userProfile);
    }

    const slotNumber = interaction.options.get("slot")?.value as number;
    
    if (!userProfile.farm.occupied_animal_slots.length) {
        return interaction.editReply({ content: "You don't have any animals to feed!" });
    }

    if (slotNumber > userProfile.farm.occupied_animal_slots.length) {
        return interaction.editReply({ content: `Slot ${slotNumber} doesn't exist! You only have ${userProfile.farm.occupied_animal_slots.length} animal slots occupied.` });
    }

    const now = Date.now();
    const lastFed = userProfile.actions?.lastFed || 0;
    const cooldown = actions.actions.feeding.cooldown;

    if (lastFed + cooldown > now) {
        const timeLeft = Math.ceil((lastFed + cooldown - now) / 1000 / 60);
        return interaction.editReply({ content: `You need to wait ${timeLeft} minutes before feeding again!` });
    }

    // Update cache immediately
    const updatedProfile = { ...userProfile };
    
    // Apply boost to specific animal
    const boost = actions.actions.feeding.boost;
    const animalSlot = updatedProfile.farm.occupied_animal_slots[slotNumber - 1];
    const timeLeft = animalSlot.ready_at - now;
    
    if (timeLeft <= 0) {
        return interaction.editReply({ content: `The animal in slot ${slotNumber} is ready to harvest! No need to feed it.` });
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
    if (!updatedProfile.actions) updatedProfile.actions = {};
    updatedProfile.actions.lastFed = now;
    
    // Update cache
    userProfileCache.set(userId, updatedProfile);

    // Hydrate the cached profile into a Mongoose document
    const dbProfile = schema.hydrate(updatedProfile);
    if (!dbProfile) {
        userProfileCache.del(userId);
        return interaction.editReply({ content: "An error occurred while processing your request." });
    }

    try {
        await database.saveNestedObject(dbProfile, "farm");
        await database.saveNestedObject(dbProfile, "actions");
    } catch (error) {
        console.error('Error updating database:', error);
        userProfileCache.del(userId);
        return interaction.editReply({ content: "An error occurred while processing your request." });
    }

    return interaction.editReply({ content: `Successfully fed animal in slot ${slotNumber}! Production speed increased by ${boost}% (Total boost: ${animalSlot.total_boost}%)` });
}
