import { NextResponse } from "next/server";
import { requireUser, requireAdmin, authenticatedUser } from "@/lib/auth/guards";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Reports whether the caller is an admin, and why not when they are not.
 *
 * Rewritten to use `requireUser` / `requireAdmin` from `src/lib/auth/guards`,
 * which verify the token with `jose` and then confirm that `admins/{uid}`
 * exists. The previous version trusted an `admin: true` custom claim, which
 * survives for up to an hour after the document is deleted.
 *
 * This endpoint only *reports*. Every privileged mutation re-checks
 * independently, so a `true` here is never the thing that grants access.
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

  return NextResponse.json({ isAdmin: true, uid }, { status: 200, headers: { "Cache-Control": "no-store" } });
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
