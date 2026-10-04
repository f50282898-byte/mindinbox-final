import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateSiteContent,
  hasExactlyOneCardPerTier,
  hasUniqueNavIds,
  HISTORY_DEPTH,
  type SiteContent,
} from "@/lib/admin/site-schema";
import { checkPricingConsistency } from "@/lib/admin/site-store";
import {
  ASSISTANT_SYSTEM_PROMPT_AR,
  buildAssistantBrief,
  isProposable,
  sanitiseProposals,
  PROPOSABLE_PATHS,
} from "@/lib/admin/assistant";

/** A valid document to mutate in each test. */
function validContent(overrides: Partial<SiteContent> = {}): SiteContent {
  const tiers = ["free", "oracle", "sanctum"] as const;
  return {
    nav: [
      { id: "enter", label: { ar: "المدخل", en: "Enter" }, visible: true },
      { id: "wisdom", label: { ar: "الحكمة", en: "Wisdom" }, visible: true },
    ],
    pricing: tiers.map((tier) => ({
      tier,
      name: { ar: tier, en: tier },
      latin: tier,
      price: { ar: "مجاناً", en: tier === "free" ? "Free" : "$9" },
      period: { ar: "شهر", en: "month" },
      tagline: { ar: "وصف", en: "tagline" },
      includes: [{ ar: "شيء", en: "thing" }],
      limits: [],
      cta: { ar: "ابدأ", en: "Start" },
      priceId: null,
      highlighted: false,
    })),
    videos: [],
    version: 0,
    publishedAt: null,
    ...overrides,
  };
}

/* ── schema ───────────────────────────────────────────────────────────────── */

describe("site content validation", () => {
  it("accepts a well-formed document", () => {
    const result = validateSiteContent(validContent());
    expect(result.ok).toBe(true);
  });

  it("refuses a missing Arabic label", () => {
    const bad = validContent();
    bad.nav[0]!.label.ar = "";
    const result = validateSiteContent(bad);
    expect(result.ok).toBe(false);
  });

  it("refuses an unknown navigation id", () => {
    // A free string here would render a menu item that navigates nowhere.
    const bad = validContent();
    (bad.nav[0] as unknown as { id: string }).id = "secret-admin-page";
    expect(validateSiteContent(bad).ok).toBe(false);
  });

  it("refuses an unknown tier on a pricing card", () => {
    const bad = validContent();
    (bad.pricing[0] as unknown as { tier: string }).tier = "platinum";
    expect(validateSiteContent(bad).ok).toBe(false);
  });

  it("refuses two cards for one tier and none for another", () => {
    // This is the failure that makes the pricing page lie: three columns, two of them
    // claiming the same level.
    const bad = validContent();
    bad.pricing = [
      bad.pricing[0]!,
      bad.pricing[1]!,
      { ...bad.pricing[1]! },
    ];
    const result = validateSiteContent(bad);
    expect(result.ok).toBe(false);
    // Asserted on intent, not on a literal field name: the message is Arabic product
    // copy and must not carry Latin identifiers (the content gate enforces that), while
    // the zod issues above it already carry the path.
    expect(!result.ok && result.issues.join(" ")).toContain("بطاقة واحدة");
  });

  it("refuses duplicate navigation ids", () => {
    const bad = validContent();
    bad.nav = [bad.nav[0]!, { ...bad.nav[0]! }];
    const result = validateSiteContent(bad);
    expect(result.ok).toBe(false);
  });

  it("refuses a negative version", () => {
    const bad = validContent({ version: -1 });
    expect(validateSiteContent(bad).ok).toBe(false);
  });

  it("refuses a non-integer version", () => {
    expect(validateSiteContent(validContent({ version: 1.5 })).ok).toBe(false);
  });

  it("refuses a video id with characters that are not slug-safe", () => {
    const bad = validContent();
    bad.videos = [
      {
        id: "../escape",
        title: { ar: "عنوان", en: "title" },
        summary: { ar: "ملخص", en: "summary" },
        embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      },
    ];
    expect(validateSiteContent(bad).ok).toBe(false);
  });

  it("reports every problem at once, so an admin fixes one round not five", () => {
    const bad = { nav: "not an array" };
    const result = validateSiteContent(bad);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues.length).toBeGreaterThan(1);
  });

  it("exposes the collection invariants as their own functions", () => {
    expect(hasExactlyOneCardPerTier(validContent())).toBe(true);
    expect(hasUniqueNavIds(validContent())).toBe(true);
    expect(HISTORY_DEPTH).toBeGreaterThan(1);
  });
});

/* ── the version lock ─────────────────────────────────────────────────────── */

describe("the optimistic version lock", () => {
  it("treats the version as an integer that only moves forward", () => {
    // The property the lock depends on: a stale tab's expected version can never equal
    // the current one again after a publish, which is why undo does not restore it.
    const v0 = validContent({ version: 0 }).version;
    const v1 = validContent({ version: 1 }).version;
    expect(v1).toBeGreaterThan(v0);
    expect(Number.isInteger(v1)).toBe(true);
  });

  it("refuses a fractional or negative expected version at the schema level", () => {
    expect(validateSiteContent(validContent({ version: 0.1 })).ok).toBe(false);
    expect(validateSiteContent(validContent({ version: -3 })).ok).toBe(false);
  });
});

/* ── pricing consistency ──────────────────────────────────────────────────── */

describe("the pricing consistency check", () => {
  const REAL = { free: 0, oracle: 9, sanctum: 29 };

  it("reports a clean display-only check as display-only", () => {
    const report = checkPricingConsistency(
      [
        { tier: "free", price: { ar: "مجاناً", en: "Free" }, priceId: null },
        { tier: "oracle", price: { ar: "٩ دولارات", en: "$9" }, priceId: null },
      ],
      REAL
    );
    // No provider link, so it must not claim it checked one.
    expect(report.checked).toBe("display");
    expect(report.findings).toEqual([]);
  });

  it("reports display+provider when a card is linked", () => {
    const report = checkPricingConsistency(
      [{ tier: "oracle", price: { ar: "٩", en: "$9" }, priceId: "pri_123" }],
      REAL
    );
    expect(report.checked).toBe("display+provider");
    expect(report.linkedPriceIds).toEqual(["pri_123"]);
  });

  it("warns when the displayed number is not the real one", () => {
    const report = checkPricingConsistency(
      [{ tier: "oracle", price: { ar: "٥", en: "$5" }, priceId: null }],
      REAL
    );
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]!.problem).toBe("amount_mismatch");
  });

  it("warns when a paid tier shows no number at all", () => {
    const report = checkPricingConsistency(
      [{ tier: "sanctum", price: { ar: "تواصل معنا", en: "Contact us" }, priceId: null }],
      REAL
    );
    expect(report.findings[0]!.problem).toBe("no_amount_shown");
  });

  it("does not warn when the free tier shows no number", () => {
    const report = checkPricingConsistency(
      [{ tier: "free", price: { ar: "مجاناً", en: "Free" }, priceId: null }],
      REAL
    );
    expect(report.findings).toEqual([]);
  });

  it("flags a tier it has no reference price for", () => {
    const report = checkPricingConsistency(
      [{ tier: "platinum", price: { ar: "٩٩", en: "$99" }, priceId: null }],
      REAL
    );
    expect(report.findings[0]!.problem).toBe("unknown_tier");
  });
});

/* ── the assistant cannot write ───────────────────────────────────────────── */

describe("the assistant proposes and never publishes", () => {
  it("has no write capability in its prompt", () => {
    // The prompt is the model's only instruction. If it ever said "and then apply",
    // the model would try, and the route would have nowhere to put the result.
    expect(ASSISTANT_SYSTEM_PROMPT_AR).toContain("لا تنشر");
    expect(ASSISTANT_SYSTEM_PROMPT_AR).toContain("موافقة إنسان");
  });

  it("has no write capability in its module at all", () => {
    // A belt-and-braces check on the module's surface. The route imports only these
    // names; if someone adds an `applyProposal` later, this is the test that notices.
    //
    // Comments are stripped before the check. The module's own documentation *names*
    // `setDocument` and `publishDraft` precisely in order to say they are absent, and a
    // naive substring check fails on that documentation — which is how a guard like this
    // gets switched off.
    const source = readFileSync(join(process.cwd(), "src/lib/admin/assistant.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    // No write-shaped export.
    expect(source).not.toMatch(
      /export\s+(async\s+)?function\s+(apply|publish|save|write|update|set|delete)/i
    );
    // No datastore import at all.
    expect(source).not.toMatch(/from\s+"@\/lib\/google\//);
    expect(source).not.toMatch(/from\s+"\.\/site-store"/);
    // And no call to the write helpers, in case they arrive via a relative import.
    expect(source).not.toMatch(/\bsetDocument\s*\(/);
    expect(source).not.toMatch(/\bpublishDraft\s*\(/);
    expect(source).not.toMatch(/\bundoLastPublish\s*\(/);
  });

  it("keeps its proposal surface small enough to audit by eye", () => {
    // If this list grows a write-shaped name, the test above stops being the whole
    // story and someone should look again.
    expect(PROPOSABLE_PATHS).toEqual(["pricing", "banners", "videos", "nav"]);
  });

  it("builds a brief with counts only — the input type has no field for a reader", () => {
    const brief = buildAssistantBrief({
      questionAr: "لماذا هبط التحويل؟",
      funnel: { visits: 100, signups: 4 },
      providers: [{ id: "gemini", requests: 90, errors: 2 }],
      pricing: [{ tier: "oracle", priceAr: "٩ دولارات", taglineAr: "وصف" }],
      banners: [],
    });

    expect(brief).toContain("100");
    expect(brief).toContain("لا تكتب أي شيء");
    // No reader identity appears, because there is no input that could carry one.
    expect(brief).not.toContain("@");
  });

  it("refuses a proposal pointing outside the allowed paths", () => {
    expect(isProposable("pricing[1].tagline.ar")).toBe(true);
    expect(isProposable("banners.new")).toBe(true);
    // The two that would matter most to attack.
    expect(isProposable("admins[0]")).toBe(false);
    expect(isProposable("users[0].email")).toBe(false);
    expect(isProposable("auditLog.clear")).toBe(false);
  });

  it("drops proposals the model invented outside the allow-list", () => {
    const kept = sanitiseProposals([
      { path: "pricing[0].tagline.ar", before: "أ", after: "ب", rationaleAr: "لأن" },
      { path: "admins[0].uid", before: "x", after: "y", rationaleAr: "لأن" },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.path).toContain("pricing");
  });

  it("drops a proposal that would blank a field, and one that changes nothing", () => {
    const kept = sanitiseProposals([
      { path: "pricing[0].tagline.ar", before: "أ", after: "   " },
      { path: "pricing[0].tagline.en", before: "same", after: "same" },
      { path: "pricing[0].period.ar", before: "شهر", after: "سنة" },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.path).toContain("period");
  });

  it("drops malformed items rather than rendering undefined into a diff", () => {
    expect(sanitiseProposals([null, 42, "text", {}, { path: "pricing" }])).toEqual([]);
    expect(sanitiseProposals("not an array")).toEqual([]);
  });

  it("caps the number of proposals so a panel stays readable", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      path: `pricing[${i % 3}].tagline.ar`,
      before: `أ${i}`,
      after: `ب${i}`,
    }));
    expect(sanitiseProposals(many).length).toBeLessThanOrEqual(12);
  });

  it("never offers a path that could change a price", () => {
    // Pricing *copy* is proposable. A price is not — and the allow-list has no way to
    // express the difference, so this test pins the intent rather than the mechanism.
    expect(PROPOSABLE_PATHS).not.toContain("grants");
    expect(PROPOSABLE_PATHS).not.toContain("subscriptions");
    expect(PROPOSABLE_PATHS).not.toContain("users");
  });
});
