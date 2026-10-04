import { z } from "zod";
import { NextResponse } from "next/server";
import { authenticatedUser, requireAdmin } from "@/lib/auth/guards";
import { log } from "@/lib/log";
import { recordWrite } from "@/lib/admin/audit";
import { validateSiteContent } from "@/lib/admin/site-schema";
import { readDraft, writeDraft } from "@/lib/admin/site-store";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * `GET /api/admin/site` — the draft the console edits.
 * `PUT /api/admin/site` — replaces the draft.
 *
 * `requireAdmin` runs on both. The uid it attaches is the only actor ever written to
 * the audit log — the body's `actor` field, if a client sent one, is not read.
 *
 * ## Validation happens here, not in the client
 *
 * The console validates with the same zod schema for immediate feedback, but that is a
 * courtesy. A `PUT` that arrives from anywhere is validated again on arrival, so a
 * hand-crafted request cannot install a document the console itself would have refused.
 */

const putSchema = z.object({
  content: z.unknown(),
  /** Echo of the version the admin loaded. Informational for drafts; see below. */
  loadedVersion: z.number().int().min(0),
});

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const draft = await readDraft();
  if (!draft.ok) {
    return NextResponse.json(
      { ok: false, error: draft.reason, issues: draft.issues ?? [] },
      { status: draft.reason === "invalid" ? 422 : 404, headers: NO_STORE }
    );
  }

  return NextResponse.json({ ok: true, content: draft.content }, { status: 200, headers: NO_STORE });
}

export async function PUT(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const admin = authenticatedUser(request);

  let parsed: z.infer<typeof putSchema>;
  try {
    parsed = putSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400, headers: NO_STORE });
  }

  const validated = validateSiteContent(parsed.content);
  if (!validated.ok) {
    // Not audited: nothing was written. Auditing refused writes would fill the log
    // with an attacker's malformed payloads and bury the real changes.
    return NextResponse.json(
      { ok: false, error: "invalid", issues: validated.issues },
      { status: 422, headers: NO_STORE }
    );
  }

  const before = await readDraft().catch(() => null);
  const wrote = await writeDraft(validated.content);
  if (!wrote) {
    return NextResponse.json({ ok: false, error: "write_failed" }, { status: 503, headers: NO_STORE });
  }

  // Audited after the write, deliberately. See `recordWrite`'s note: a log that claims a
  // change which then failed is worse than a gap we can report.
  const logged = await recordWrite({
    actor: admin.uid,
    action: "site.draft.update",
    target: "site",
    subject: null,
    before: before?.ok ? before.content : null,
    after: validated.content,
  });

  if (!logged) {
    // The change landed and is unlogged. Said out loud rather than swallowed.
    log.error("site_draft_unaudited", { actor: admin.uid });
  }

  return NextResponse.json(
    { ok: true, content: validated.content, audited: logged },
    { status: 200, headers: NO_STORE }
  );
}
