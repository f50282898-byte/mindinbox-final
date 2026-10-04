import { z } from "zod";
import { NextResponse } from "next/server";
import { authenticatedUser, requireAdmin } from "@/lib/auth/guards";
import { TIER_DEFINITIONS } from "@/lib/tiers";
import { recordWrite } from "@/lib/admin/audit";
import { checkPricingConsistency } from "@/lib/admin/site-store";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * `POST /api/admin/pricing/check` — the «فحص التطابق» button.
 *
 * ## What it can and cannot verify
 *
 * It compares each card's **display string** against the compiled-in real price from
 * `TIER_DEFINITIONS`. That catches the failure that matters: someone edits the display
 * copy and the number a reader sees stops matching the number the tier actually costs.
 *
 * It **cannot** compare against the payment provider, because there is no payment path
 * yet. When no card carries a `priceId` the response says `checked: "display"` rather
 * than reporting a clean result it did not earn. A check that reports "all good" when
 * it only compared a string to a constant is worse than no check, because it is taken
 * as having checked the thing that matters.
 *
 * ## Read-only, so why is it audited?
 *
 * It writes nothing. It is not audited — auditing a read would bury real writes under
 * every button press, and the audit log's value is that a line in it means something
 * changed.
 */

const schema = z.object({
  cards: z
    .array(
      z.object({
        tier: z.string().max(20),
        price: z.object({ ar: z.string().max(200), en: z.string().max(200) }),
        priceId: z.string().max(120).nullable(),
      })
    )
    .max(6),
});

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const admin = authenticatedUser(request);

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400, headers: NO_STORE });
  }

  // The reference prices come from the tier definitions, not from the request. A client
  // that sent its own "real" prices would be checked against itself and always pass.
  const realPrices: Record<string, number> = {};
  for (const [tier, definition] of Object.entries(TIER_DEFINITIONS)) {
    realPrices[tier] = definition.priceUsd;
  }

  const report = checkPricingConsistency(parsed.cards, realPrices);

  // Reading is not writing, so no audit entry — but the actor is recorded in the log
  // when a mismatch is found, because a mismatch is the thing an operator will want to
  // trace back to whoever pressed the button.
  if (report.findings.length > 0) {
    // eslint-disable-next-line no-console -- server-side audit trail, not a client log
    console.warn(
      JSON.stringify({
        event: "pricing_inconsistent",
        actor: admin.uid,
        findings: report.findings.length,
      })
    );
  }

  return NextResponse.json({ ok: true, report }, { status: 200, headers: NO_STORE });
}
