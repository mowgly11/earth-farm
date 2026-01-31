import schema from "./schema.ts";
import products from "../config/items/products.json";
import levels from "../config/data/levels.json";

class DatabaseMethods {
    /**
     * Mark multiple fields as modified and save in a single database operation
     * This is more efficient than calling saveNestedObject multiple times
     */
    async saveMultipleFields(userProfile: any, ...fields: string[]): Promise<void> {
        for (const field of fields) {
            if (typeof userProfile.markModified === "function") {
                userProfile.markModified(field);
            }
        }
        await userProfile.save();
    }

    async findUser(id: string): Promise<Document | null> {
        try {
            const user: Document | null = await schema.findOne({ id });
            if (!user) return null;
            else return user;
        } catch (err) {
            console.error(err);
            return null;
        }
    }

    async getAllUsers(): Promise<Document[]> {
        try {
            return await schema.find({});
        } catch (err) {
            console.error(err);
            return [];
        }
    }

    /**
     * Get paginated leaderboard data - fetches only required users
     */
    async getLeaderboard(
        sortBy: 'xp' | 'gold',
        page: number,
        limit: number = 10
    ): Promise<{ users: any[], total: number }> {
        try {
            const sort: Record<string, 1 | -1> = sortBy === 'xp' ? { xp: -1 } : { gold: -1 };

            const [users, total] = await Promise.all([
                schema.find({})
                    .select('id username level xp gold')
                    .sort(sort)
                    .skip(page * limit)
                    .limit(limit)
                    .lean(),
                schema.countDocuments()
            ]);

            return { users, total };
        } catch (err) {
            console.error(err);
            return { users: [], total: 0 };
        }
    }

    /**
     * Get user's rank position for leaderboard
     */
    async getUserRank(userId: string, sortBy: 'xp' | 'gold'): Promise<number> {
        try {
            const user = await schema.findOne({ id: userId }).select(sortBy).lean();
            if (!user) return -1;

            const value = (user as any)[sortBy] || 0;
            const rank = await schema.countDocuments({ [sortBy]: { $gt: value } });
            return rank + 1;
        } catch (err) {
            console.error(err);
            return -1;
        }
    }

    async createUser(id: string, username: string): Promise<any> {
        try {
            // schema.create() already saves to the database
            const newUser = await schema.create({
                id,
                username
            });
            return newUser;
        } catch (err) {
            console.error('Failed to create user:', err);
            return null;
        }
    }

    async addItemToStorage(userProfile: any, item: Record<string, string | number | string[] | undefined>, quantity: number, type: "market_items" | "products") {
        let storageList = userProfile.storage[type];
        let itemIndex = storageList.findIndex((v: any) => v?.name === item.name);

        if (itemIndex !== -1) storageList[itemIndex].amount += quantity;
        else {
            item.amount = quantity;
            storageList.push(item);
        }

        await this.saveNestedObject(userProfile, "storage");
    }

    async removeItemFromstorage(userProfile: any, item: string, quantity: number, type: "products" | "market_items") {
        let storageList = userProfile.storage[type];
        let itemIndex = storageList.findIndex((v: any) => v?.name === item);

        // Bounds check to prevent crash if item not found
        if (itemIndex === -1) {
            throw new Error(`Item "${item}" not found in ${type}`);
        }

        // Check if user has enough quantity
        if (storageList[itemIndex].amount < quantity) {
            throw new Error(`Not enough "${item}" (have ${storageList[itemIndex].amount}, need ${quantity})`);
        }

        storageList[itemIndex].amount -= quantity;

        if (storageList[itemIndex].amount === 0) storageList.splice(itemIndex, 1);

        await this.saveNestedObject(userProfile, "storage");
    }

    async makePayment(userProfile: any, price: number) {
        userProfile.gold += price;
        await userProfile.save();
    }

    async plantSeed(userProfile: any, seed: string, ready_at: number, prod: string) {
        userProfile.farm.occupied_crop_slots.push({
            name: seed,
            gives: prod,
            ready_at: Date.now() + ready_at
        });
    }

    async harvestReadyPlants(userProfile: any, storageLeft: number) {
        const harvestPlantsLength = userProfile.farm.occupied_crop_slots.length;
        let harvestLoopLength = 0;

        if (harvestPlantsLength > storageLeft) harvestLoopLength = storageLeft;
        else harvestLoopLength = harvestPlantsLength;

        let ready = [];
        for (let i = harvestLoopLength - 1; i >= 0; i--) {
            if (userProfile.farm.occupied_crop_slots[i].ready_at - Date.now() > 0) continue; // meaning its not ready to harvest

            const foundPlantInstorageIndex = userProfile.storage.products.findIndex((v: any) => v?.name === userProfile.farm.occupied_crop_slots[i].gives);
            let findItemInDatabase: any = Object.assign({}, products.find(v => v?.from === userProfile.farm.occupied_crop_slots[i].name));
            findItemInDatabase.amount = 1;
            ready.push(findItemInDatabase);

            if (foundPlantInstorageIndex === -1) {
                findItemInDatabase.amount = 1;
                userProfile.storage.products.push(findItemInDatabase);
            } else userProfile.storage.products[foundPlantInstorageIndex].amount += 1;

            userProfile.farm.occupied_crop_slots.splice(i, 1);
            userProfile.xp += findItemInDatabase?.xp_gain;
        }

        // Save all changes in a single database call (was 3 calls before)
        await this.saveMultipleFields(userProfile, "farm", "storage", "xp");

        return ready;
    }

    async checkEligibleForlevelUp(userProfile: any): Promise<boolean> {
        let currentLevelObj = levels.find((v: Record<string, number | null>) => v.level === userProfile.level)!;

        if (currentLevelObj?.xp_to_upgrade && currentLevelObj?.xp_to_upgrade <= userProfile.xp) {
            userProfile.level += 1;
            await userProfile.save();
            return true;
        }

        return false;
    }

    async upgradeFarm(userProfile: any, toLevelData: Record<string, string | number>): Promise<void> {
        // Store the current occupied slots
        const occupiedCropSlots = userProfile.farm.occupied_crop_slots;
        const occupiedAnimalSlots = userProfile.farm.occupied_animal_slots;
        const upgrades = userProfile.farm.upgrades;

        // Update only the level-specific properties
        userProfile.farm.level = toLevelData.level;
        userProfile.farm.available_crop_slots = toLevelData.available_crop_slots;
        userProfile.farm.available_animal_slots = toLevelData.available_animal_slots;
        userProfile.farm.storage_limit = toLevelData.storage_limit;

        // Restore the occupied slots
        userProfile.farm.occupied_crop_slots = occupiedCropSlots;
        userProfile.farm.occupied_animal_slots = occupiedAnimalSlots;
        userProfile.farm.upgrades = upgrades;

        await userProfile.save();
    }

    async deployAnimal(userProfile: any, animal: Record<string, string | number | string[] | undefined>): Promise<void> {
        animal.ready_at = Date.now() + Number(animal.ready_time);
        // Calculate when the animal will die (lifetime from now)
        animal.dies_at = Date.now() + Number(animal.lifetime);
        delete animal.amount;
        userProfile.farm.occupied_animal_slots.push(animal);
    }

    async undeployAnimal(userProfile: any, slot: number): Promise<Record<string, any> | null> {
        if (slot < 1 || slot > userProfile.farm.occupied_animal_slots.length) {
            return null;
        }
        const [removedAnimal] = userProfile.farm.occupied_animal_slots.splice(slot - 1, 1);
        return removedAnimal || null;
    }

    async gatherReadyProducts(userProfile: any, storageLeft: number) {
        const harvestAnimalsLength = userProfile.farm.occupied_animal_slots.length;
        let harvestLoopLength = 0;

        if (harvestAnimalsLength > storageLeft) harvestLoopLength = storageLeft;
        else harvestLoopLength = harvestAnimalsLength;

        let ready = [];
        for (let i = harvestLoopLength - 1; i >= 0; i--) {
            if (userProfile.farm.occupied_animal_slots[i].ready_at - Date.now() > 0) continue; // meaning its not ready to harvest

            const foundProductInStorageIndex = userProfile.storage.products.findIndex((v: any) => v?.name === userProfile.farm.occupied_animal_slots[i].gives);
            let findItemInDatabase = products.find(v => v?.from === userProfile.farm.occupied_animal_slots[i].name);

            let itemToInsert: any = Object.assign({}, findItemInDatabase);
            itemToInsert.amount = 1;

            ready.push(itemToInsert);

            if (foundProductInStorageIndex === -1) {
                userProfile.storage.products.push(itemToInsert);
            } else userProfile.storage.products[foundProductInStorageIndex].amount += 1;

            // Reset the ready timer and boost instead of removing the animal
            userProfile.farm.occupied_animal_slots[i].ready_at = Date.now() + userProfile.farm.occupied_animal_slots[i].ready_time;
            userProfile.farm.occupied_animal_slots[i].total_boost = 0;
            userProfile.farm.occupied_animal_slots[i].boost_expires_at = 0; // Reset boost expiration
            userProfile.xp += findItemInDatabase?.xp_gain;
        }

        // Save all changes in a single database call (was 3 calls before)
        await this.saveMultipleFields(userProfile, "farm", "storage", "xp");

        return ready;
    }

    async checkAndRemoveDeadAnimals(userProfile: any) {
        let deadAnimals = [];
        for (let i = userProfile.farm.occupied_animal_slots.length - 1; i >= 0; i--) {
            // Check if animal has died (dies_at is timestamp, not duration)
            if (userProfile.farm.occupied_animal_slots[i].dies_at && userProfile.farm.occupied_animal_slots[i].dies_at <= Date.now()) {
                deadAnimals.push(userProfile.farm.occupied_animal_slots[i].name);
                await this.undeployAnimal(userProfile, i + 1);
            }
        }

        return deadAnimals;
    }

    async saveNestedObject(userProfile: any, type: string) {
        if (typeof userProfile.markModified === "function") userProfile.markModified(type);
        await userProfile.save();
    }
}

export default new DatabaseMethods();