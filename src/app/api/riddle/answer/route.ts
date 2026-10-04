import { z } from "zod";
import { jsonError } from "@/lib/ai/http";
import { authenticatedUser, requireUser } from "@/lib/auth/guards";
import { getDocument } from "@/lib/google/firestore-rest";
import { log } from "@/lib/log";
import { readRiddleSettings } from "@/lib/riddle/settings";
import { getRiddle, riddlePhilosophers } from "@/lib/riddle/bank";
import { verifyWinToken } from "@/lib/riddle/token";
import { riddleSigningSecret } from "@/lib/riddle/secret";
import { verifyAnswer } from "@/lib/riddle/verify";
import {
  budgetKeys,
  grantPrize,
  readBudget,
  readPlayer,
  spendBudget,
  tokenIsSpent,
  writePlayer,
} from "@/lib/riddle/store";

export const runtime = "edge";

/**
 * `POST /api/riddle/answer` — grades an answer and, on a win, pays the prize.
 *
 * ## Grading happens here and nowhere else
 *
 * The acceptance list never reaches the client. The reader sends prose and receives
 * `passed`, a short reason, and — only on success — the resolution.
 *
 * ## The budget is re-checked at award time, not at roll time
 *
 * A token lives ten minutes. The ceiling was checked when the roll happened, but a
 * budget can fill inside ten minutes, and paying out against a stale reading would
 * overshoot the ceiling by exactly the amount the reader is entitled to. So the
 * award path re-reads both counters and refuses if the purse is empty — the reader is
 * told the riddle was solved and that the prize is unavailable, which is unpleasant
 * but honest, and is the only way a hard ceiling stays hard.
 *
 * ## One prize per cooldown
 *
 * `prizePaid` on the player's document is set in the same write that records
 * `lastWinAt`. A reader who solves, then replays the same answer against a second
 * token, is refused at the `prizePaid` check.
 */

const bodySchema = z.object({
  token: z.string().min(10).max(4096),
  answer: z.string().min(1).max(2000),
});

function ok(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireUser(request);
  if (denied) return denied;

  const user = authenticatedUser(request);
  const now = Date.now();

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return jsonError({ ok: false, error: "bad_request" }, 400);
  }

  const secret = riddleSigningSecret();
  if (!secret) {
    log.error("riddle_signing_secret_missing");
    return jsonError({ ok: false, error: "unavailable" }, 503);
  }

  const verified = await verifyWinToken({
    secret,
    token: parsed.token,
    uid: user.uid,
    knownPhilosophers: riddlePhilosophers(),
    now,
  });
  if (!verified.ok) {
    log.info("riddle_answer_token_refused", { reason: verified.reason });
    return jsonError({ ok: false, error: verified.reason }, 401);
  }

  /* The token was already consumed by `/open`. Re-opening is refused by the same
     check, so an answer cannot be graded for a riddle this reader never saw. */
  if (!(await tokenIsSpent(verified.claims.jti))) {
    return jsonError({ ok: false, error: "not_opened" }, 409);
  }

  const riddle = getRiddle(verified.claims.philosopher, verified.claims.riddle);
  if (!riddle) {
    return jsonError({ ok: false, error: "bad_request" }, 400);
  }

  const [settings, player] = await Promise.all([
    readRiddleSettings((path) => getDocument(path)),
    readPlayer(user.uid, now),
  ]);
  if (!settings.enabled) {
    return jsonError({ ok: false, error: "unavailable" }, 503);
  }

  /* ── Attempts ─────────────────────────────────────────────────────────────────
     A different riddle resets the counter, so a reader who wins one and rolls again
     after the cooldown starts clean. */
  const sameRiddle = player.attemptRiddleId === riddle.id;
  const attemptsUsed = sameRiddle ? player.attemptsUsed : 0;

  if (attemptsUsed >= settings.attempts) {
    return jsonError({ ok: false, error: "no_attempts_left" }, 429);
  }

  const spentAttempts = attemptsUsed + 1;
  const verdict = verifyAnswer(riddle, parsed.answer);

  /* ── A wrong answer still costs an attempt ──────────────────────────────────
     Written before the verdict is returned, so a client that ignores the response
     and retries immediately cannot get free tries. */
  await writePlayer({
    ...player,
    attemptRiddleId: riddle.id,
    attemptsUsed: spentAttempts,
  });

  if (!verdict.passed) {
    log.info("riddle_answer_wrong", { riddleId: riddle.id, attemptsUsed: spentAttempts });
    return ok({
      ok: true,
      passed: false,
      // The reason names the reader's own confusion, never an unstated idea.
      reasonAr: verdict.reasonAr,
      attemptsLeft: Math.max(0, settings.attempts - spentAttempts),
    });
  }

  /* ── Correct. One prize per cooldown. ─────────────────────────────────────── */
  if (player.prizePaid && sameRiddle) {
    log.warn("riddle_prize_already_paid", { riddleId: riddle.id });
    return jsonError({ ok: false, error: "prize_already_claimed" }, 409);
  }

  /* ── Re-check the budget at award time ─────────────────────────────────────── */
  const keys = budgetKeys(now);
  const [grantsToday, grantsThisMonth] = await Promise.all([
    readBudget(keys.day),
    readBudget(keys.month),
  ]);

  const overBudget =
    !Number.isFinite(grantsToday) ||
    !Number.isFinite(grantsThisMonth) ||
    grantsToday >= settings.dailyGrantCeiling ||
    grantsThisMonth >= settings.monthlyGrantCeiling;

  if (overBudget) {
    // The reader solved it, and the prize cannot be paid. Said plainly rather than
    // silently downgraded, because a false "congratulations" is worse than a
    // disappointment with an explanation.
    log.warn("riddle_prize_budget_exhausted", {
      grantsToday: Number.isFinite(grantsToday) ? grantsToday : -1,
      grantsThisMonth: Number.isFinite(grantsThisMonth) ? grantsThisMonth : -1,
    });
    return ok({
      ok: true,
      passed: true,
      resolutionAr: riddle.resolutionAr,
      prize: null,
      prizeUnavailable: true,
    });
  }

  let expiresAt: number;
  try {
    const granted = await grantPrize({
      uid: user.uid,
      days: settings.prizeDays,
      riddleId: riddle.id,
      attemptsUsed: spentAttempts,
      now,
    });
    expiresAt = granted.expiresAt;
  } catch {
    log.error("riddle_prize_write_failed");
    return jsonError({ ok: false, error: "unavailable" }, 503);
  }

  // Counters after a successful spend, best-effort. A failure here does not undo the
  // prize — the grant is already written — but it does mean the ceiling is one win
  // optimistic, which the read-modify-write note in `store.ts` already accepts.
  await Promise.all([
    spendBudget(keys.day, grantsToday + 1).catch(() => log.error("riddle_budget_day_write_failed")),
    spendBudget(keys.month, grantsThisMonth + 1).catch(() =>
      log.error("riddle_budget_month_write_failed")
    ),
  ]);

  // `lastWinAt` starts the cooldown, and `prizePaid` blocks a second payout for the
  // same riddle. Written last, so a crash before this point leaves the reader able to
  // retry rather than silently having won nothing.
  await writePlayer({
    ...player,
    attemptRiddleId: riddle.id,
    attemptsUsed: spentAttempts,
    lastWinAt: now,
    prizePaid: true,
  });

  log.info("riddle_prize_granted", { riddleId: riddle.id, days: settings.prizeDays });

  return ok({
    ok: true,
    passed: true,
    resolutionAr: riddle.resolutionAr,
    prize: { tier: "oracle", days: settings.prizeDays, expiresAt },
  });
}
