import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, authenticatedUser } from "@/lib/auth/guards";
import { getAccessToken, serviceProjectId } from "@/lib/google/token";
import { log } from "@/lib/log";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Deletes the Firebase Auth account itself, over Identity Toolkit's REST API.
 *
 * The Client SDK can delete the *current* user, but only with a recent
 * re-authentication, and it cannot delete an account the browser merely claims
 * to be. Doing it here means the deletion is authorised by a verified ID token
 * and the service account, so it does not depend on client-side proof.
 *
 * Order matters and is enforced by the caller (`/account`): Firestore first
 * (see `DELETE /api/account`), then this. If this fails the user can still sign
 * in and retry; the reverse order would strand data with no way to reach it.
 *
 * Scope required on the service account: `firebaseauth.users.delete`.
 */

const DELETE_URL = "https://identitytoolkit.googleapis.com/v1/projects/{project}/accounts:delete";

const bodySchema = z.object({
  /** The caller must echo their own uid; guards against a stale tab. */
  uid: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  const denied = await requireUser(request);
  if (denied) return denied;

  const { uid } = authenticatedUser(request);

  let parsed: z.infer<typeof bodySchema>;
  try {
    const json: unknown = await request.json();
    parsed = bodySchema.parse(json);
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: "طلب غير صالح." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  // The token's uid is authoritative; a mismatch means the caller is acting on
  // a stale session and must re-authenticate.
  if (parsed.uid !== uid) {
    return NextResponse.json(
      { error: "uid_mismatch", message: "الجلسة قديمة. أعد تحميل الصفحة وحاول مجدداً." },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    );
  }

  const idToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!idToken) {
    return NextResponse.json(
      { error: "missing_token", message: "يلزم تسجيل الدخول للمتابعة." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const token = await getAccessToken();
  const project = serviceProjectId();
  if (!token || !project) {
    return NextResponse.json(
      { error: "server_unavailable", message: "تعذّر حذف الحساب الآن." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  let res: Response;
  try {
    res = await fetch(DELETE_URL.replace("{project}", project), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ localId: uid, idToken }),
    });
  } catch {
    log.error("auth_delete_unreachable");
    return NextResponse.json(
      { error: "server_unavailable", message: "تعذّر حذف الحساب الآن." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (res.status === 400 || res.status === 401) {
    // Typically an expired ID token. Recoverable by signing in again.
    return NextResponse.json(
      { error: "invalid_token", message: "انتهت صلاحية الجلسة. سجّل الدخول من جديد." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (res.status === 403) {
    return NextResponse.json(
      {
        error: "not_authorised",
        message: "حساب الخدمة لا يملك صلاحية حذف المستخدمين.",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!res.ok) {
    log.error("auth_delete_failed", { status: res.status });
    return NextResponse.json(
      { error: "delete_failed", message: "تعذّر حذف الحساب. حاول مرة أخرى." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  log.info("auth_account_deleted");

  return NextResponse.json(
    { ok: true },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
