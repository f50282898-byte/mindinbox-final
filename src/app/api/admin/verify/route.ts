import { NextResponse } from "next/server";
import { bearerFromHeaders, verifyIdToken } from "@/lib/edge-auth";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Reports whether the caller's ID token carries the `admin: true` custom claim.
 *
 * This endpoint only *reports*. Every privileged mutation lives behind
 * `/api/admin/*`, which re-verifies the token independently — a `false` here
 * must never be the sole control, and a `true` here is never trusted for
 * authorisation.
 */
export async function POST(request: Request) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!projectId) {
    return NextResponse.json(
      { error: "المشروع غير مهيأ: Firebase project id مفقود." },
      { status: 503 }
    );
  }

  const result = await verifyIdToken(bearerFromHeaders(request.headers), projectId);

  if (!result.ok) {
    return NextResponse.json(
      { isAdmin: false, reason: result.reason },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { isAdmin: result.token.isAdmin, uid: result.token.uid },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}