/**
 * Dashboard Module Barrel Export
 * Re-exports all dashboard components for easy importing
 */

// View creators
export {
    createMainView,
    createActionButtons,
    createResultView,
    createProfileView,
    createMarketView,
    createStorageView,
    createUpgradeView,
    createNavView,
    createBackRow
} from "./views.ts";

// Action executors
export {
    executeDailyAction,
    executeScratchAction,
    executeHarvestAction,
    executeSellAction
} from "./actions.ts";

// Collector
export { setupDashboardCollector } from "./collector.ts";
