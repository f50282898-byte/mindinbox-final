import { jsonError } from "@/lib/ai/http";
import { authenticatedUser, requireUser } from "@/lib/auth/guards";
import { clientIp } from "@/lib/http";
import { log } from "@/lib/log";
import { getDocument } from "@/lib/google/firestore-rest";
import { readRiddleSettings } from "@/lib/riddle/settings";
import { pickRiddleIndex, rollOutcome } from "@/lib/riddle/roll";
import { newTokenId, signWinToken } from "@/lib/riddle/token";
import { riddleCount, riddlePhilosophers } from "@/lib/riddle/bank";
import { riddleSigningSecret } from "@/lib/riddle/secret";
import {
  budgetKeys,
  ipBucket,
  noteRoll,
  readBudget,
  readIpRolls,
  readPlayer,
  utcDayKey,
  writeIpRolls,
  writePlayer,
} from "@/lib/riddle/store";

export const runtime = "edge";

/**
 * `POST /api/riddle/roll` — the roll.
 *
 * ## Nothing here reaches the client except a yes or a no
 *
 * A losing reader gets `{ won: false }` and nothing more: not the probability, not
 * the remaining budget, not which guard stopped them. Every refusal reason is mapped
 * to the same flat `cooldown` response, because a prober who learns that the reason
 * was `daily_ceiling` learns the budget is nearly exhausted, and one who learns it was
 * `ip_limit` learns to wait. The specific reason goes to the server log only.
 *
 * The probability is read from `siteConfig/riddles` here and never sent down. There is
 * no `GET /api/riddle/config`, and adding one would be the single easiest way to end
 * this feature.
 *
 * ## Why the budget is checked before the draw
 *
 * `rollOutcome` takes the ceilings as arguments and refuses before it draws. That
 * ordering is what makes "a full purse stops granting immediately" true rather than
 * approximately true — see `roll.ts`.
 */

function ok(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/**
 * Every refusal looks the same from outside.
 *
 * Two distinct values rather than one, so the client can say "not yet" versus "come
 * back later" — which is honest — without learning which guard fired.
 */
const QUIET_REFUSAL = {
  cooldown: { won: false as const, retry: "later" as const },
  unavailable: { won: false as const, retry: "never" as const },
};

export async function POST(request: Request): Promise<Response> {
  const denied = await requireUser(request);
  if (denied) return denied;

  const user = authenticatedUser(request);
  const now = Date.now();

  /* ── A verified email is required. The prize is a real entitlement, and a
        throwaway address is how a prize gets farmed. ───────────────────────────── */
  if (!user.emailVerified) {
    log.info("riddle_roll_unverified_email");
    return ok(QUIET_REFUSAL.unavailable);
  }

  const secret = riddleSigningSecret();
  if (!secret) {
    // Fail closed, loudly. A deployment with no signing key must not run a lottery.
    log.error("riddle_signing_secret_missing");
    return jsonError({ ok: false, error: "unavailable" }, 503);
  }

  const [settings, player] = await Promise.all([
    readRiddleSettings((path) => getDocument(path)),
    readPlayer(user.uid, now),
  ]);

  if (!settings.enabled) {
    return ok(QUIET_REFUSAL.unavailable);
  }

  /* ── Budget and abuse state ────────────────────────────────────────────────── */
  const keys = budgetKeys(now);
  const [grantsToday, grantsThisMonth, bucket] = await Promise.all([
    readBudget(keys.day),
    readBudget(keys.month),
    // Hashed with the server secret, so the stored id cannot be walked back to an
    // address. Null when no secret — and then there is no IP counter at all.
    ipBucket(clientIp(request.headers) ?? "unknown", secret),
  ]);

  let ipCount = 0;
  if (bucket) {
    const read = await readIpRolls(bucket, utcDayKey(now));
    // Unreadable is treated as exhausted. An unknown IP count must not be a way to
    // roll without limit.
    ipCount = read ?? settings.ipDailyRolls;
  }

  /* ── A brand-new account is refused. Stated honestly below. ────────────────── */
  const authTimeSec = typeof user.claims.auth_time === "number" ? user.claims.auth_time : null;
  const accountAgeMs = authTimeSec === null ? Infinity : now - authTimeSec * 1000;
  const suspiciousAccount = accountAgeMs < 86_400_000;

  const result = rollOutcome(
    {
      probability: settings.probability,
      lastWinAt: player.lastWinAt,
      cooldownDays: settings.cooldownDays,
      grantsToday: Number.isFinite(grantsToday) ? grantsToday : settings.dailyGrantCeiling,
      grantsThisMonth: Number.isFinite(grantsThisMonth)
        ? grantsThisMonth
        : settings.monthlyGrantCeiling,
      dailyGrantCeiling: settings.dailyGrantCeiling,
      monthlyGrantCeiling: settings.monthlyGrantCeiling,
      ipRollsToday: ipCount,
      ipDailyRolls: settings.ipDailyRolls,
      recentRolls: player.recentRolls.filter((t) => t > now - 3_600_000).length,
      suspiciousAccount,
      now,
    }
    // Entropy comes from `crypto.getRandomValues` inside `rollOutcome`. There is no
    // parameter here a caller could use to influence the draw.
  );

  if (!result.ok) {
    // Reason to the log, never to the client.
    log.info("riddle_roll_refused", { reason: result.reason });
    return ok(QUIET_REFUSAL.cooldown);
  }

  /* ── Record the roll before returning, win or lose ───────────────────────────
     Counted unconditionally. A reader who rolls a hundred times must consume a
     hundred of their quota, or the soft barriers above are advisory only. */
  await writePlayer(noteRoll(player, now));
  if (bucket) {
    await writeIpRolls(bucket, utcDayKey(now), ipCount + 1).catch((err) => {
      log.error("riddle_ip_write_failed");
      void err;
    });
  }

  if (!result.won) {
    return ok({ won: false });
  }

  /* ── A win. Choose the riddle, then bind it into a token. ───────────────────── */
  const philosophers = riddlePhilosophers();
  // Two independent uniform draws. One for the philosopher, one for the number.
  // Reusing a single value would make "won" correlate with a particular riddle,
  // because a small draw always lands on the first philosopher.
  const philosopher = philosophers[pickRiddleIndex(philosophers.length) - 1] as string;
  const riddle = pickRiddleIndex(riddleCount(philosopher));

  const token = await signWinToken({
    secret,
    uid: user.uid,
    philosopher,
    riddle,
    jti: newTokenId(),
    now,
  });

  log.info("riddle_won", { philosopher });

  // The token and the number. Not the prompt, not the acceptance list, not the
  // resolution — those come from `/open`, after the token has been spent.
  return ok({ won: true, token, philosopher, riddle });
}
