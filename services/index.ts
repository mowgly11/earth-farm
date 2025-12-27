/**
 * Services - Centralized business logic layer
 * 
 * Import from here for clean imports:
 * import { getProfile, navigateTo } from "./services";
 */

export {
    getProfile,
    updateCache,
    invalidateCache,
    getCacheStats,
    profileCache,
    type ProfileResult
} from "./profile_service.ts";

export {
    navigateTo,
    navigateToDeferred,
    updateView,
    type ViewResponse,
    type NavContext
} from "./navigation_service.ts";
