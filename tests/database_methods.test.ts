/**
 * Tests for database method logic that needs no MongoDB connection
 * Run with: bun test (needs node_modules: bun install)
 */
import { describe, expect, test } from "bun:test";
import database from "../database/methods.ts";

// Minimal stand-in for a hydrated profile: only what addItemToStorage touches
const fakeProfile = (marketItems: any[]) => ({
    storage: { market_items: marketItems, products: [] as any[] },
    save: async () => {}
});

describe("addItemToStorage", () => {
    test("copies the item instead of pushing the caller's object (trade passes the other player's storage entry)", async () => {
        const targetEntry = { name: "Wheat", amount: 40 };
        const target = fakeProfile([targetEntry]);
        const initiator = fakeProfile([]);

        await database.addItemToStorage(initiator, targetEntry, 10, "market_items");

        expect(initiator.storage.market_items[0]).toEqual({ name: "Wheat", amount: 10 });
        expect(initiator.storage.market_items[0]).not.toBe(targetEntry);
        expect(target.storage.market_items[0].amount).toBe(40);
    });

    test("adds to an existing stack", async () => {
        const profile = fakeProfile([{ name: "Corn", amount: 3 }]);
        await database.addItemToStorage(profile, { name: "Corn" }, 2, "market_items");
        expect(profile.storage.market_items).toEqual([{ name: "Corn", amount: 5 }]);
    });
});
