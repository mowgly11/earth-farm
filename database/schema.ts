import mongoose, { Schema } from "mongoose";
import type { InventoryItem, Upgrades, OccupiedCropSlot, OccupiedAnimalSlot } from "../types/database_types";
import farms from "../config/upgrades/farms.json";

const schema: Schema = new Schema({
    id: String,
    username: String,
    blacklisted: { type: Boolean, default: false },
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    gold: { type: Number, default: 1000 },
    farm: {
        level: { type: Number, default: 1 },
        available_crop_slots: { type: Number, default: farms[0].crop_slots },
        available_animal_slots:  { type: Number, default: farms[0].animal_slots },
        occupied_crop_slots: Array<OccupiedCropSlot>,
        occupied_animal_slots: Array<OccupiedAnimalSlot>,
        upgrades: Array<Upgrades>
    },
    inventory: {
        market_items: Array<InventoryItem>,
        products: Array<InventoryItem>
    }
}, { versionKey: false });

export default mongoose.model("farm-data", schema);