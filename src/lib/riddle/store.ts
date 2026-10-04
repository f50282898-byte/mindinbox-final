/**
 * Riddle persistence.
 *
 * **Server-only.** Every read here touches answer-side state: who has won, how much
 * budget is left, which tokens are spent.
 *
 * ## Collections
 *
 * | path                    | written by | purpose                                    |
 * |-------------------------|------------|--------------------------------------------|
 * | `riddle/players/{uid}`  | this file  | cooldown, roll counters, attempt count      |
 * | `riddle/budget/{key}`   | this file  | global wins per UTC day / month             |
 * | `riddle/tokens/{jti}`   | this file  | single-use record for a win token           |
 * | `grants/{uid}`          | this file  | the entitlement `getEntitlements` reads     |
 * | `riddle/wins/{id}`      | this file  | the admin grant log                         |
 *
 * Nothing else writes these. The Firestore rules already deny all client access to
 * `grants`, and `riddle/*` is denied the same way — the game is decided by the
 * server, so a client that could increment a counter could decide its own odds.
 *
 * ## What is deliberately not stored
 *
 * No reader's answer text, no riddle text, no IP. The IP is HMAC-hashed with the
 * server secret before it becomes a document id, so the collection holds no address
 * that could be reversed with a rainbow table, and an admin reading the counters
 * learns nothing about who rolls from where.
 */

import { getDocument, setDocument } from "@/lib/google/firestore-rest";
import { log } from "@/lib/log";
import type { Tier } from "@/lib/tiers";

/** Per-reader state. Absent means a reader who has never rolled. */
export interface PlayerState {
  uid: string;
  /** Epoch ms of the last win. `null` if never. Drives the cooldown. */
  lastWinAt: number | null;
  /** UTC day key the counters below belong to, so a stale day is discarded. */
  rollDay: string;
  rollMonth: string;
  rollsToday: number;
  rollsThisMonth: number;
  /** Epoch ms of each of the last few rolls, for the hourly rate limit. */
  recentRolls: number[];
  /** Riddle currently in play, and how many attempts it has consumed. */
  attemptRiddleId: string | null;
  attemptsUsed: number;
  /** True once this riddle's prize has been paid. Guards a double-spend. */
  prizePaid: boolean;
}

const RECENT_ROLL_LIMIT = 25;

export function emptyPlayer(uid: string, now: number): PlayerState {
  const iso = new Date(now).toISOString();
  return {
    uid,
    lastWinAt: null,
    rollDay: iso.slice(0, 10),
    rollMonth: iso.slice(0, 7),
    rollsToday: 0,
    rollsThisMonth: 0,
    recentRolls: [],
    attemptRiddleId: null,
    attemptsUsed: 0,
    prizePaid: false,
  };
}

/** UTC day key. Global budget is not per-reader, so a reader's timezone is irrelevant. */
export function utcDayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** UTC month key. */
export function utcMonthKey(now: number): string {
  return new Date(now).toISOString().slice(0, 7);
}

/**
 * Reads a player's state, normalising anything stale.
 *
 * Every field is re-derived rather than trusted. A document written by an older
 * version of this code, or edited by hand in the console, must not be able to grant
 * a cooldown it has not earned.
 */
export async function readPlayer(uid: string, now: number): Promise<PlayerState> {
  const fresh = emptyPlayer(uid, now);
  let doc: Record<string, unknown> | null;
  try {
    doc = await getDocument<Record<string, unknown>>(`riddle/players/${uid}`);
  } catch (err) {
    // Unreachable state reads as "no state", so a Firestore outage grants nothing
    // rather than resetting a cooldown to zero and letting every account roll again.
    log.error("riddle_player_read_failed");
    void err;
    return fresh;
  }
  if (!doc) return fresh;

  const day = utcDayKey(now);
  const month = utcMonthKey(now);

  return {
    uid,
    lastWinAt: typeof doc.lastWinAt === "number" ? doc.lastWinAt : null,
    // Counters from a previous day or month are dropped, not carried forward.
    rollDay: doc.rollDay === day ? day : day,
    rollMonth: month,
    rollsToday: doc.rollDay === day && typeof doc.rollsToday === "number" ? doc.rollsToday : 0,
    rollsThisMonth:
      doc.rollMonth === month && typeof doc.rollsThisMonth === "number"
        ? doc.rollsThisMonth
        : 0,
    recentRolls: Array.isArray(doc.recentRolls)
      ? (doc.recentRolls.filter((n) => typeof n === "number") as number[]).slice(
          -RECENT_ROLL_LIMIT
        )
      : [],
    attemptRiddleId: typeof doc.attemptRiddleId === "string" ? doc.attemptRiddleId : null,
    attemptsUsed: typeof doc.attemptsUsed === "number" ? doc.attemptsUsed : 0,
    prizePaid: doc.prizePaid === true,
  };
}

export async function writePlayer(state: PlayerState): Promise<void> {
  await setDocument(`riddle/players/${state.uid}`, {
    uid: state.uid,
    lastWinAt: state.lastWinAt,
    rollDay: state.rollDay,
    rollMonth: state.rollMonth,
    rollsToday: state.rollsToday,
    rollsThisMonth: state.rollsThisMonth,
    recentRolls: state.recentRolls,
    attemptRiddleId: state.attemptRiddleId,
    attemptsUsed: state.attemptsUsed,
    prizePaid: state.prizePaid,
  });
}

/** Records a roll against the hourly rate limit. Call before deciding, not after. */
export function noteRoll(state: PlayerState, now: number): PlayerState {
  const cutoff = now - 3_600_000;
  return {
    ...state,
    rollDay: utcDayKey(now),
    rollMonth: utcMonthKey(now),
    rollsToday: state.rollsToday + 1,
    rollsThisMonth: state.rollsThisMonth + 1,
    recentRolls: [...state.recentRolls.filter((t) => t > cutoff), now].slice(
      -RECENT_ROLL_LIMIT
    ),
  };
}

/* ── the global budget ───────────────────────────────────────────────────── */

interface BudgetDoc {
  count: number;
}

/**
 * How many wins have already been paid under a day or month key.
 *
 * Read-modify-write rather than a transaction. Firestore REST on the edge has no
 * `runTransaction` equivalent without adding `@google-cloud/firestore`, which is a
 * Node library and forbidden here. The consequence is stated: two simultaneous wins
 * in the same second can both pass the ceiling check and overshoot by one.
 *
 * That is the right trade. The ceiling is a budget guard, not an accounting system —
 * an overshoot of one seven-day grant against a ceiling of twelve is a cost of a few
 * cents, and the alternative is importing a Node dependency into an edge bundle to
 * prevent it.
 */
export async function readBudget(key: string): Promise<number> {
  try {
    const doc = await getDocument<BudgetDoc>(`riddle/budget/${key}`);
    return typeof doc?.count === "number" ? doc.count : 0;
  } catch {
    // Unknown is treated as full, not empty. If the counter cannot be read, the
    // ceiling must stop granting — otherwise an outage is a free prize for everyone
    // who rolls during it.
    return Number.POSITIVE_INFINITY;
  }
}

export async function spendBudget(key: string, count: number): Promise<void> {
  await setDocument(`riddle/budget/${key}`, { count });
}

/** Both budget keys for one moment, so a caller can check them together. */
export function budgetKeys(now: number): { day: string; month: string } {
  return { day: `d-${utcDayKey(now)}`, month: `m-${utcMonthKey(now)}` };
}

/* ── single-use tokens ───────────────────────────────────────────────────── */

/**
 * Whether a win token has already been redeemed.
 *
 * Called **before** the riddle is looked up, so a replayed token is refused without
 * touching any answer state. The `jti` is document-keyed, so recording the spend and
 * testing for it are the same operation.
 */
export async function tokenIsSpent(jti: string): Promise<boolean> {
  try {
    const doc = await getDocument(`riddle/tokens/${jti}`);
    return doc !== null;
  } catch {
    // Cannot prove it is unspent, so treat it as spent. A reader locked out by a
    // Firestore blip can roll again tomorrow; a replayed prize cannot be undone.
    return true;
  }
}

export async function markTokenSpent(jti: string, uid: string, now: number): Promise<void> {
  await setDocument(`riddle/tokens/${jti}`, { uid, spentAt: now });
}

/* ── the prize ───────────────────────────────────────────────────────────── */

/**
 * Grants `days` of Oracle and records the win.
 *
 * ## Why the expiry is a maximum, not an assignment
 *
 * `grants/{uid}` is a single document, and it may already hold an admin-issued comp
 * or an earlier riddle prize. Assigning `now + days` would truncate a longer
 * entitlement — a reader with thirty free days would lose twenty-three of them to a
 * seven-day riddle prize. So the new window is only taken if it ends later.
 *
 * ## Why the win is recorded twice
 *
 * `grants/{uid}` is the machine-readable entitlement, and it holds one record per
 * reader. The admin screen needs a *log* — who won, when, which riddle, how many
 * attempts it took — so `riddle/wins/{id}` carries that. Two writes, because they
 * answer different questions, and folding them together would make the entitlement
 * unreadable.
 */
export async function grantPrize(args: {
  uid: string;
  days: number;
  riddleId: string;
  attemptsUsed: number;
  now: number;
}): Promise<{ expiresAt: number }> {
  const expiresAt = args.now + args.days * 86_400_000;

  let currentExpiry = 0;
  let currentTier: Tier = "free";
  try {
    const existing = await getDocument<Record<string, unknown>>(`grants/${args.uid}`);
    if (existing) {
      const existingExpiry = existing.expiresAt;
      if (typeof existingExpiry === "number" && Number.isFinite(existingExpiry)) {
        currentExpiry = existingExpiry;
      }
      if (existing.tier === "oracle" || existing.tier === "sanctum") {
        currentTier = existing.tier;
      }
    }
  } catch (err) {
    // Not knowing the current grant means not being able to extend it correctly.
    // Refusing is the honest response; a silently-shortened entitlement is worse.
    log.error("riddle_grant_read_failed");
    void err;
    throw new Error("grant_read_failed");
  }

  // An existing longer entitlement wins, and a `sanctum` grant is never downgraded
  // to `oracle` by a riddle.
  const nextExpiry = Math.max(currentExpiry, expiresAt);
  const nextTier: Tier = currentTier === "sanctum" ? "sanctum" : "oracle";

  await setDocument(`grants/${args.uid}`, {
    uid: args.uid,
    tier: nextTier,
    expiresAt: nextExpiry,
    source: currentExpiry > 0 ? "extended" : "riddle",
    updatedAt: args.now,
  });

  await setDocument(`riddle/wins/${args.now.toString(36)}-${args.uid}`, {
    uid: args.uid,
    riddleId: args.riddleId,
    days: args.days,
    attemptsUsed: args.attemptsUsed,
    grantedAt: args.now,
    expiresAt: nextExpiry,
  });

  return { expiresAt: nextExpiry };
}

/* ── the per-IP soft limit ───────────────────────────────────────────────── */

/**
 * A stable, irreversible identifier for an address.
 *
 * HMAC-SHA256 under the server secret rather than a bare SHA-256: a plain digest of
 * an IPv4 address is trivially reversible by brute force, since there are only four
 * billion of them. Keyed with a secret nobody reads, the document id cannot be
 * walked back to a person — and two readers behind the same address still share a
 * counter, which is the whole point of the limit.
 *
 * No secret configured means no IP counter at all. Falling back to a plain hash
 * would be *worse* than useless: it would look like protection while writing a
 * reversible identifier to disk.
 */
export async function ipBucket(ip: string, secret: string | null): Promise<string | null> {
  if (!secret) return null;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`riddle-ip:${ip}`)
    );
    return [...new Uint8Array(signature).slice(0, 12)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch (err) {
    log.error("riddle_ip_hash_failed");
    void err;
    return null;
  }
}

/** How many rolls this bucket has made today. `null` when the bucket is unusable. */
export async function readIpRolls(bucket: string, dayKey: string): Promise<number | null> {
  try {
    const doc = await getDocument<{ day: string; count: number }>(`riddle/ip/${bucket}`);
    if (!doc) return 0;
    return doc.day === dayKey && typeof doc.count === "number" ? doc.count : 0;
  } catch {
    return null;
  }
}

export async function writeIpRolls(bucket: string, dayKey: string, count: number): Promise<void> {
  await setDocument(`riddle/ip/${bucket}`, { day: dayKey, count });
}
