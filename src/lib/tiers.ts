/**
 * Subscription tiers, free-tier allowances, and marketing psychology.
 *
 * Prices are *display configuration*. The Admin Console writes overrides to
 * `siteConfig/pricing` in Firestore; these values are the shipped defaults
 * and the fallback when Firestore is unreachable.
 *
 * IMPORTANT: nothing here grants access. Entitlement is decided by
 * `users/{uid}.subscriptionTier`, which only a trusted billing/admin process
 * may write (enforced in firestore.rules).
 */

export type Tier = "free" | "oracle" | "sanctum";

export const TIER_ORDER: Record<Tier, number> = {
  free: 0,
  oracle: 1,
  sanctum: 2,
};

export interface TierEntitlements {
  /** AI attempts allowed before the Gate. `null` = unlimited. */
  aiAttempts: number | null;
  /** Daily tracker entries allowed per day. `null` = unlimited. */
  trackerEntries: number | null;
  /** Daily philosopher analysis available. */
  dailyAnalysis: boolean;
  /** PDF study materials downloadable. */
  pdfLibrary: boolean;
  /** YouTube masterclasses with gold frames. */
  masterclasses: boolean;
  /** Private community circle. */
  community: boolean;
  /** Deep psychological pattern analysis. */
  deepAnalysis: boolean;
}

export interface TierDefinition extends TierEntitlements {
  id: Tier;
  name: string;
  latin: string;
  priceUsd: number;
  /** Per-period price suffix. */
  period: string;
  /** English counterpart of `period`. */
  periodEnglish: string;
  tagline: string;
  /** Arabic feature list, index-aligned with `featuresEnglish`. */
  features: string[];
  /** Faithful English translation of `features`, same order. */
  featuresEnglish: string[];
  /** Per-tier English tagline. */
  taglineEnglish: string;
  /**
   * Scarcity framing shown to drive upgrade intent.
   *
   * DEPRECATED — unverified claims ("seats are limited") are not used in
   * pricing. Kept only so existing stored overrides keep parsing; see
   * `siteConfig.pricing`, which deliberately omits it.
   */
  scarcity: string;
  cta: string;
}

export const TRIAL_DAYS = 14;

export const TIER_DEFINITIONS: Record<Tier, TierDefinition> = {
  free: {
    id: "free",
    name: "الزائر",
    latin: "The Free Seeker",
    priceUsd: 0,
    period: "",
    tagline: "خمس محاولات تفتح لك الباب، ثم تبدأ الحكمة.",
    aiAttempts: 5,
    trackerEntries: 3,
    dailyAnalysis: false,
    pdfLibrary: false,
    masterclasses: false,
    community: false,
    deepAnalysis: false,
    features: [
      "خمس محاولات مع الحكيم",
      "ثلاثة إدخالات في المتتبع يومياً",
      "وصول إلى شخصيات الفلاسفة",
    ],
    featuresEnglish: [
      "Five dialogues with the sage",
      "Three tracker entries per day",
      "Access to the philosopher personas",
    ],
    periodEnglish: "/month",
    taglineEnglish: "Five attempts open the door, then wisdom begins.",
    scarcity: "الدعوة للعضوية تُغلق عند انتهاء التجربة.",
    cta: "ابدأ الآن",
  },
  oracle: {
    id: "oracle",
    name: "العرّاف",
    latin: "The Oracle",
    priceUsd: 33,
    period: "/شهرياً",
    periodEnglish: "/month",
    tagline: "تتبّع غير محدود وتحليل يومي من الفيلسوف.",
    aiAttempts: null,
    trackerEntries: null,
    dailyAnalysis: true,
    pdfLibrary: true,
    masterclasses: false,
    community: false,
    deepAnalysis: false,
    features: [
      "تتبّع غير محدود للعادات والأفكار",
      "رسم بياني ذهبي وتحليل يومي من الفيلسوف",
      "تحميل ملفات PDF الدراسية",
      "جلسات بلا حدود مع الحكيم",
    ],
    featuresEnglish: [
      "Unlimited habit and thought tracking",
      "A gold chart and daily analysis from the philosopher",
      "Downloadable PDF study material",
      "Unlimited sessions with the sage",
    ],
    taglineEnglish: "Unlimited tracking and a daily philosopher reading.",
    scarcity: "مقاعد العرّاف محدودة، ويغلق باب المستوى عند اكتمالها.",
    cta: "احجز مقعدك",
  },
  sanctum: {
    id: "sanctum",
    name: "المحراب",
    latin: "The Sanctum",
    priceUsd: 100,
    period: "/شهرياً",
    periodEnglish: "/month",
    tagline: "الدائرة الخاصة: مجتمع، ومحاضرات، وتحليل نفسي عميق.",
    aiAttempts: null,
    trackerEntries: null,
    dailyAnalysis: true,
    pdfLibrary: true,
    masterclasses: true,
    community: true,
    deepAnalysis: true,
    features: [
      "كل ما في العرّاف",
      "مجتمع خاص بمنشورات مقصورة",
      "فيديوهات يوتيوب بإطارات ذهبية قديمة",
      "تحليل نفسي عميق لأنماط تفكيرك",
    ],
    featuresEnglish: [
      "Everything in the Oracle",
      "A private community with members-only posts",
      "Video lectures in antique gold frames",
      "Deep psychological analysis of your thinking patterns",
    ],
    taglineEnglish: "The private circle: community, lectures, and deep analysis.",
    scarcity: "أربعة عشر مقعداً فقط في الدائرة، ومن يجلس لا يغادر.",
    cta: "ادخل المحراب",
  },
};

/** A tier satisfies a requirement when its rank is >= the required rank. */
export function tierSatisfies(current: Tier, required: Tier): boolean {
  return TIER_ORDER[current] >= TIER_ORDER[required];
}

/** Trial state derived from a stored `trialEnd` timestamp. */
export interface TrialState {
  active: boolean;
  daysLeft: number;
}

/**
 * Trials apply to the `free` tier only: a paying member has no trial to count.
 * A missing or unparsable `trialEnd` means "no trial", never "eternal trial".
 *
 * Accepts epoch ms, an ISO string, or a Firestore Timestamp (`toMillis`).
 */
export function evaluateTrial(
  tier: Tier,
  trialEnd: unknown,
  now: number = Date.now()
): TrialState {
  if (tier !== "free") return { active: false, daysLeft: 0 };

  let parsed = Number.NaN;
  if (typeof trialEnd === "number") {
    parsed = trialEnd;
  } else if (typeof trialEnd === "string") {
    parsed = Date.parse(trialEnd);
  } else if (
    trialEnd &&
    typeof trialEnd === "object" &&
    typeof (trialEnd as { toMillis?: unknown }).toMillis === "function"
  ) {
    try {
      parsed = (trialEnd as { toMillis(): number }).toMillis();
    } catch {
      parsed = Number.NaN;
    }
  }

  if (!Number.isFinite(parsed) || parsed <= now) return { active: false, daysLeft: 0 };
  const msLeft = parsed - now;
  return { active: true, daysLeft: Math.max(1, Math.ceil(msLeft / 86_400_000)) };
}

/** Normalises untrusted pricing documents from Firestore into numbers. */
export function sanitizePricing(raw: unknown): Partial<Record<Tier, number>> {
  const source = (raw ?? {}) as Record<string, unknown>;
  const out: Partial<Record<Tier, number>> = {};
  for (const tier of ["oracle", "sanctum"] as const) {
    const value = Number(source[tier]);
    if (Number.isFinite(value) && value >= 0 && value < 100_000) out[tier] = Math.floor(value);
  }
  return out;
}