import { NextResponse } from "next/server";
import { requireUser, authenticatedUser } from "@/lib/auth/guards";
import { getEntitlements } from "@/lib/entitlements";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Returns what the *verified* caller is entitled to.
 *
 * There is no uid parameter. The uid comes only from the verified ID token, so
 * there is nothing for a caller to tamper with and no way to ask about another
 * user's entitlements.
 */
export async function GET(request: Request) {
  const denied = await requireUser(request);
  if (denied) return denied;

  const { uid } = authenticatedUser(request);

  try {
    const entitlements = await getEntitlements(uid);
    return NextResponse.json(entitlements, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    // "Cannot determine entitlements" must never read as "everything allowed".
    return NextResponse.json(
      { error: "entitlements_unavailable", message: "تعذّر تحديد مستوى الحساب الآن." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
