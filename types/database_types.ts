import { Document } from "mongoose";

// --- Storage Types ---

export interface StorageItem {
    name: string;
    amount: number;
    type?: string;
    buy_price?: number;
    sell_price?: number;
    gives?: string;
    ready_time?: number;
    food?: string[];
    level?: number;
    lifetime?: number;
    xp_gain?: number;
    from?: string;
}

export interface Storage {
    market_items: StorageItem[];
    products: StorageItem[];
}

// --- Farm Types ---

export interface OccupiedCropSlot {
    name: string;
    gives: string;
    ready_at: number;
}

export interface OccupiedAnimalSlot {
    name: string;
    gives: string;
    ready_at: number;
    ready_time: number;
    total_boost?: number;
    boost_expires_at?: number;
    dies_at?: number;
    lifetime?: number;
    level?: number;
    buy_price?: number;
    sell_price?: number;
    food?: string[];
    type?: string;
}

export type UpgradeType = "Fertilizer" | "Tractor" | "Greenhouse" | "Sprinkler System";

export interface Farm {
    level: number;
    available_crop_slots: number;
    available_animal_slots: number;
    storage_limit: number;
    occupied_crop_slots: OccupiedCropSlot[];
    occupied_animal_slots: OccupiedAnimalSlot[];
    upgrades: UpgradeType[];
}

// --- User Actions Types ---

export interface UserActions {
    lastFed: number;
    lastPet: number;
    lastCleaned: number;
}

// --- UserProfile Interface ---

export interface UserProfile {
    id: string;
    username: string;
    blacklisted: boolean;
    level: number;
    xp: number;
    gold: number;
    daily: number;
    scratch: number;
    actions: UserActions;
    farm: Farm;
    storage: Storage;
}

/**
 * UserProfile with Mongoose Document methods
 * Use this when working with database documents
 * We omit 'id' from Document to avoid conflict with our string id
 */
export interface UserProfileDocument extends UserProfile, Omit<Document, 'id'> {
    markModified(path: string): void;
    save(): Promise<this>;
}

// --- Market Item Types ---

export interface MarketItem {
    name: string;
    type: "seeds" | "animals";
    buy_price: number;
    sell_price: number;
    gives: string;
    ready_time: number;
    food?: string[];
    level: number;
    lifetime?: number;
}

export interface Product {
    name: string;
    from: string;
    sell_price: number;
    type: "crops" | "animal_products";
    xp_gain: number;
}

// --- Farm Level Configuration ---

export interface FarmLevelConfig {
    level: number;
    price: number;
    available_crop_slots: number;
    available_animal_slots: number;
    storage_limit: number;
}

// --- Legacy Type Aliases ---

/** @deprecated Use StorageItem instead */
export type storageItem = StorageItem;

/** @deprecated Use UpgradeType instead */
export type Upgrades = UpgradeType;

/** @deprecated Use UserActions instead */
export type Actions = UserActions;