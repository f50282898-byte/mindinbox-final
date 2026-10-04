import { NextResponse } from "next/server";
import { authenticatedUser, requireAdmin } from "@/lib/auth/guards";
import { recordWrite } from "@/lib/admin/audit";
import { readPublished, undoLastPublish } from "@/lib/admin/site-store";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * `POST /api/admin/site/undo` — restore the previous published version.
 *
 * Undo is itself an audited write with its own before/after, and it does **not**
 * consume a history slot. An admin who publishes, undoes, and publishes again must
 * still be able to undo back to where they started — a redo stack that undoes do not
 * push onto would make that impossible.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const admin = authenticatedUser(request);

  const before = await readPublished().catch(() => null);
  const result = await undoLastPublish({});

  if (!result.ok) {
    if (result.reason === "nothing_to_undo") {
      return NextResponse.json(
        { ok: false, error: "nothing_to_undo", message: "لا توجد نسخة سابقة محفوظة." },
        { status: 404, headers: NO_STORE }
      );
    }
    return NextResponse.json({ ok: false, error: "write_failed" }, { status: 503, headers: NO_STORE });
  }

  const after = await readPublished().catch(() => null);

  const logged = await recordWrite({
    actor: admin.uid,
    action: "site.undo",
    target: "site",
    subject: `v${result.version}`,
    before: before?.ok ? before.content : null,
    after: after?.ok ? after.content : null,
  });

  return NextResponse.json(
    { ok: true, version: result.version, audited: logged },
    { status: 200, headers: NO_STORE }
  );
}
