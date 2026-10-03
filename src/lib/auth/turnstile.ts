/**
 * Cloudflare Turnstile verification (server side).
 *
 * The widget on the client proves nothing on its own — its response token is
 * what matters, and only this module can check it. Every token is single-use
 * and expires in 5 minutes, so it is exchanged exactly once, immediately.
 *
 * Failure modes handled explicitly, because each one means something different:
 *  - token missing        → the client did not run the widget at all
 *  - invalid/expired      → forged, replayed, or stale token
 *  - missing secret key   → server misconfigured; must fail CLOSED, never open
 *  - fetch failure        → cannot reach Cloudflare; must fail CLOSED
 */

import { log } from "@/lib/log";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "invalid" | "unconfigured" | "unreachable" };

function secretFromEnv(): string | null {
  // Deliberately NOT `NEXT_PUBLIC_`: the secret must never reach the bundle.
  const secret =
    process.env.TURNSTILE_SECRET_KEY ?? process.env.CF_TURNSTILE_SECRET_KEY ?? "";
  return secret.trim() || null;
}

/**
 * Verifies a Turnstile response token.
 *
 * @param token    The `cf-turnstile-response` value from the client.
 * @param remoteIp Optional client IP, forwarded for Turnstile's own scoring.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp?: string | null
): Promise<TurnstileResult> {
  if (!token || !token.trim()) return { ok: false, reason: "missing" };

  const secret = secretFromEnv();
  if (!secret) {
    log.error("turnstile_secret_missing");
    return { ok: false, reason: "unconfigured" };
  }

  const body = new URLSearchParams({ secret, response: token.trim() });
  if (remoteIp) body.set("remoteip", remoteIp);

  let res: Response;
  try {
    res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    log.error("turnstile_unreachable");
    return { ok: false, reason: "unreachable" };
  }

  if (!res.ok) {
    log.error("turnstile_status", { status: res.status });
    return { ok: false, reason: "unreachable" };
  }

  let json: { success?: unknown; "error-codes"?: unknown };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    log.error("turnstile_bad_response");
    return { ok: false, reason: "unreachable" };
  }

  if (json.success !== true) {
    // Codes are logged but never returned: they describe our configuration as
    // much as the client's behaviour.
    const codes = Array.isArray(json["error-codes"]) ? (json["error-codes"] as string[]) : [];
    log.warn("turnstile_rejected", { codes: codes.join(",") || "unknown" });
    return { ok: false, reason: "invalid" };
  }

  return { ok: true };
}

/** True when the server can actually verify tokens. Used to gate the widget. */
export function turnstileConfigured(): boolean {
  return secretFromEnv() !== null;
}

/**
 * Best-effort client IP for Turnstile scoring.
 *
 * Cloudflare sets `CF-Connecting-IP`. On other hosts this is absent, and we
 * simply omit it — Turnstile works without it.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const ip = headers.get("cf-connecting-ip") ?? headers.get("x-real-ip");
  return ip && /^[\d.:a-f]{3,45}$/i.test(ip) ? ip : null;
}
