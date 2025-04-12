export type FarmCanvasProperties = {
    barn: string;
    crops: Array<Crop>;
    animals: Array<Animal>;
}

type Crop = {
    name: string;
    ready_at: number;
}

type Animal = {
    name: string;
    ready_at: number;
}