export type storageItem = {
    name: string;
    amount: number;
    type: string;
}

export type OccupiedCropSlot = {
    seed: string,
    started: boolean,
    ready_in: number,
    product: string
}

export type OccupiedAnimalSlot = {
    animal: string,
    started: boolean,
    ready_at: number,
    ready_time: number,
    gives: string,
    total_boost: number,
    boost_expires_at: number,
    lifetime: number,
}

export type Farm = {
    level: number;
    crop_slots: number;
    animal_slots: number;
    storage_limit: number;
};

export type storage = {
    seeds: Array<storageItem>,
    crops: Array<storageItem>,
    animals: Array<storageItem>,
    animal_products: Array<storageItem>,
};

export type User = {
    readonly id: string;
    username: string;
    farm: Farm;
    storage: storage;
}

export type Upgrades = "Fertilizer" | "Tractor" | "Greenhouse" | "Sprinkler System";

export interface Actions {
    lastFed: number;
    lastPet: number;
    lastCleaned: number;
}