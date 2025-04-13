import mongoose, { Schema } from "mongoose";
import type { storageItem, Upgrades, OccupiedCropSlot, OccupiedAnimalSlot } from "../types/database_types";
import farms from "../config/upgrades/farms.json";
import configuration from "../config/configuration.json";

const schema: Schema = new Schema({
    id: String,
    username: String,
    blacklisted: { type: Boolean, default: false },
    level: { type: Number, default: configuration.starter_level },
    xp: { type: Number, default: configuration.starter_xp },
    gold: { type: Number, default: configuration.starter_money },
    daily: { type: Number, default: 0 },
    scratch: { type: Number, default: 0 },
    actions: {
        lastFed: { type: Number, default: 0 },
        lastPet: { type: Number, default: 0 },
        lastCleaned: { type: Number, default: 0 }
    },
    farm: {
        level: { type: Number, default: configuration.starter_farm_level },
        available_crop_slots: { type: Number, default: farms[0].available_crop_slots },
        available_animal_slots: { type: Number, default: farms[0].available_animal_slots },
        storage_limit: { type: Number, default: farms[0].storage_limit },
        occupied_crop_slots: Array<OccupiedCropSlot>,
        occupied_animal_slots: Array<OccupiedAnimalSlot>,
        upgrades: Array<Upgrades>
    },
    storage: {
        market_items: Array<storageItem>,
        products: Array<storageItem>
    }
}, { versionKey: false });

export default mongoose.model("farm-data", schema);