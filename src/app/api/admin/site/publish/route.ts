import { z } from "zod";
import { NextResponse } from "next/server";
import { authenticatedUser, requireAdmin } from "@/lib/auth/guards";
import { recordWrite } from "@/lib/admin/audit";
import {
  publishDraft,
  readDraft,
  readPublished,
} from "@/lib/admin/site-store";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * `POST /api/admin/site/publish` — draft becomes public.
 * `POST /api/admin/site/undo` — the previous public version comes back.
 *
 * Both re-check `admins/{uid}`. Neither is reachable by a signed-in non-admin, and the
 * acceptance suite proves it with a rules test and an e2e request.
 *
 * ## The version lock is the argument
 *
 * `expectedVersion` is required. There is no "force" flag, because a force flag is how
 * a lost update becomes unrecoverable: two tabs, both at version 4, both publish, and
 * the second one wins silently. Refusing is the only behaviour that lets the admin know
 * they are about to overwrite a colleague.
 *
 * ## Undo moves the version forward
 *
 * Restoring old *content* with a new *version*, so a tab still open from before the
 * publish cannot immediately overwrite the undo. See `site-store.ts`.
 */

const publishSchema = z.object({
  expectedVersion: z.number().int().min(0),
});

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const admin = authenticatedUser(request);

  let parsed: z.infer<typeof publishSchema>;
  try {
    parsed = publishSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400, headers: NO_STORE });
  }

  const before = await readPublished().catch(() => null);
  const result = await publishDraft({ expectedVersion: parsed.expectedVersion });

  if (!result.ok) {
    if (result.reason === "version_conflict") {
      return NextResponse.json(
        {
          ok: false,
          error: "version_conflict",
          currentVersion: result.currentVersion,
          message: "نُشر شيء آخر بعد أن فتحت هذه الصفحة. أعد التحميل قبل النشر.",
        },
        { status: 409, headers: NO_STORE }
      );
    }
    if (result.reason === "invalid") {
      return NextResponse.json(
        { ok: false, error: "invalid", issues: result.issues ?? [] },
        { status: 422, headers: NO_STORE }
      );
    }
    return NextResponse.json({ ok: false, error: "write_failed" }, { status: 503, headers: NO_STORE });
  }

  const after = await readDraft().catch(() => null);

  const logged = await recordWrite({
    actor: admin.uid,
    action: "site.publish",
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
