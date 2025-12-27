/**
 * ProfileService - Centralized profile fetching and caching
 * 
 * Eliminates 30+ duplicated code blocks across the codebase.
 * Single source of truth for profile operations.
 */

import NodeCache from "node-cache";
import database from "../database/methods.ts";
import schema from "../database/schema.ts";
import type { UserProfile, UserProfileDocument } from "../types/database_types.ts";

// Cache with 5-minute TTL
const profileCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

export interface ProfileResult {
    profile: UserProfile;
    dbProfile: UserProfileDocument;
}

/**
 * Get user profile from cache or database
 * 
 * @param userId - Discord user ID
 * @returns Profile and DB document, or null if not found
 * 
 * @example
 * const result = await getProfile(userId);
 * if (!result) {
 *   // Handle no profile - show onboarding
 *   return;
 * }
 * const { profile, dbProfile } = result;
 */
export async function getProfile(userId: string): Promise<ProfileResult | null> {
    // Check cache first
    let profile = profileCache.get<UserProfile>(userId);

    if (!profile) {
        // Not in cache, fetch from database
        const dbProfile = await database.findUser(userId);
        if (!dbProfile) return null;

        profile = (dbProfile as any).toObject() as UserProfile;
        profileCache.set(userId, profile);
    }

    // Hydrate into Mongoose document for database operations
    const dbProfile = schema.hydrate(profile as any) as unknown as UserProfileDocument;

    return { profile, dbProfile };
}

/**
 * Update profile in cache after database changes
 * 
 * @param userId - Discord user ID
 * @param dbProfile - Updated Mongoose document
 */
export function updateCache(userId: string, dbProfile: UserProfileDocument): void {
    const updatedProfile = (dbProfile as any).toObject() as UserProfile;
    profileCache.set(userId, updatedProfile);
}

/**
 * Invalidate profile cache entry
 * 
 * @param userId - Discord user ID
 */
export function invalidateCache(userId: string): void {
    profileCache.del(userId);
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
    return profileCache.getStats();
}

// Export the cache for direct access if needed (e.g., setting custom TTL)
export { profileCache };
