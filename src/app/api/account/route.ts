import { NextResponse } from "next/server";
import { requireUser, authenticatedUser } from "@/lib/auth/guards";
import {
  deleteDocument,
  deleteSubcollections,
  getDocument,
  listDocuments,
} from "@/lib/google/firestore-rest";
import { log } from "@/lib/log";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Full export of everything stored about the caller.
 *
 * This is the data-portability half of the deletion flow: a user must be able
 * to take their data with them *before* deleting the account, so this route
 * must work independently and must never fail once deletion has begun.
 *
 * Server-authorised, not client-side, so the export reflects what is actually
 * stored — including documents the client SDK would be denied.
 */

/** Subcollections under `users/{uid}` that belong to the user. */
const USER_SUBCOLLECTIONS = ["days", "entries", "events", "puzzles"];

export async function GET(request: Request) {
  const denied = await requireUser(request);
  if (denied) return denied;

  const { uid, email } = authenticatedUser(request);

  const exportedAt = new Date().toISOString();
  const data: Record<string, unknown> = {};

  const profile = await getDocument<Record<string, unknown>>(`users/${uid}`);
  const subscription = await getDocument<Record<string, unknown>>(`subscriptions/${uid}`);
  const usage = await getDocument<Record<string, unknown>>(`usage/${uid}`);
  const admin = await getDocument<Record<string, unknown>>(`admins/${uid}`);

  data.account = { uid, email, exportedAt };
  data.profile = profile ?? null;
  data.subscription = subscription ?? null;
  data.usage = usage ?? null;
  // Present so a user can see *whether* they were an admin, not what it grants.
  data.admin = admin ? { isAdmin: true } : { isAdmin: false };

  for (const sub of USER_SUBCOLLECTIONS) {
    try {
      const docs = await listDocuments(`users/${uid}/${sub}`, 50);
      data[sub] = docs.map((d) => ({ id: d.name, ...d.data }));
    } catch {
      data[sub] = [];
    }
  }

  // Grants issued to this user, if any. Read across the collection by uid, so
  // failures here degrade to an empty list rather than failing the export.
  try {
    const grants = await listDocuments("grants", 20);
    data.grants = grants
      .filter((g) => (typeof g.data.uid === "string" ? g.data.uid === uid : g.name === uid))
      .map((g) => ({ id: g.name, ...g.data }));
  } catch {
    data.grants = [];
  }

  log.info("account_exported", { uid });

  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="mind-in-a-box-${uid}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Deletes every Firestore document belonging to the caller.
 *
 * Separate from deleting the Auth account on purpose: Firestore first, so a
 * failure here leaves the user able to sign in and retry, rather than being
 * locked out of an account whose data still exists.
 */
export async function DELETE(request: Request) {
  const denied = await requireUser(request);
  if (denied) return denied;

  const { uid } = authenticatedUser(request);

  // Explicit opt-in. Without it a stray DELETE — a crawler, a prefetch, a
  // mis-routed request — would destroy someone's account.
  const confirm = request.headers.get("x-confirm-delete");
  if (confirm !== uid) {
    return NextResponse.json(
      {
        error: "confirmation_required",
        message: "يلزم تأكيد الحذف.",
      },
      { status: 428, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    // Refuse to delete an admin account: it may be the last one, and
    // `admins/{uid}` has no owner to recreate it.
    const admin = await getDocument(`admins/${uid}`);
    if (admin) {
      return NextResponse.json(
        {
          error: "admin_protected",
          message: "لا يمكن حذف حساب إداري. تواصل مع المشرف أولاً.",
        },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    await deleteSubcollections(`users/${uid}`, USER_SUBCOLLECTIONS);
    await deleteDocument(`users/${uid}`);
    await deleteDocument(`subscriptions/${uid}`);
    await deleteDocument(`usage/${uid}`);

    log.info("account_data_deleted", { uid });

    return NextResponse.json(
      { ok: true, remaining: "auth" },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    log.error("account_data_delete_failed");
    return NextResponse.json(
      { error: "delete_failed", message: "تعذّر حذف البيانات. حاول مرة أخرى." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
