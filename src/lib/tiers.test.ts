import { describe, it, expect } from "vitest";
import {
  tierSatisfies,
  evaluateTrial,
  TIER_ORDER,
  TIER_DEFINITIONS,

  sanitizePricing,

} from "@/lib/tiers";

describe("tiers", () => {
  describe("tierOrder", () => {
    it("orders free < oracle < sanctum", () => {
      expect(TIER_ORDER.free).toBe(0);
      expect(TIER_ORDER.oracle).toBe(1);
      expect(TIER_ORDER.sanctum).toBe(2);
    });
  });

  describe("tierSatisfies", () => {
    it("free satisfies free", () => {
      expect(tierSatisfies("free", "free")).toBe(true);
    });

    it("oracle satisfies free and oracle", () => {
      expect(tierSatisfies("oracle", "free")).toBe(true);
      expect(tierSatisfies("oracle", "oracle")).toBe(true);
    });

    it("sanctum satisfies all", () => {
      expect(tierSatisfies("sanctum", "free")).toBe(true);
      expect(tierSatisfies("sanctum", "oracle")).toBe(true);
      expect(tierSatisfies("sanctum", "sanctum")).toBe(true);
    });

    it("free does not satisfy oracle", () => {
      expect(tierSatisfies("free", "oracle")).toBe(false);
    });

    it("oracle does not satisfy sanctum", () => {
      expect(tierSatisfies("oracle", "sanctum")).toBe(false);
    });
  });

  describe("evaluateTrial", () => {
    const now = Date.now();

    it("returns inactive for non-free tiers", () => {
      expect(evaluateTrial("oracle", now + 1000000, now)).toEqual({ active: false, daysLeft: 0 });
      expect(evaluateTrial("sanctum", now + 1000000, now)).toEqual({ active: false, daysLeft: 0 });
    });

    it("returns inactive for null/undefined trialEnd", () => {
      expect(evaluateTrial("free", null, now)).toEqual({ active: false, daysLeft: 0 });
      expect(evaluateTrial("free", undefined, now)).toEqual({ active: false, daysLeft: 0 });
    });

    it("returns inactive for past trialEnd", () => {
      expect(evaluateTrial("free", now - 1000, now)).toEqual({ active: false, daysLeft: 0 });
    });

    it("returns active with correct daysLeft for future trialEnd", () => {
      const future = now + 5 * 86_400_000; // 5 days
      expect(evaluateTrial("free", future, now)).toEqual({ active: true, daysLeft: 5 });
    });

    it("handles Firestore Timestamp (toMillis)", () => {
      const ts = { toMillis: () => now + 3 * 86_400_000 };
      expect(evaluateTrial("free", ts, now)).toEqual({ active: true, daysLeft: 3 });
    });

    it("returns inactive for unparsable trialEnd", () => {
      expect(evaluateTrial("free", "not-a-date", now)).toEqual({ active: false, daysLeft: 0 });
      expect(evaluateTrial("free", {}, now)).toEqual({ active: false, daysLeft: 0 });
    });

    it("clamps daysLeft to at least 1 when active", () => {
      const justNow = now + 1000; // 1 second
      expect(evaluateTrial("free", justNow, now)).toEqual({ active: true, daysLeft: 1 });
    });
  });

  describe("TIER_DEFINITIONS", () => {
    it("has all three tiers with correct structure", () => {
      expect(Object.keys(TIER_DEFINITIONS)).toEqual(["free", "oracle", "sanctum"]);
      for (const tier of ["free", "oracle", "sanctum"] as const) {
        const def = TIER_DEFINITIONS[tier];
        expect(def.id).toBe(tier);
        expect(typeof def.priceUsd).toBe("number");
        expect(Array.isArray(def.features)).toBe(true);
        expect(def.features.length).toBeGreaterThan(0);
      }
    });

    it("free has limited entitlements", () => {
      const free = TIER_DEFINITIONS.free;
      expect(free.aiAttempts).toBe(5);
      expect(free.trackerEntries).toBe(3);
      expect(free.dailyAnalysis).toBe(false);
      expect(free.pdfLibrary).toBe(false);
    });

    it("oracle has unlimited AI and tracker", () => {
      const oracle = TIER_DEFINITIONS.oracle;
      expect(oracle.aiAttempts).toBeNull();
      expect(oracle.trackerEntries).toBeNull();
      expect(oracle.dailyAnalysis).toBe(true);
      expect(oracle.pdfLibrary).toBe(true);
    });

    it("sanctum has everything", () => {
      const sanctum = TIER_DEFINITIONS.sanctum;
      expect(sanctum.aiAttempts).toBeNull();
      expect(sanctum.masterclasses).toBe(true);
      expect(sanctum.community).toBe(true);
      expect(sanctum.deepAnalysis).toBe(true);
    });
  });

  describe("sanitizePricing", () => {
    it("returns empty for null/undefined", () => {
      expect(sanitizePricing(null)).toEqual({});
      expect(sanitizePricing(undefined)).toEqual({});
    });

    it("parses valid numbers", () => {
      expect(sanitizePricing({ oracle: "45", sanctum: "120" })).toEqual({ oracle: 45, sanctum: 120 });
      expect(sanitizePricing({ oracle: 33, sanctum: 100 })).toEqual({ oracle: 33, sanctum: 100 });
    });

    it("ignores invalid values", () => {
      expect(sanitizePricing({ oracle: "not-a-number", sanctum: -5, free: 0 })).toEqual({});
      expect(sanitizePricing({ oracle: 1_000_000 })).toEqual({});
    });
  });
});
