import schema from "./schema.ts";
import products from "../config/items/products.json";
import levels from "../config/data/levels.json";

class DatabaseMethods {
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

    async createUser(id: string, username: string): Promise<any> {
        try {
            const createUser = await schema.create({
                id,
                username
            });

            await createUser.save();

            return createUser;
        } catch (err) {
            return null;
        }
    }

    async addItemToInventory(userProfile: any, item: string, quantity: number, type: string) {
        let inventoryList = userProfile.inventory.market_items;
        let itemIndex = inventoryList.findIndex((v: any) => v?.name === item);

        if (itemIndex !== -1) inventoryList[itemIndex].amount += quantity;

        else inventoryList.push({ name: item, amount: quantity, type });

        if (typeof userProfile.markModified === "function") userProfile.markModified("inventory");

        await userProfile.save();
    }

    async removeItemFromInventory(userProfile: any, item: string, quantity: number) {
        let inventoryList = userProfile.inventory.market_items;
        let itemIndex = inventoryList.findIndex((v: any) => v?.name === item);

        inventoryList[itemIndex].amount -= quantity;

        if (inventoryList[itemIndex].amount === 0) inventoryList.splice(itemIndex, 1);

        if (typeof userProfile.markModified === "function") userProfile.markModified("inventory");

        await userProfile.save();
    }

    async makePayment(userProfile: any, price: number) {
        userProfile.gold += price;

        await userProfile.save();
    }

    async plantSeed(userProfile: any, seed: string, ready_at: number) {
        userProfile.farm.occupied_crop_slots.push({
            name: seed,
            ready_at: Date.now() + ready_at
        });
    }

    async harvestReadyPlants(userProfile: any) {
        const harvestPlantsLength = userProfile.farm.occupied_crop_slots.length;
        let ready = [];
        for (let i = harvestPlantsLength - 1; i >= 0; i--) {
            if (userProfile.farm.occupied_crop_slots[i].ready_at - Date.now() > 0) continue; // meaning its not ready to harvest

            const foundPlantInInventoryIndex = userProfile.inventory.products.findIndex((v: any) => v?.from === userProfile.farm.occupied_crop_slots[i].name);
            let findItemInDatabase = products.find(v => v?.from === userProfile.farm.occupied_crop_slots[i].name);

            ready.push({
                name: findItemInDatabase?.name,
                amount: 1,
                type: "product"
            });

            if (foundPlantInInventoryIndex === -1) userProfile.inventory.products.push({
                name: findItemInDatabase?.name,
                amount: 1,
                type: "product"
            });

            else userProfile.inventory.products[foundPlantInInventoryIndex].amount += 1;

            userProfile.farm.occupied_crop_slots.splice(i, 1);
            userProfile.xp += findItemInDatabase?.xp_gain;
        }

        if (typeof userProfile.markModified === "function") {
            userProfile.markModified("farm");
            userProfile.markModified("inventory");
        }

        await userProfile.save();

        return ready;
    }

    async checkEligibleForlevelUp(userProfile: any): Promise<boolean> {
        let currentLevelObj = levels.find((v: Record<string, number>) => v.level === userProfile.level)!;

        if (currentLevelObj?.xp_to_upgrade <= userProfile.xp) {
            userProfile.level += 1;
            await userProfile.save();
            return true;
        }

        return false;
    }
}

export default new DatabaseMethods();