import mongoose, { Schema } from "mongoose";
import type { Animal, AnimalProduct, Crop, Seed, Upgrades } from "../types/database_types";

const schema: Schema = new Schema({
    id: String,
    username: String,
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    coins: { type: Number, default: 0 },
    farm: {
        level: {
            type: Number,
            default: 1
        },
        crop_slots: {
            type: Number,
            default: 4
        },
        animal_slots: {
            type: Number,
            default: 2
        },
    },
    inventory: {
        seeds: Array<Seed>,
        crops: Array<Crop>,
        animals: Array<Animal>,
        animal_products: Array<AnimalProduct>,
        upgrades: Array<Upgrades>
    }
});

export default mongoose.model("farm-data", schema);