/**
 * Tests for UX utility functions
 * Run with: bun test
 */
import { describe, expect, test } from "bun:test";
import {
    formatNumber,
    formatDuration,
    createProgressBar,
    storageIndicator,
    getItemEmoji,
    beforeAfter,
    relativeTimestamp
} from "../utils/ux.ts";

describe("formatNumber", () => {
    test("formats small numbers", () => {
        expect(formatNumber(0)).toBe("0");
        expect(formatNumber(100)).toBe("100");
        expect(formatNumber(999)).toBe("999");
    });

    test("adds commas to large numbers", () => {
        expect(formatNumber(1000)).toBe("1,000");
        expect(formatNumber(1234567)).toBe("1,234,567");
        expect(formatNumber(1000000000)).toBe("1,000,000,000");
    });

    test("handles negative numbers", () => {
        expect(formatNumber(-1000)).toBe("-1,000");
        expect(formatNumber(-1234567)).toBe("-1,234,567");
    });
});

describe("formatDuration", () => {
    test("formats seconds only", () => {
        expect(formatDuration(5000)).toBe("5s");
        expect(formatDuration(45000)).toBe("45s");
    });

    test("formats minutes and seconds", () => {
        expect(formatDuration(60000)).toBe("1m 0s");
        expect(formatDuration(90000)).toBe("1m 30s");
        expect(formatDuration(3599000)).toBe("59m 59s");
    });

    test("formats hours and minutes", () => {
        expect(formatDuration(3600000)).toBe("1h 0m");
        expect(formatDuration(5400000)).toBe("1h 30m");
        expect(formatDuration(7200000)).toBe("2h 0m");
    });
});

describe("createProgressBar", () => {
    test("shows empty bar at 0%", () => {
        const bar = createProgressBar(0, 100);
        expect(bar).toContain("0%");
        expect(bar).toContain("░░░░░░░░░░");
    });

    test("shows full bar at 100%", () => {
        const bar = createProgressBar(100, 100);
        expect(bar).toContain("100%");
        expect(bar).toContain("██████████");
    });

    test("shows partial bar at 50%", () => {
        const bar = createProgressBar(50, 100);
        expect(bar).toContain("50%");
        expect(bar).toContain("█████");
    });

    test("handles custom bar length", () => {
        const bar = createProgressBar(50, 100, 20);
        expect(bar).toContain("50%");
    });

    test("clamps values above 100%", () => {
        const bar = createProgressBar(150, 100);
        expect(bar).toContain("100%");
    });

    test("clamps values below 0%", () => {
        const bar = createProgressBar(-50, 100);
        expect(bar).toContain("0%");
    });
});

describe("storageIndicator", () => {
    test("shows green emoji when < 50% full", () => {
        const indicator = storageIndicator(10, 100);
        expect(indicator).toContain("🟢");
        expect(indicator).toContain("10/100");
    });

    test("shows yellow emoji when 50-69% full", () => {
        const indicator = storageIndicator(60, 100);
        expect(indicator).toContain("🟡");
    });

    test("shows orange emoji when 70-89% full", () => {
        const indicator = storageIndicator(80, 100);
        expect(indicator).toContain("🟠");
    });

    test("shows red emoji when >= 90% full", () => {
        const indicator = storageIndicator(95, 100);
        expect(indicator).toContain("🔴");
    });
});

describe("getItemEmoji", () => {
    test("returns correct emoji for known items", () => {
        expect(getItemEmoji("wheat")).toBe("🌾");
        expect(getItemEmoji("chicken")).toBe("🐔");
        expect(getItemEmoji("egg")).toBe("🥚");
        expect(getItemEmoji("gold")).toBe("🪙");
    });

    test("returns default emoji for unknown items", () => {
        expect(getItemEmoji("unknownitem")).toBe("📦");
    });

    test("is case insensitive", () => {
        expect(getItemEmoji("WHEAT")).toBe("🌾");
        expect(getItemEmoji("Chicken")).toBe("🐔");
    });
});

describe("beforeAfter", () => {
    test("shows increase correctly", () => {
        const result = beforeAfter(100, 150);
        expect(result).toContain("100");
        expect(result).toContain("150");
        expect(result).toContain("+50");
    });

    test("shows decrease correctly", () => {
        const result = beforeAfter(150, 100);
        expect(result).toContain("150");
        expect(result).toContain("100");
        expect(result).toContain("-50");
    });

    test("uses custom emoji", () => {
        const result = beforeAfter(100, 150, "⭐");
        expect(result).toContain("⭐");
    });
});

describe("relativeTimestamp", () => {
    test("returns Discord timestamp format", () => {
        const timestamp = Date.now();
        const result = relativeTimestamp(timestamp);
        expect(result).toMatch(/^<t:\d+:R>$/);
    });
});
