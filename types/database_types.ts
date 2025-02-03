export type Seed = {
    name: string;
    level: number;
    buy_price: number;
    sell_price: number;
}

export type Crop = {
    name: string;
    level: number;
    sell_price: number;
}

export type Animal = Seed;

export type AnimalItems = Crop & { from: string; };