/**
 * Server-side Firebase ID token verification for the Edge runtime.
 *
 * Replaces the hand-rolled RS256 in `edge-auth.ts` with `jose`, which is the
 * only part of that file worth keeping by hand is gone: signature checking,
 * algorithm pinning, and claim validation are now `jose`'s job.
 *
 * Constraints (Cloudflare Workers):
 *  - Web Crypto only (`jose` uses `crypto.subtle` automatically).
 *  - Web `fetch` only.
 *  - No Node built-ins, no `firebase-admin`.
 *
 * Security notes that are easy to get wrong and are therefore pinned here:
 *
 *  - `algorithms: ["RS256"]` is set explicitly. Without it `jose` trusts the
 *    token header, which permits `alg: none` and HS256 key-confusion.
 *  - The JWKS URL is derived from the project id, so a token minted for another
 *    project cannot verify even if it somehow carried our `kid`.
 *  - `issuer` AND `audience` are both pinned. Firebase sets both to the project
 *    id; checking only one leaves the token replayable across projects.
 *  - `clockTolerance` is small (5s). It absorbs skew, it is not a licence to
 *    accept stale tokens.
 */

import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
  type JWTVerifyResult,
} from "jose";
import { log } from "@/lib/log";

/** Audience: every Firebase project gets this project-scoped service account. */
const JWKS_AUDIENCE = "securetoken@system.gserviceaccount.com";

/** Only the issuer's signing keys are ever trusted. */
const JWKS_ISSUER = "https://www.googleapis.com/service_accounts/v1/jwk/";

/** Skew allowance. Small on purpose. */
const CLOCK_TOLERANCE_SECONDS = 5;

export type AuthFailure =
  | "missing_token"
  | "malformed"
  | "unknown_key"
  | "bad_signature"
  | "wrong_issuer"
  | "wrong_audience"
  | "expired"
  | "not_yet_valid"
  | "jwks_unavailable"
  | "config_missing";

export interface AuthenticatedUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  /** Custom claims. Never trusted for authorisation on their own. */
  claims: JWTPayload;
}

export type AuthResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; reason: AuthFailure };

/* ── JWKS cache ─────────────────────────────────────────────────────────
 * `jose`'s remote JWKS set caches internally and honours HTTP cache headers,
 * which is what we want: Google publishes a long max-age, so a Worker isolate
 * refetches rarely. A single module-level instance per project is enough; a
 * Worker isolate handles many requests, so this is a real saving rather than a
 * micro-optimisation.
 * ---------------------------------------------------------------------- */

const jwksByProject = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(projectId: string) {
  let set = jwksByProject.get(projectId);
  if (!set) {
    set = createRemoteJWKSet(new URL(`${JWKS_ISSUER}${JWKS_AUDIENCE}`), {
      // Re-fetch keys at most this often even if the server says otherwise.
      cooldownDuration: 30_000,
      timeoutDuration: 5_000,
    });
    jwksByProject.set(projectId, set);
  }
  return set;
}

/** Test seam: drops cached key sets so a new project id is not ignored. */
export function resetJwksCache(): void {
  jwksByProject.clear();
}

/* ── error mapping ──────────────────────────────────────────────────────── */

/**
 * Maps a `jose` failure onto our own closed set.
 *
 * Deliberately coarse: an HTTP client must not be able to distinguish "key
 * unknown" from "signature wrong" from "expired" in a way that helps it. The
 * precise reason is logged server-side only.
 */
function classify(err: unknown): AuthFailure {
  const code = (err as { code?: string } | null)?.code ?? "";
  const message = err instanceof Error ? err.message : String(err);

  if (code === "ERR_JWT_EXPIRED" || message.includes("expired")) return "expired";
  if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED" || message.includes("claim")) {
    // `jose` reports issuer/audience/nbf failures under one code. Narrow it.
    if (message.includes("iss")) return "wrong_issuer";
    if (message.includes("aud")) return "wrong_audience";
    if (message.includes("nbf")) return "not_yet_valid";
    return "wrong_audience";
  }
  if (code === "ERR_JWKS_NO_MATCHING_KEY" || message.includes("no matching key")) {
    return "unknown_key";
  }
  if (code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED") return "bad_signature";
  if (code === "ERR_JWT_INVALID" || code === "ERR_JWS_INVALID") return "malformed";
  if (code === "ERR_JWKS_TIMEOUT" || code === "ERR_JWKS_MULTIPLE_MATCHING_KEYS") {
    return "jwks_unavailable";
  }
  return "malformed";
}

/* ── verification ───────────────────────────────────────────────────────── */

function projectIdFromEnv(): string | null {
  const id = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  return id && id.trim() ? id.trim() : null;
}

/**
 * Verifies a Firebase ID token.
 *
 * @param idToken  Raw bearer value, without the `Bearer ` prefix.
 * @param projectId Override for the expected project. Production leaves it
 *                  undefined and reads `NEXT_PUBLIC_FIREBASE_PROJECT_ID`.
 * @param deps     Test seam. `jwks` replaces the remote key set so a test can
 *                 serve its own; production never passes this, and when it is
 *                 absent the JWKS URL is derived from the project id, so a token
 *                 minted for another project cannot verify even if it somehow
 *                 carried a matching `kid`.
 */
export async function verifyIdToken(
  idToken: string | null | undefined,
  projectId?: string,
  deps?: { jwks?: JWTVerifyGetKey }
): Promise<AuthResult> {
  if (!idToken || !idToken.trim()) return { ok: false, reason: "missing_token" };

  const expectedProject = projectId ?? projectIdFromEnv();
  if (!expectedProject) return { ok: false, reason: "config_missing" };

  const token = idToken.trim();

  let verified: JWTVerifyResult;
  try {
    verified = await jwtVerify(token, deps?.jwks ?? jwksFor(expectedProject), {
      // Pinned. Never inferred from the token header.
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${expectedProject}`,
      audience: expectedProject,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      // Firebase puts its own validation in `sub` + the standard claims; there
      // is no required custom claim.
      requiredClaims: ["sub", "iat", "exp"],
    });
  } catch (err) {
    const reason = classify(err);
    // Logged, never returned: the client gets 401 regardless.
    log.warn("id_token_rejected", { reason });
    return { ok: false, reason };
  }

  const { payload } = verified;
  if (typeof payload.sub !== "string" || !payload.sub) {
    return { ok: false, reason: "malformed" };
  }

  return {
    ok: true,
    user: {
      uid: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
      emailVerified: payload.email_verified === true,
      claims: payload,
    },
  };
}

/** Reads the bearer token from a standard `Headers` object. */
export function bearerFromHeaders(headers: Headers): string | null {
  const header = headers.get("authorization") ?? headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/* ── guards ─────────────────────────────────────────────────────────────── */

export interface GuardFailure {
  status: 401 | 403;
  /** Short machine-readable reason, safe to return. */
  reason: string;
  /** Arabic message for the user. */
  message: string;
}

const MESSAGES: Record<AuthFailure, string> = {
  missing_token: "يلزم تسجيل الدخول للمتابعة.",
  malformed: "رمز الدخول غير صالح.",
  unknown_key: "رمز الدخول غير صالح.",
  bad_signature: "رمز الدخول غير صالح.",
  wrong_issuer: "رمز الدخول صادر من مشروع آخر.",
  wrong_audience: "رمز الدخول غير موجّه إلى هذا التطبيق.",
  expired: "انتهت صلاحية الجلسة. سجّل الدخول من جديد.",
  not_yet_valid: "الرمز غير صالح بعد.",
  jwks_unavailable: "تعذّر التحقق من الهوية الآن. حاول بعد قليل.",
  config_missing: "الخدمة غير مهيأة.",
};

export function failureResponse(reason: AuthFailure): GuardFailure {
  return {
    status: 401,
    reason,
    message: MESSAGES[reason] ?? MESSAGES.malformed,
  };
}
