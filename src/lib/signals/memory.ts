/**
 * The memory profile — and the sensitive-attribute ban.
 *
 * ## Size
 *
 * `MAX_MEMORY_TOKENS = 600`. The profile is injected verbatim into every system
 * prompt, so its size is a latency and cost budget as well as a privacy one. Six
 * hundred tokens is roughly 2,500 Arabic characters: enough for real specificity,
 * small enough that it does not crowd out the instruction that actually matters.
 *
 * ## What may be stored, and why each is not an inference about the person
 *
 * | Field | Why it is permitted |
 * |---|---|
 * | `interests` | Topics of questions **they asked**. The topic is the classification, never the text. Asking about meaning is not a trait. |
 * | `favouritePhilosopher` | An explicit click. |
 * | `rhythm` | Which coarse clock bucket they tend to read in. Five buckets; a fact about a clock. |
 * | `recurringTopics` | Counts of their own questions. |
 * | `statedGoals` | **Only what they said, in their words.** Never a paraphrase that adds an adjective. |
 *
 * ## The ban
 *
 * Health, religion, orientation, politics, and financial status are neither stored
 * nor inferred. `SENSITIVE_CATEGORIES` is exported so `memory.test.ts` can assert
 * that the schema has no field for them, and `scrubText` can refuse to carry them in
 * `statedGoals`.
 *
 * The scrubber is the interesting part. Storing a goal the reader volunteered is
 * permitted; storing "أشعر بالقلق" because they mentioned it in passing is not,
 * because a goal is a statement about what they want and a symptom is a statement
 * about what they are. The line is drawn there deliberately, and it is drawn in
 * code rather than in a reviewer's judgement.
 */

import type { TimeBucket } from "./types";

/** The size budget. Enforced on write. */
export const MAX_MEMORY_TOKENS = 600;

/** Characters, as a cheap proxy for tokens that needs no tokenizer. */
export const MAX_MEMORY_CHARS = 2500;

/**
 * Sensitive categories. Never inferred, never stored.
 *
 * Exported so a test can walk the schema and fail if a field for any of these
 * ever appears.
 */
export const SENSITIVE_CATEGORIES = [
  "health",
  "religion",
  "orientation",
  "politics",
  "financial",
] as const;

export type SensitiveCategory = (typeof SENSITIVE_CATEGORIES)[number];

/**
 * Arabic markers for each sensitive category, used only to *refuse* content.
 *
 * Each pattern is narrow on purpose. A scrubber matching bare "فكر" or "حرية" would
 * empty the profile of ordinary philosophical language, and the product would look as though
 * it had forgotten everything - a worse failure than storing a borderline goal, because
 * nobody would notice it happening.
 */
const SENSITIVE_MARKERS: Record<SensitiveCategory, RegExp> = {
  // A volunteered symptom, not a philosophical word. "أشعر بتعب" is a disclosure;
  // "أبحث عن معنى" is not.
  health:
    /(عندي|لديّ|أعاني من|أشتكي من)\s*(مرض|سكري|ضغط\s*(دم|نفسي)?|قلق|اكتئاب|ألألم)|تشخيص\s+صحيح|أشعر\s*(ب)?(ألألم|بالتعب الشديد|بالقلق الشديد|بالاكتئاب)/,
  // A declared position on the supernatural, or membership of a community.
  //
  // `(لا)?` and not `لا?`: the latter requires the letter "ل" and therefore can
  // never match a bare "أؤمن", so the whole alternative was dead code and every
  // declaration of belief passed straight through the scrubber. A regex that looks
  // like it is guarding something and is not is the worst kind of bug — the test
  // that caught it is the only reason it was ever noticed.
  religion:
    /(لا)?\s*أؤمن(?![\u0600-\u06FF])|(لا)?\s*أؤمن(?=[\s،.؟?!])|أصلي|أصلّي|ملحد|مسلمة|مسيحية|يهودية|بوذية/,
  orientation: /مثلي|مثلياً|جنسي\s+ال|homosexual|lesbian|gay|queer|bisexual/,
  politics: /أصوّت|تصوّتين|انتخاب|مرشّح|حزب\s|سياسياً|سياسة\s+ال/,
  financial: /راتبي|دخلي|مديون|إفلاس|فقر|ثروتي|مرتّب\s*من|أدخر\s*من\s*دخلي/,
};

/** A question topic. Bounded and non-sensitive by construction. */
export type InterestTopic =
  | "meaning"
  | "virtue"
  | "freedom"
  | "knowledge"
  | "suffering"
  | "death"
  | "beauty"
  | "doubt"
  | "ethics";

/** `users/{uid}/memory/profile` */
export interface MemoryProfile {
  /** Current interests, ranked. Never more than six. */
  interests: Array<{ topic: InterestTopic; weight: number }>;
  /** An explicit choice, or null. Never guessed from reading volume. */
  favouritePhilosopher: string | null;
  /** The clock buckets they tend to read in. Never more than three. */
  rhythm: Array<{ bucket: TimeBucket; count: number }>;
  /** Topics that recur across weeks, with counts. */
  recurringTopics: Array<{ topic: InterestTopic; count: number }>;
  /**
   * What they said, in their words.
   *
   * This is the field the golden rule depends on, and the reason it exists: the
   * system may recall these because the reader said them. Anything the product
   * inferred has no place here and must not be added.
   */
  statedGoals: string[];
  /** When the profile was last recomputed. */
  updatedAt: number;
}

export function emptyMemoryProfile(now: number): MemoryProfile {
  return {
    interests: [],
    favouritePhilosopher: null,
    rhythm: [],
    recurringTopics: [],
    statedGoals: [],
    updatedAt: now,
  };
}

/**
 * Whether a passage names a sensitive attribute.
 *
 * Used to *refuse* content. Returning false is the safe failure: it lets text
 * through, so the marker lists are tuned to be specific rather than broad.
 */
export function namesSensitiveAttribute(text: string): SensitiveCategory | null {
  for (const category of SENSITIVE_CATEGORIES) {
    if (SENSITIVE_MARKERS[category].test(text)) return category;
  }
  return null;
}

/**
 * Keeps only statements that are goals rather than disclosures.
 *
 * A volunteered goal is permitted; a volunteered symptom is not. This is the
 * narrowest possible reading of "what the user explicitly said about their goals",
 * and it is deliberately narrow — a missed goal costs a slightly less personal
 * suggestion, while a stored symptom is a disclosure the reader never consented to
 * in that form.
 */
export function scrubGoals(proposed: string[], limit = 6): {
  kept: string[];
  refused: Array<{ text: string; category: SensitiveCategory }>;
} {
  const kept: string[] = [];
  const refused: Array<{ text: string; category: SensitiveCategory }> = [];

  for (const raw of proposed) {
    const text = raw.trim();
    if (!text) continue;
    if (text.length > 200) continue;
    if (kept.length >= limit) break;

    const category = namesSensitiveAttribute(text);
    if (category) refused.push({ text, category });
    else if (!kept.includes(text)) kept.push(text);
  }

  return { kept, refused };
}

/**
 * Fields in the order they may be shortened, most expendable first.
 *
 * `statedGoals` is last because it is the only field the golden rule lets the
 * system speak from. Trimming anything else first means a reader's own words
 * survive longest.
 */
const TRIM_ORDER = ["rhythm", "recurringTopics", "interests", "statedGoals"] as const;


/**
 * Fits a profile to the budget.
 *
 * The earlier version of this loop trimmed and restarted its scan after every
 * removal, with a conditional expression choosing between two fields. It never
 * converged on a fat profile and left the result over budget — a budget check that
 * does not check is worse than none, because it reports success.
 *
 * This version is deliberately dull: cap each field, then remove one item at a
 * time in priority order until it fits or every field is at one item.
 */
export function fitToBudget(profile: MemoryProfile): MemoryProfile {
  const trimmed: MemoryProfile = {
    ...profile,
    interests: profile.interests.slice(0, 6),
    rhythm: profile.rhythm.slice(0, 3),
    recurringTopics: profile.recurringTopics.slice(0, 6),
    statedGoals: profile.statedGoals.slice(0, 6),
  };

  const size = (): number => estimateTokens(trimmed);
  let guard = 0;

  // Checked in **tokens**, not characters. The two budgets disagree — 2,500
  // characters is roughly 1,250 tokens — and the earlier version compared against
  // the character limit while the test measured tokens, so a profile 46 tokens over
  // budget was reported as fitting.
  while (size() > MAX_MEMORY_TOKENS && guard < 200) {
    guard += 1;
    const field = TRIM_ORDER.find((f) => trimmed[f].length > 1);
    // Every field is at one item and it still does not fit: nothing more to give.
    if (!field) break;
    (trimmed[field] as unknown[]).pop();
  }

  return trimmed;
}

/** Rough token estimate. Deliberately crude: the point is to stay under, not exact. */
export function estimateTokens(profile: MemoryProfile): number {
  // Arabic tokenises at roughly 2 characters per token in current models.
  return Math.ceil(JSON.stringify(profile).length / 2);
}
