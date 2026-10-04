/**
 * The admin session cookie.
 *
 * ## Why a cookie exists at all
 *
 * `requireAdmin(request)` protects the **APIs**. It cannot protect the **page**: a
 * browser navigating to `/god-mode-admin` sends no `Authorization` header, so a server
 * component has no way to know who is asking. The two usual answers are both bad:
 *
 * - Render the console and gate it client-side. Then the page returns **200 with the
 *   full console markup** to anyone who asks, and hiding it with CSS is not security.
 * - Redirect to `/enter`. Same problem, plus it tells a prober the route exists.
 *
 * So after a successful admin check the server issues a short-lived, signed cookie, and
 * the page calls `notFound()` without one. A non-admin gets a genuine **404** — the
 * route does not exist as far as they are concerned.
 *
 * ## What this cookie is not
 *
 * It is not an authentication token and it grants nothing on its own. Every API still
 * re-verifies the Firebase ID token and re-reads `admins/{uid}`. The cookie only
 * decides whether the page renders. Revoking admin deletes the document, and the APIs
 * refuse immediately; the cookie merely stops the page from rendering until it expires.
 *
 * ## Why 15 minutes
 *
 * Long enough that an admin is not re-authenticating mid-task, short enough that a
 * shared machine does not keep offering the console. It is deliberately **not** a
 * "remember me": there is no long-lived variant of this cookie.
 */

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "miab_admin";
const TTL_SECONDS = 15 * 60;
const ISSUER = "mindinbox";
const AUDIENCE = "mindinbox:admin-page";

/**
 * Reuses the riddle signing secret's shape: an environment secret, no default.
 *
 * A missing secret means the page 404s for everyone, including a real admin. That is
 * the correct failure — a page that renders without a verifiable session is the thing
 * this whole module exists to prevent.
 */
function adminSecret(): string | null {
  const secret = process.env.ADMIN_PAGE_SECRET ?? process.env.RIDDLE_SIGNING_SECRET ?? process.env.ANON_SESSION_SECRET;
  if (typeof secret !== "string" || secret.trim().length < 32) return null;
  return secret;
}

/** Signs the page session for a uid that has *already* been verified as an admin. */
export async function issueAdminSession(uid: string, now = Date.now()): Promise<string> {
  const secret = adminSecret();
  if (!secret) throw new Error("ADMIN_PAGE_SECRET is not configured");
  const nowSec = Math.floor(now / 1000);

  return new SignJWT({ uid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(uid)
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + TTL_SECONDS)
    .sign(new TextEncoder().encode(secret));
}

/**
 * Whether a valid admin page session cookie is present.
 *
 * Never throws. A malformed cookie, a wrong signature, a missing secret — all are
 * simply "no", because the caller's only response to "no" is a 404.
 */
export async function hasAdminSession(now = Date.now()): Promise<boolean> {
  const secret = adminSecret();
  if (!secret) return false;

  let token: string | undefined;
  try {
    const jar = await cookies();
    token = jar.get(ADMIN_COOKIE)?.value;
  } catch {
    // `cookies()` throws when called outside a request scope, e.g. during a static
    // render. Treated as no session, which makes the page dynamic-only — correct.
    return false;
  }
  if (!token) return false;

  try {
    await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
      currentDate: new Date(now),
    });
    return true;
  } catch {
    return false;
  }
}

/** The uid behind a valid cookie, for display. `null` when there is not one. */
export async function adminSessionUid(now = Date.now()): Promise<string | null> {
  const secret = adminSecret();
  if (!secret) return null;

  try {
    const jar = await cookies();
    const token = jar.get(ADMIN_COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
      currentDate: new Date(now),
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Cookie attributes. `maxAge` is a convenience for the caller. */
export const ADMIN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
} as const;
