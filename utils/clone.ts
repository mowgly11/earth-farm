/**
 * Deep clone utility for Mongoose-compatible objects
 * Uses JSON parse/stringify which handles Mongoose object properties better than structuredClone
 */

/**
 * Deep clone an object safely
 * @param obj - Object to clone
 * @returns Deep cloned object
 */
export function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}
