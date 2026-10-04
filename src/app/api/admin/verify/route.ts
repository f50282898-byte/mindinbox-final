import { NextResponse } from "next/server";
import { requireUser, requireAdmin, authenticatedUser } from "@/lib/auth/guards";
import { ADMIN_COOKIE, ADMIN_COOKIE_OPTIONS, issueAdminSession } from "@/lib/admin/session";
import { log } from "@/lib/log";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Reports whether the caller is an admin, and issues the page session.
 *
 * Rewritten to use `requireUser` / `requireAdmin` from `src/lib/auth/guards`,
 * which verify the token with `jose` and then confirm that `admins/{uid}`
 * exists. The previous version trusted an `admin: true` custom claim, which
 * survives for up to an hour after the document is deleted.
 *
 * This endpoint only *reports* and *issues the page cookie*. Every privileged
 * mutation re-checks independently, so a `true` here — or the cookie it sets — is
 * never the thing that grants access to an API.
 *
 * ## Why the cookie is set here and nowhere else
 *
 * This is the one place where `admins/{uid}` has just been read and found. Issuing
 * the page session anywhere else would mean re-implementing the admin check, and the
 * whole point of a single chokepoint is that there is only one.
 *
 * A failure to sign is **not** reported as an admin failure. It means the deployment
 * is missing a secret, which is an operator problem, not a reader problem — so the
 * response is a 503 with a distinct code rather than a 403 that would read as
 * "you are not an admin" and send the operator hunting in the wrong place.
 */
export async function POST(request: Request) {
  const denied = await requireUser(request);
  if (denied) return denied;

  const { uid } = authenticatedUser(request);

  const forbidden = await requireAdmin(request);
  if (forbidden) {
    // requireAdmin already produced the correct 401/403 body; return it.
    return forbidden;
  }

  let cookieValue: string;
  try {
    cookieValue = await issueAdminSession(uid);
  } catch {
    log.error("admin_page_secret_missing");
    return NextResponse.json(
      {
        isAdmin: true,
        uid,
        error: "admin_page_unavailable",
        message: "تعذّر فتح جلسة اللوحة. راجع إعدادات الخادم.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const response = NextResponse.json(
    { isAdmin: true, uid, pageSession: true },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
  response.cookies.set(ADMIN_COOKIE, cookieValue, {
    ...ADMIN_COOKIE_OPTIONS,
    maxAge: 15 * 60,
  });
  return response;
}

/** Cheap liveness probe for the identity path. */
export async function GET(request: Request) {
  const denied = await requireUser(request);
  if (denied) return denied;

  const { uid, email, emailVerified } = authenticatedUser(request);
  return NextResponse.json(
    { uid, email, emailVerified },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
