/**
 * Anonymous usage sessions — server-authoritative free-tier metering.
 *
 * The 5-attempt limit used to live only in `localStorage`, so clearing storage
 * or calling `/api/ai` directly reset it. Attempts are now counted in an
 * HMAC-signed httpOnly cookie that the client cannot read or edit.
 *
 * What the signature DOES guarantee:
 *  - A tampered cookie is never honoured as a valid session. Editing `used`
 *    yields a fresh session, never a forged high quota.
 *  - The counter cannot be *inflated* while keeping a cookie, and the client
 *    cannot see or reset it without clearing cookies.
 *
 * What it does NOT guarantee (be honest about this):
 *  - Deleting the cookie yields a fresh 5-attempt session. Cookie-only metering
 *    is always clear-cookieable. It is a conversion device for the Gate, not
 *    an anti-abuse control.
 *  - With `ANON_SESSION_SECRET` unset the limit is not enforced at all;
 *    `GET /api/ai` reports `metering: "disabled"` so this is observable.
 *
 * Hard enforcement needs server-side state keyed to something the client
 * cannot discard — Cloudflare KV, a Durable Object, or simply requiring
 * sign-in for the AI surface. That is an infra decision, deliberately not
 * assumed here.
 *
 * Edge-safe: Web Crypto + Web Request cookies only.
 */

export interface AnonymousSession {
  /** Attempts already spent. */
  used: number;
  /** Epoch ms when the window rolls over. */
  expiresAt: number;
}

/** Attempts granted to an anonymous visitor before the Gate appears. */
export const FREE_ATTEMPT_LIMIT = 5;

/** Anonymous allowance window: 30 days. */
export const SESSION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export const ANON_COOKIE_NAME = "miab_anon";

const encoder = new TextEncoder();

function base64UrlFromBytes(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]);
  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : (globalThis as { Buffer: { from(s: string, e: string): { toString(e: string): string } } })
          .Buffer.from(binary, "binary")
          .toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  if (typeof atob === "function") {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }
  const globalBuffer = (globalThis as { Buffer?: { from(s: string, e: string): Uint8Array } }).Buffer;
  if (!globalBuffer) throw new Error("No base64url decoder available");
  return new Uint8Array(globalBuffer.from(padded, "base64"));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64UrlFromBytes(mac);
}

/** Constant-time comparison to avoid leaking signature bytes by timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function parseCookieHeader(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1);
  }
  return null;
}

/**
 * Resolve the anonymous session from a request.
 * Returns a fresh session when the cookie is absent, forged, or expired.
 */
export async function readSession(request: Request, secret: string): Promise<AnonymousSession> {
  const fresh: AnonymousSession = { used: 0, expiresAt: Date.now() + SESSION_WINDOW_MS };
  if (!secret) return fresh;

  const raw = parseCookieHeader(request.headers.get("cookie"), ANON_COOKIE_NAME);
  if (!raw) return fresh;

  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return fresh;
  const payloadPart = raw.slice(0, dot);
  const signaturePart = raw.slice(dot + 1);

  let expected: string;
  try {
    expected = await sign(payloadPart, secret);
  } catch {
    return fresh;
  }
  if (!timingSafeEqual(expected, signaturePart)) return fresh;

  let parsed: AnonymousSession;
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(payloadPart));
    const obj = JSON.parse(json) as Partial<AnonymousSession>;
    parsed = { used: Number(obj.used) || 0, expiresAt: Number(obj.expiresAt) || 0 };
  } catch {
    return fresh;
  }

  if (!parsed.expiresAt || parsed.expiresAt <= Date.now()) return fresh;
  return parsed;
}

/** Consume one attempt and produce the rotated cookie value + expiry. */
export async function spendAttempt(
  session: AnonymousSession,
  secret: string
): Promise<{ cookie: string | null; session: AnonymousSession }> {
  if (!secret) return { cookie: null, session };

  const next: AnonymousSession = {
    used: Math.max(0, Math.floor(session.used)) + 1,
    expiresAt: session.expiresAt > Date.now() ? session.expiresAt : Date.now() + SESSION_WINDOW_MS,
  };
  const payload = base64UrlFromBytes(
    encoder.encode(JSON.stringify({ used: next.used, expiresAt: next.expiresAt }))
  );
  const signature = await sign(payload, secret);
  return { cookie: `${payload}.${signature}`, session: next };
}

/** Attempts left in the current window. */
export function remainingAttempts(session: AnonymousSession): number {
  return Math.max(0, FREE_ATTEMPT_LIMIT - session.used);
}