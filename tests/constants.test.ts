/**
 * Tests for constants
 * Run with: bun test
 */
import { describe, expect, test } from "bun:test";
import { COLORS, ERRORS, BOT_VERSION, INTERVALS, CACHE, LIMITS } from "../utils/constants.ts";

describe("COLORS", () => {
    test("has PRIMARY color", () => {
        expect(COLORS.PRIMARY).toBeDefined();
        expect(typeof COLORS.PRIMARY).toBe("number");
    });

    test("has SUCCESS color", () => {
        expect(COLORS.SUCCESS).toBeDefined();
        expect(typeof COLORS.SUCCESS).toBe("number");
    });

    test("has ERROR color", () => {
        expect(COLORS.ERROR).toBeDefined();
        expect(typeof COLORS.ERROR).toBe("number");
    });

    test("has WARNING color", () => {
        expect(COLORS.WARNING).toBeDefined();
        expect(typeof COLORS.WARNING).toBe("number");
    });
});

describe("ERRORS", () => {
    test("has NO_PROFILE error message", () => {
        expect(ERRORS.NO_PROFILE).toBeDefined();
        expect(typeof ERRORS.NO_PROFILE).toBe("string");
    });

    test("has GENERIC error message", () => {
        expect(ERRORS.GENERIC).toBeDefined();
        expect(typeof ERRORS.GENERIC).toBe("string");
    });

    test("has STORAGE_FULL error message", () => {
        expect(ERRORS.STORAGE_FULL).toBeDefined();
        expect(typeof ERRORS.STORAGE_FULL).toBe("string");
    });
});

describe("BOT_VERSION", () => {
    test("is defined", () => {
        expect(BOT_VERSION).toBeDefined();
        expect(typeof BOT_VERSION).toBe("string");
    });

    test("follows semver format", () => {
        expect(BOT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
});

describe("INTERVALS", () => {
    test("has STATUS_ROTATION interval", () => {
        expect(INTERVALS.STATUS_ROTATION).toBeDefined();
        expect(typeof INTERVALS.STATUS_ROTATION).toBe("number");
        expect(INTERVALS.STATUS_ROTATION).toBeGreaterThan(0);
    });
});

describe("CACHE", () => {
    test("has PROFILE_TTL", () => {
        expect(CACHE.PROFILE_TTL).toBeDefined();
        expect(typeof CACHE.PROFILE_TTL).toBe("number");
        expect(CACHE.PROFILE_TTL).toBeGreaterThan(0);
    });

    test("has NAV_HISTORY_TTL", () => {
        expect(CACHE.NAV_HISTORY_TTL).toBeDefined();
        expect(typeof CACHE.NAV_HISTORY_TTL).toBe("number");
        expect(CACHE.NAV_HISTORY_TTL).toBeGreaterThan(0);
    });
});

describe("LIMITS", () => {
    test("has SELECT_MENU_OPTIONS", () => {
        expect(LIMITS.SELECT_MENU_OPTIONS).toBeDefined();
        expect(LIMITS.SELECT_MENU_OPTIONS).toBe(25); // Discord limit
    });

    test("has EMBED_FIELDS", () => {
        expect(LIMITS.EMBED_FIELDS).toBeDefined();
        expect(LIMITS.EMBED_FIELDS).toBe(25); // Discord limit
    });
});
