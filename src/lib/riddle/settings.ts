/**
 * Riddle settings.
 *
 * **Server-only.** This module is imported by route handlers and never by a client
 * component. The probability and the ceiling are secrets of the game's fairness:
 * publishing them invites a solver to time their attempts against the moment the
 * odds improve, and publishing the answer ends the game. `scripts/check-no-riddle-leak.mjs`
 * scans the client bundle for both.
 *
 * Defaults are deliberately mean. A very small probability with a hard budget
 * ceiling is the only combination that cannot bankrupt the product, and a puzzle
 * that most people lose is worth more than one that most people win.
 */

export interface RiddleSettings {
  /** Master switch. When false, `/api/riddle/roll` refuses outright. */
  enabled: boolean;
  /**
   * Probability of a win, as a fraction in `[0, 1]`.
   *
   * Bounded to `[0, 0.05]`. An admin who sets 0.9 has misread what this product
   * is, and a 7-day membership at 90% is a liability rather than a feature — so the
   * clamp is enforced on write and on read, not merely documented.
   */
  probability: number;
  /** Oracle days granted by a win. */
  prizeDays: number;
  /** Global wins allowed per day, across all readers. */
  dailyGrantCeiling: number;
  /** Global wins allowed per month. */
  monthlyGrantCeiling: number;
  /** Days before a reader may roll again after winning. */
  cooldownDays: number;
  /** Attempts allowed on one riddle before it goes cold. */
  attempts: number;
  /** Per-IP daily roll attempts, hashed. A soft barrier, not the control. */
  ipDailyRolls: number;
}

export const DEFAULT_RIDDLE_SETTINGS: RiddleSettings = {
  enabled: true,
  // 0.4%. Not a typo, and not negotiable upward without the clamp being changed.
  probability: 0.004,
  prizeDays: 7,
  dailyGrantCeiling: 12,
  monthlyGrantCeiling: 200,
  cooldownDays: 30,
  attempts: 3,
  ipDailyRolls: 40,
};

/** The hard bounds an admin cannot exceed, whatever the stored value says. */
export const LIMITS = {
  maxProbability: 0.05,
  minProbability: 0,
  minPrizeDays: 1,
  maxPrizeDays: 90,
  maxDailyCeiling: 500,
  maxMonthlyCeiling: 10000,
  maxAttempts: 10,
  minCooldownDays: 1,
} as const;

/**
 * Clamps a stored settings object.
 *
 * Applied on read as well as on write, because a settings document edited by hand
 * in the Firebase console has not been through any validation, and a probability of
 * 0.9 there would be read straight into the game.
 */
export function normaliseRiddleSettings(raw: unknown): RiddleSettings {
  const d = DEFAULT_RIDDLE_SETTINGS;
  if (!raw || typeof raw !== "object") return { ...d };

  const r = raw as Partial<Record<keyof RiddleSettings, unknown>>;

  const number = (value: unknown, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : d.enabled,
    probability: clamp(
      number(r.probability, d.probability),
      LIMITS.minProbability,
      LIMITS.maxProbability
    ),
    prizeDays: Math.round(
      clamp(number(r.prizeDays, d.prizeDays), LIMITS.minPrizeDays, LIMITS.maxPrizeDays)
    ),
    dailyGrantCeiling: Math.round(
      clamp(number(r.dailyGrantCeiling, d.dailyGrantCeiling), 0, LIMITS.maxDailyCeiling)
    ),
    monthlyGrantCeiling: Math.round(
      clamp(number(r.monthlyGrantCeiling, d.monthlyGrantCeiling), 0, LIMITS.maxMonthlyCeiling)
    ),
    cooldownDays: Math.round(
      clamp(number(r.cooldownDays, d.cooldownDays), LIMITS.minCooldownDays, 3650)
    ),
    attempts: Math.round(
      clamp(number(r.attempts, d.attempts), 1, LIMITS.maxAttempts)
    ),
    ipDailyRolls: Math.round(clamp(number(r.ipDailyRolls, d.ipDailyRolls), 1, 10_000)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Reads from `siteConfig/riddles`. Fails safe — disabled — when unreadable. */
export async function readRiddleSettings(
  read: (path: string) => Promise<unknown>
): Promise<RiddleSettings> {
  try {
    const doc = (await read("siteConfig/riddles")) as Record<string, unknown> | null;
    if (!doc) return { ...DEFAULT_RIDDLE_SETTINGS };
    return normaliseRiddleSettings(doc);
  } catch {
    // Unreadable settings fail **closed**: the feature stops rather than running
    // on defaults nobody chose. A puzzle that stops is a small loss; a puzzle that
    // runs at an unintended probability is a liability.
    return { ...DEFAULT_RIDDLE_SETTINGS, enabled: false };
  }
}
