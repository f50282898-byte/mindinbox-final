/**
 * Request guards for edge route handlers.
 *
 * `requireUser()`  — the caller presented a cryptographically valid Firebase
 *                    ID token for *this* project.
 * `requireAdmin()` — additionally, `admins/{uid}` exists.
 *
 * The admin definition is deliberately a document's existence rather than a
 * custom claim. A claim is minted at token-issuing time and only refreshes when
 * the user's token is refreshed, so revoking an admin by deleting the document
 * would leave a valid token usable for up to an hour. Reading the document on
 * each request makes revocation immediate — the cost is one Firestore read,
 * which is the right trade for an identity check.
 *
 * Every guard returns a `NextResponse` on failure and `null` on success, so a
 * handler reads as:
 *
 *   const denied = await requireAdmin(request);
 *   if (denied) return denied;
 */

import { NextResponse } from "next/server";
import {
  bearerFromHeaders,
  failureResponse,
  verifyIdToken,
  type AuthenticatedUser,
} from "@/lib/auth/server";
import { getDocument } from "@/lib/google/firestore-rest";
import { adminConfigured } from "@/lib/google/token";
import { log } from "@/lib/log";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Every auth failure is a flat 401. Never leak *why* a token was rejected. */
function jsonError(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** Extracts and verifies the caller. Returns `null` when the caller is valid. */
export async function requireUser(request: Request): Promise<NextResponse | null> {
  const token = bearerFromHeaders(request.headers);

  if (!token) {
    return jsonError(401, { error: "missing_token", message: "يلزم تسجيل الدخول للمتابعة." });
  }

  const result = await verifyIdToken(token);
  if (!result.ok) {
    const failure = failureResponse(result.reason);
    return jsonError(failure.status, { error: failure.reason, message: failure.message });
  }

  // Attach the verified identity for the handler. Read-only property, so a
  // handler cannot overwrite it with client-supplied data by accident.
  Object.defineProperty(request, AUTHENTICATED, {
    value: result.user satisfies AuthenticatedUser,
    enumerable: false,
    configurable: true,
  });

  return null;
}

/** As `requireUser`, but fails if the caller is not an admin. */
export async function requireAdmin(request: Request): Promise<NextResponse | null> {
  const denied = await requireUser(request);
  if (denied) return denied;

  const user = authenticatedUser(request);
  if (!user) {
    // Unreachable: requireUser attached it. Treated as a failure anyway.
    return jsonError(401, { error: "missing_token", message: "يلزم تسجيل الدخول للمتابعة." });
  }

  if (!adminConfigured()) {
    // Fail closed. No credentials means we cannot prove admin rights, and
    // "cannot verify" must never degrade into "allowed".
    log.error("admin_check_unconfigured");
    return jsonError(503, {
      error: "server_unavailable",
      message: "تعذّر التحقق من الصلاحيات الآن.",
    });
  }

  let adminDoc: unknown;
  try {
    adminDoc = await getDocument(`admins/${user.uid}`);
  } catch {
    // An unreachable Firestore is not an authorisation pass.
    log.error("admin_check_failed");
    return jsonError(503, {
      error: "server_unavailable",
      message: "تعذّر التحقق من الصلاحيات الآن.",
    });
  }

  if (!adminDoc) {
    return jsonError(403, { error: "forbidden", message: "هذه الصفحة ليست لك." });
  }

  return null;
}

const AUTHENTICATED = Symbol.for("miab.authenticated");

/**
 * Reads the identity attached by `requireUser`.
 *
 * Throws if called before a guard ran — that is a programming error, and a
 * silent `null` here would let a handler proceed with no identity at all.
 */
export function authenticatedUser(request: Request): AuthenticatedUser {
  const user = (request as unknown as Record<symbol, AuthenticatedUser>)[AUTHENTICATED];
  if (!user) {
    throw new Error(
      "authenticatedUser() called without requireUser()/requireAdmin() in this handler"
    );
  }
  return user;
}

/** Non-throwing variant, for handlers that want to branch instead of failing. */
export function tryAuthenticatedUser(request: Request): AuthenticatedUser | null {
  return (request as unknown as Record<symbol, AuthenticatedUser>)[AUTHENTICATED] ?? null;
}
