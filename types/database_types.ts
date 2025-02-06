export type Seed = {
    name: string;
    level: number;
    buy_price: number;
    sell_price: number;
    amount: number;
};

export type Crop = {
    name: string;
    level: number;
    sell_price: number;
    amount: number;
};

export type Animal = Seed;

export type AnimalProduct = Crop & { from: string; };

export type Farm = {
    level: number;
    crop_slots: number;
    animal_slots: number;
};

export type Inventory = {
    seeds: Array<Seed>,
    crops: Array<Crop>,
    animals: Array<Animal>,
    animal_products: Array<AnimalProduct>,
    upgrades: Array<Upgrades>
};

export type User = {
    readonly id: string;
    username: string;
    farm: Farm;
    inventory: Inventory;
}

export type Upgrades = "Fertilizer" | "Tractor" | "Greenhouse" | "Sprinkler System";