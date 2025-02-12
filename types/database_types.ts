export type InventoryItem = {
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
    ready_in: number,
    product: string
}

export type Farm = {
    level: number;
    crop_slots: number;
    animal_slots: number;
};

export type Inventory = {
    seeds: Array<InventoryItem>,
    crops: Array<InventoryItem>,
    animals: Array<InventoryItem>,
    animal_products: Array<InventoryItem>,
};

export type User = {
    readonly id: string;
    username: string;
    farm: Farm;
    inventory: Inventory;
}

export type Upgrades = "Fertilizer" | "Tractor" | "Greenhouse" | "Sprinkler System";