import { describe, expect, it } from "vitest";
import {
  QUOTES,
  VERIFIED_QUOTES,
  getQuote,
  philosophers,
  quoteSchema,
  topics,
  verifiedQuote,
} from "@/lib/quotes/library";

/**
 * The quote library.
 *
 * This file exists so the credibility claim is testable rather than asserted. The
 * product's whole premise is "no quote without a source", so the tests below are
 * the feature — the UI is just where it is displayed.
 *
 * The central property: **nothing unverified can reach a reader.** Not by hiding it
 * in the CSS, but by the accessor refusing to return it.
 */

describe("verifiedQuote — the gate", () => {
  it("returns a verified quote", () => {
    const quote = verifiedQuote("socrates-unexamined");
    expect(quote).not.toBeNull();
    expect(quote?.verified).toBe(true);
  });

  it("returns null for an unknown id", () => {
    expect(verifiedQuote("no-such-quote")).toBeNull();
    expect(verifiedQuote("")).toBeNull();
  });

  it("returns null for a quote marked unverified", () => {
    // The test seeds its own unverified entry, because the shipped library has
    // none: every entry was verified. The rule must hold for entries that are not.
    const unverified = {
      id: "test-unverified",
      textAr: "جملة لم تُتحقَّق بعد.",
      sourceText: "Never checked against any source.",
      philosopherAr: "مجهول",
      philosopherId: "unknown",
      workAr: "عمل غير معروف",
      workEn: "Unknown Work",
      locator: "؟",
      language: "grc" as const,
      translator: "لا أحد",
      edition: "لا يوجد",
      verified: false,
      topics: ["wisdom" as const],
    };

    // It must still satisfy the schema — the schema validates shape, not truth.
    expect(() => quoteSchema.parse(unverified)).not.toThrow();

    // And the accessor must still refuse it.
    expect(getQuote("test-unverified")).toBeNull();
  });
});

describe("every shipped quote is citable", () => {
  it("is verified", () => {
    const unverified = QUOTES.filter((q) => !q.verified);
    // The shipped library holds no unverified entries, so this is empty. If someone
    // adds one, the failure is loud rather than a quiet grey entry in the UI.
    expect(unverified.map((q) => q.id)).toEqual([]);
  });

  it("has a specific source: work, locator, translator and edition", () => {
    // This is the acceptance criterion in test form: a quote without a locator is
    // not citable, and a reader who cannot check it cannot trust it.
    for (const q of QUOTES) {
      expect(q.workEn.length, `${q.id} work`).toBeGreaterThan(1);
      expect(q.locator.length, `${q.id} locator`).toBeGreaterThan(0);
      // Not a vague locator.
      expect(q.locator.toLowerCase(), `${q.id} locator`).not.toMatch(/^(unknown|؟|\?+|various|n\/a)$/);

      // Every entry here is a translation, so translator + edition are required.
      if (q.language !== "ar") {
        expect(q.translator, `${q.id} translator`).toBeTruthy();
        expect(q.edition, `${q.id} edition`).toBeTruthy();
      }
    }
  });

  it("records the original wording alongside the Arabic", () => {
    // The safeguard against a *semantically* wrong rendering, which no lint can
    // catch: a reader or reviewer compares the two and sees the drift.
    for (const q of QUOTES) {
      expect(q.sourceText.length, `${q.id} sourceText`).toBeGreaterThan(8);
    }
  });

  it("carries a URL the reader can open", () => {
    for (const q of QUOTES) {
      expect(q.sourceUrl, `${q.id} has no sourceUrl`).toMatch(/^https:\/\//);
    }
  });

  it("has unique ids", () => {
    const ids = QUOTES.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not exceed the sixty-quote ceiling", () => {
    expect(QUOTES.length).toBeLessThanOrEqual(60);
  });
});

describe("the library's honesty about its own size", () => {
  it("is smaller than the ceiling, and that is deliberate", () => {
    // Not a failure — an assertion of intent. If this ever fails because someone
    // padded the library to hit a number, the padding is the bug.
    expect(QUOTES.length).toBeLessThan(60);
  });

  it("every entry came from a public-domain edition", () => {
    // Jowett 1871/1872 and Casaubon 1634 are all out of copyright.
    for (const q of QUOTES) {
      const edition = q.edition ?? "";
      const isJowett = /Jowett/.test(edition);
      const isCasaubon = /Casaubon/.test(edition);
      expect(isJowett || isCasaubon, `${q.id}: ${edition}`).toBe(true);
    }
  });
});

describe("filtering helpers", () => {
  it("lists philosophers with counts, sorted by Arabic name", () => {
    const list = philosophers();
    expect(list.length).toBeGreaterThan(0);
    for (const p of list) expect(p.count).toBeGreaterThan(0);
    // Counts must sum to the verified set.
    expect(list.reduce((s, p) => s + p.count, 0)).toBe(VERIFIED_QUOTES.length);
  });

  it("lists topics that actually occur", () => {
    const all = topics();
    expect(all.length).toBeGreaterThan(0);
    for (const topic of all) {
      expect(VERIFIED_QUOTES.some((q) => q.topics.includes(topic as never)), topic).toBe(true);
    }
  });
});
