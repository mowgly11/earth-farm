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

    async addItemTostorage(userProfile: any, item: string, quantity: number, type: string) {
        let storageList = userProfile.storage.market_items;
        let itemIndex = storageList.findIndex((v: any) => v?.name === item);

        if (itemIndex !== -1) storageList[itemIndex].amount += quantity;

        else storageList.push({ name: item, amount: quantity, type });

        if (typeof userProfile.markModified === "function") userProfile.markModified("storage");

        await userProfile.save();
    }

    async removeItemFromstorage(userProfile: any, item: string, quantity: number, type: "products" | "market_items") {
        let storageList = userProfile.storage[type];
        let itemIndex = storageList.findIndex((v: any) => v?.name === item);

        storageList[itemIndex].amount -= quantity;

        if (storageList[itemIndex].amount === 0) storageList.splice(itemIndex, 1);

        if (typeof userProfile.markModified === "function") userProfile.markModified("storage");

        await userProfile.save();
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

    async harvestReadyPlants(userProfile: any, storageLeft:number) {
        const harvestPlantsLength = userProfile.farm.occupied_crop_slots.length;
        let harvestLoopLength = 0;

        if(harvestPlantsLength > storageLeft) harvestLoopLength = storageLeft;
        else harvestLoopLength = harvestPlantsLength;

        let ready = [];
        for (let i = harvestLoopLength - 1; i >= 0; i--) {
            if (userProfile.farm.occupied_crop_slots[i].ready_at - Date.now() > 0) continue; // meaning its not ready to harvest

            const foundPlantInstorageIndex = userProfile.storage.products.findIndex((v: any) => v?.name === userProfile.farm.occupied_crop_slots[i].gives);
            let findItemInDatabase = products.find(v => v?.from === userProfile.farm.occupied_crop_slots[i].name);

            ready.push({
                name: findItemInDatabase?.name,
                amount: 1,
                type: "product"
            });

            if (foundPlantInstorageIndex === -1) {
                userProfile.storage.products.push({
                    name: findItemInDatabase?.name,
                    amount: 1,
                    type: "product"
                });
            } else userProfile.storage.products[foundPlantInstorageIndex].amount += 1;

            userProfile.farm.occupied_crop_slots.splice(i, 1);
            userProfile.xp += findItemInDatabase?.xp_gain;
        }

        if (typeof userProfile.markModified === "function") {
            userProfile.markModified("farm");
            userProfile.markModified("storage");
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

    async upgradeFarm(userProfile: any, toLevelData: Record<string, string | number>): Promise<void> {
        const keys = Object.keys(userProfile.farm);
        
        keys.forEach((key:string) => {
            userProfile.farm[key] = toLevelData[key];
        });

        await userProfile.save();
    }
}

export default new DatabaseMethods();