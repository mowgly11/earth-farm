/**
 * Storage utility functions for Earth Farm bot
 */

interface StorageItem {
    name: string;
    amount: number;
}

interface Storage {
    market_items: StorageItem[];
    products: StorageItem[];
}

/**
 * Calculate total items in storage
 * @param storage - User's storage object
 * @returns Total count of all items
 */
export function getStorageCount(storage: Storage): number {
    const marketItemsCount = storage.market_items.reduce(
        (sum, item) => sum + (item.amount || 0), 
        0
    );
    const productsCount = storage.products.reduce(
        (sum, item) => sum + (item.amount || 0), 
        0
    );
    return marketItemsCount + productsCount;
}

/**
 * Check if storage has capacity for more items
 * @param storage - User's storage object
 * @param limit - Storage limit from farm level
 * @param additionalItems - Number of items to add (default 1)
 * @returns True if there's room
 */
export function hasStorageCapacity(
    storage: Storage, 
    limit: number, 
    additionalItems: number = 1
): boolean {
    return getStorageCount(storage) + additionalItems <= limit;
}

/**
 * Find item in storage by name
 * @param storage - User's storage object
 * @param itemName - Name of item to find
 * @param type - Storage type to search
 * @returns Item and its index, or null if not found
 */
export function findInStorage(
    storage: Storage,
    itemName: string,
    type: "market_items" | "products"
): { item: StorageItem; index: number } | null {
    const list = storage[type];
    const index = list.findIndex(v => v?.name === itemName);
    
    if (index === -1) return null;
    return { item: list[index], index };
}
