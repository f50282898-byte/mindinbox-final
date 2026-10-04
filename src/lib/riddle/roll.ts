/**
 * The roll.
 *
 * ## Where the randomness comes from
 *
 * `crypto.getRandomValues`, on the server. Never `Math.random`. Never a seed derived
 * from the uid, the clock, or the request — any of those is predictable to someone
 * willing to spend an afternoon, and a predictable lottery is not a lottery.
 *
 * ## How to test a distribution without trusting the random source
 *
 * `rollOutcome` takes its randomness as a **parameter**. Production passes a CSPRNG
 * reader; the seeded distribution test passes a deterministic generator and asserts
 * the shape over 100,000 draws. This is the only way to test a distribution at all —
 * a test that rolls 100 times with real entropy and asserts roughly 4 wins will fail
 * about a third of the time, and a test that rolls until it sees a win proves
 * nothing.
 *
 * The parameter is the point. A function that reached for entropy internally could
 * not be tested this way, and every implementation reaches for entropy internally.
 */

export type RandomSource = () => number;

/** A CSPRNG reader returning a float in `[0, 1)`. */
export function cryptoRandom(): RandomSource {
  // One uint32 is 2^32 values; dividing by 2^32 gives [0, 1) exactly, never 1.
  const buffer = new Uint32Array(1);
  return () => {
    crypto.getRandomValues(buffer);
    return (buffer[0] as number) / 4294967296;
  };
}

/** Why a roll was refused, for the server log and the client's quiet message. */
export type RollRefusal =
  | "disabled"
  | "no_verified_email"
  | "cooldown"
  | "ip_limit"
  | "daily_ceiling"
  | "monthly_ceiling"
  | "rate_limit"
  | "new_account_cluster";

export type RollResult =
  | { ok: true; won: true }
  | { ok: true; won: false }
  | { ok: false; reason: RollRefusal };

export interface RollContext {
  probability: number;
  /** Epoch ms of this reader's last win, or null. */
  lastWinAt: number | null;
  cooldownDays: number;
  /** Grants already issued today, globally. */
  grantsToday: number;
  grantsThisMonth: number;
  dailyGrantCeiling: number;
  monthlyGrantCeiling: number;
  /** Rolls already made from this IP today, hashed. */
  ipRollsToday: number;
  ipDailyRolls: number;
  /** Rolls by this uid in the last hour, for a rate limit. */
  recentRolls: number;
  /** Created within this window and with no prior session — a cluster signal. */
  suspiciousAccount: boolean;
  now: number;
}

/**
 * Decides and rolls.
 *
 * ## Order of checks, and why the ceilings come before the roll
 *
 * A ceiling must stop granting **immediately**, so the budget is evaluated before
 * any randomness is drawn. If the ceiling were checked after the roll, a reader
 * could win, be refused, and be told they won — and worse, the refusal would depend
 * on a random draw, which is exactly the sort of thing that looks like a bug in a
 * dashboard.
 *
 * The IP limit is checked before the roll for the same reason: it is a cost control.
 *
 * The draw is last, and only once everything else has passed.
 */
export function rollOutcome(
  context: RollContext,
  random: RandomSource = cryptoRandom()
): RollResult {
  const { now } = context;

  /* ── Budget first. A full purse must stop grants before anything is decided. ── */
  if (context.grantsToday >= context.dailyGrantCeiling) {
    return { ok: false, reason: "daily_ceiling" };
  }
  if (context.grantsThisMonth >= context.monthlyGrantCeiling) {
    return { ok: false, reason: "monthly_ceiling" };
  }

  /* ── Cooldown ─────────────────────────────────────────────────────────────── */
  if (
    context.lastWinAt !== null &&
    now - context.lastWinAt < context.cooldownDays * 86_400_000
  ) {
    return { ok: false, reason: "cooldown" };
  }

  /* ── Abuse barriers ──────────────────────────────────────────────────────────
     All soft. The control is the ceiling above; these slow down a burst without
     blocking a genuine reader who happens to share an address. */
  if (context.recentRolls >= 20) return { ok: false, reason: "rate_limit" };
  if (context.ipRollsToday >= context.ipDailyRolls) return { ok: false, reason: "ip_limit" };
  if (context.suspiciousAccount) return { ok: false, reason: "new_account_cluster" };

  /* ── The draw ─────────────────────────────────────────────────────────────── */
  const draw = random();
  return { ok: true, won: draw < context.probability };
}

/**
 * Picks a riddle number in `1..count`, uniformly.
 *
 * Separate from the win/lose draw on purpose: using the *same* random value for both
 * would correlate "won" with "got the hard riddle", because a small draw is more
 * likely to land on riddle 1. Two independent draws cost nothing and remove the
 * correlation entirely.
 */
export function pickRiddleIndex(count: number, random: RandomSource = cryptoRandom()): number {
  if (count <= 1) return 1;
  const draw = random();
  return Math.min(count, Math.floor(draw * count) + 1);
}
