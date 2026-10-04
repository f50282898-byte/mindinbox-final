import { z } from "zod";
import { jsonError } from "@/lib/ai/http";
import { authenticatedUser, requireUser } from "@/lib/auth/guards";
import { clientIpFromHeaders, verifyTurnstile } from "@/lib/auth/turnstile";
import { getDocument } from "@/lib/google/firestore-rest";
import { log } from "@/lib/log";
import { readRiddleSettings } from "@/lib/riddle/settings";
import { getRiddle, riddlePhilosophers } from "@/lib/riddle/bank";
import { verifyWinToken } from "@/lib/riddle/token";
import { riddleSigningSecret } from "@/lib/riddle/secret";
import { markTokenSpent, readPlayer, tokenIsSpent, writePlayer } from "@/lib/riddle/store";

export const runtime = "edge";

/**
 * `POST /api/riddle/open` — spends a win token and returns the riddle.
 *
 * ## Why this route exists at all
 *
 * The riddle could have been returned by `/roll` in the same response. Splitting them
 * buys two things:
 *
 * 1. **Single use.** The token is spent here, before the riddle is looked up. A
 *    captured token cannot be replayed for the same riddle, which is the only
 *    protection a stateless signature gives you.
 * 2. **Turnstile at redemption.** Abuse control belongs where the value is, and the
 *    value is the riddle — not the roll. A reader who loses rolls is not a problem.
 *
 * ## What leaves the server
 *
 * The prompt, the guidance, the philosopher's name, and how many attempts remain.
 * Never the acceptance list, never the resolution, never the probability. The
 * acceptance list is the answer; shipping it would make the verifier decorative.
 */

const bodySchema = z.object({
  token: z.string().min(10).max(4096),
  turnstileToken: z.string().max(2048).optional(),
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

  /* ── Turnstile, failing closed ───────────────────────────────────────────────
     Unconfigured is a refusal, not a pass. That is the same rule as signup, and it
     is deliberately inconvenient: a riddle behind an open endpoint is a riddle
     behind an open endpoint. */
  const turnstile = await verifyTurnstile(
    parsed.turnstileToken ?? null,
    clientIpFromHeaders(request.headers)
  );
  if (!turnstile.ok) {
    log.warn("riddle_open_turnstile_failed", { reason: turnstile.reason });
    return jsonError({ ok: false, error: "unavailable" }, 503);
  }

  /* ── The token ────────────────────────────────────────────────────────────── */
  const verified = await verifyWinToken({
    secret,
    token: parsed.token,
    uid: user.uid,
    knownPhilosophers: riddlePhilosophers(),
    now,
  });

  if (!verified.ok) {
    // Reason to the log. `expired` is the common honest case — a reader who walked
    // away — and it must not be logged as a forgery.
    log.info("riddle_open_token_refused", { reason: verified.reason });
    return jsonError({ ok: false, error: verified.reason }, 401);
  }

  /* ── Single use, checked before the riddle is looked up ─────────────────────
     `tokenIsSpent` returns true when it cannot prove otherwise, so a Firestore
     outage refuses the redemption rather than permitting an unbounded one. */
  if (await tokenIsSpent(verified.claims.jti)) {
    log.info("riddle_open_token_replayed");
    return jsonError({ ok: false, error: "already_used" }, 409);
  }

  const riddle = getRiddle(verified.claims.philosopher, verified.claims.riddle);
  if (!riddle) {
    // Unreachable: the token's philosopher was validated against the same bank.
    // Treated as a malformed token rather than a server fault, because from the
    // outside those are indistinguishable and this leaks less.
    return jsonError({ ok: false, error: "bad_request" }, 400);
  }

  const [settings, player] = await Promise.all([
    readRiddleSettings((path) => getDocument(path)),
    readPlayer(user.uid, now),
  ]);

  if (!settings.enabled) {
    return jsonError({ ok: false, error: "unavailable" }, 503);
  }

  /* ── Attempts are per riddle, not per session ────────────────────────────────
     Opening the page again must not hand back three tries, so the counter lives on
     the player's document and resets only when the riddle id changes. */
  const sameRiddle = player.attemptRiddleId === riddle.id;
  const attemptsUsed = sameRiddle ? player.attemptsUsed : 0;

  if (attemptsUsed >= settings.attempts) {
    return jsonError({ ok: false, error: "no_attempts_left" }, 429);
  }

  await markTokenSpent(verified.claims.jti, user.uid, now);

  if (!sameRiddle) {
    await writePlayer({ ...player, attemptRiddleId: riddle.id, attemptsUsed: 0, prizePaid: false });
  }

  return ok({
    ok: true,
    riddle: {
      id: riddle.id,
      philosopherId: riddle.philosopherId,
      philosopherAr: riddle.philosopherAr,
      promptAr: riddle.promptAr,
      guidanceAr: riddle.guidanceAr,
    },
    attemptsLeft: settings.attempts - attemptsUsed,
  });
}
