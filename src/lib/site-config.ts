/**
 * Site configuration — the editable surface for admin-authored content.
 *
 * Reads with a **static** fallback for now: the shipped defaults below are the
 * source of truth until the admin console makes the Firestore document
 * authoritative (prompt 14). `normalisePricing` already validates an untrusted
 * payload so that migration is a one-line swap.
 *
 * Copy rules enforced here:
 *  - No discounts, no countdown timers, no seat counters. The old
 *    `TIER_DEFINITIONS[*].scarcity` strings were removed from pricing on
 *    purpose; scarcity we cannot substantiate is not a selling point.
 *  - Limits are the *real* values from `TIER_DEFINITIONS`, never aspirational.
 */

import { TIER_DEFINITIONS, type Tier } from "@/lib/tiers";

export interface Bilingual {
  ar: string;
  en: string;
}

export interface PricingLimit {
  ar: string;
  en: string;
}

export interface PricingTier {
  id: Tier;
  name: Bilingual;
  latin: string;
  /** Display string only. Currency formatting is a payment concern, not yet built. */
  price: Bilingual;
  period: Bilingual;
  tagline: Bilingual;
  includes: Bilingual[];
  limits: PricingLimit[];
  cta: Bilingual;
  href: string;
  /** Visual emphasis. Carries no pricing implication. */
  highlighted: boolean;
}

export interface SiteConfig {
  pricing: PricingTier[];
}

/**
 * Display price. Sourced from `priceUsd` so the two can never drift.
 * There is no payment path wired up yet — see PROJECT_MAP "no payment path".
 */
function displayPrice(usd: number): Bilingual {
  if (usd === 0) return { ar: "مجاناً", en: "Free" };
  return { ar: `${usd} دولاراً`, en: `$${usd}` };
}

/**
 * Only what the tier genuinely does NOT include.
 *
 * This deliberately lists absences, not allowances. An earlier version mapped
 * every entitlement into this list, which put "5 dialogues with the sage"
 * under the free tier's *excluded* section — the page then stated the opposite
 * of the truth. Anything a tier grants belongs under "includes"; anything it
 * withholds belongs here, phrased as an absence.
 */
function realLimits(id: Tier): PricingLimit[] {
  const t = TIER_DEFINITIONS[id];
  const out: PricingLimit[] = [
    {
      ar: t.aiAttempts === null ? "بلا حدّ للحوارات" : `${t.aiAttempts} حوارات فقط مع الحكيم`,
      en: t.aiAttempts === null ? "No dialogue allowance" : `${t.aiAttempts} dialogues only with the sage`,
    },
    {
      ar:
        t.trackerEntries === null
          ? "بلا حدّ للإدخالات في المتتبع"
          : `${t.trackerEntries} إدخالات في المتتبع يومياً فقط`,
      en:
        t.trackerEntries === null
          ? "No tracker allowance"
          : `${t.trackerEntries} tracker entries per day only`,
    },
    {
      ar: t.dailyAnalysis ? "بلا تحليل يومي" : "بلا تحليل يومي ولا رسم بياني",
      en: t.dailyAnalysis ? "No daily analysis" : "No daily analysis and no chart",
    },
    {
      ar: t.pdfLibrary ? "بلا مكتبة الملفات الدراسية" : "بلا مكتبة ملفات ولا محاضرات",
      en: t.pdfLibrary ? "No study file library" : "No file library and no lectures",
    },
    {
      ar: t.masterclasses ? "بلا محاضرات" : "بلا محاضرات ولا تحليل عميق",
      en: t.masterclasses ? "No masterclasses" : "No masterclasses and no deep analysis",
    },
    {
      ar: t.deepAnalysis ? "بلا تحليل عميق لأنماط التفكير" : "بلا تحليل عميق",
      en: t.deepAnalysis ? "No deep analysis of thinking patterns" : "No deep analysis",
    },
    {
      ar: t.community ? "بلا الدائرة الخاصة" : "بلا مجتمع خاص",
      en: t.community ? "No private circle" : "No private community",
    },
  ];
  return out;
}

/** Shipped default pricing. */
function buildPricing(): PricingTier[] {
  const order: Tier[] = ["free", "oracle", "sanctum"];
  return order.map((id) => {
    const t = TIER_DEFINITIONS[id];
    return {
      id,
      name: { ar: t.name, en: t.latin },
      latin: t.latin,
      price: displayPrice(t.priceUsd),
      period: { ar: t.period || "للأبد", en: t.periodEnglish || "forever" },
      tagline: { ar: t.tagline, en: t.taglineEnglish },
      includes: t.features.map((ar, i) => ({
        ar,
        en: t.featuresEnglish[i] ?? ar,
      })),
      limits: realLimits(id),
      cta: {
        ar: t.id === "free" ? "ابدأ الآن" : t.id === "oracle" ? "انضم إلى العرّاف" : "انضم إلى المحراب",
        en:
          t.id === "free" ? "Start free" : t.id === "oracle" ? "Join the Oracle" : "Join the Sanctum",
      },
      href: id === "free" ? "/enter" : "/account",
      highlighted: id === "oracle",
    };
  });
}

export const FALLBACK_SITE_CONFIG: SiteConfig = {
  pricing: buildPricing(),
};

/* ── validation for an untrusted `siteConfig/pricing` payload ──────────── */

const TIER_IDS = new Set<Tier>(["free", "oracle", "sanctum"]);

/**
 * Display data only. A malformed document degrades to the static default
 * rather than throwing, because a bad config must never take the site down.
 */
export function normalisePricing(raw: unknown): PricingTier[] | null {
  if (!Array.isArray(raw)) return null;
  const out: PricingTier[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;

    const id = e.id;
    if (typeof id !== "string" || !TIER_IDS.has(id as Tier)) continue;

    const pick = (v: unknown): Bilingual | null => {
      if (!v || typeof v !== "object") return null;
      const o = v as Record<string, unknown>;
      if (typeof o.ar !== "string" || typeof o.en !== "string") return null;
      return { ar: o.ar, en: o.en };
    };

    const name = pick(e.name);
    const price = pick(e.price);
    const period = pick(e.period);
    const tagline = pick(e.tagline);
    const cta = pick(e.cta);
    if (!name || !price || !period || !tagline || !cta) continue;

    const href = typeof e.href === "string" && e.href.startsWith("/") && !e.href.startsWith("//")
      ? e.href
      : "/account";

    const strList = (v: unknown): Bilingual[] =>
      Array.isArray(v)
        ? v.map(pick).filter((x): x is Bilingual => x !== null)
        : [];

    out.push({
      id: id as Tier,
      name,
      latin: typeof e.latin === "string" ? e.latin : name.en,
      price,
      period,
      tagline,
      includes: strList(e.includes),
      limits: strList(e.limits),
      cta,
      href,
      highlighted: e.highlighted === true,
    });
  }

  // All three tiers must survive, or the column layout is a lie.
  return out.length === TIER_IDS.size ? out : null;
}
