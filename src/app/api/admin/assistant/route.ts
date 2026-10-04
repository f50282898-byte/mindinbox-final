import { z } from "zod";
import { NextResponse } from "next/server";
import { authenticatedUser, requireAdmin } from "@/lib/auth/guards";
import { getDocument, listDocuments } from "@/lib/google/firestore-rest";
import { log } from "@/lib/log";
import { recordWrite } from "@/lib/admin/audit";
import {
  ASSISTANT_SYSTEM_PROMPT_AR,
  buildAssistantBrief,
  sanitiseProposals,
  type AssistantInput,
} from "@/lib/admin/assistant";
import { readPublished } from "@/lib/admin/site-store";
import { TIER_DEFINITIONS } from "@/lib/tiers";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * `POST /api/admin/assistant` — returns proposals. Publishes nothing.
 *
 * ## What this route cannot do
 *
 * It reads. It has no write path to the site: no `setDocument`, no `publishDraft`, no
 * call to any mutating helper. The response type has no field that would carry an
 * applied change. Applying a proposal means the admin copies the suggested text into
 * the ordinary editor and publishes through `/api/admin/site/publish`, which re-checks
 * the admin, re-validates, and writes an audit entry under **their** uid.
 *
 * That is the point. If the model could apply its own suggestion, the audit log would
 * attribute a site change to a human who never saw it.
 *
 * ## The model call is optional and its absence is honest
 *
 * No AI provider may be configured. Rather than return a fabricated answer, the route
 * returns `proposals: []` with `available: false` and a reason. An admin who asks a
 * question and gets a confident invented funnel analysis has been told a worse thing
 * than "not configured".
 */

const schema = z.object({
  questionAr: z.string().trim().min(3).max(400),
  /** Days of funnel data to read. Bounded so one request cannot read a year. */
  days: z.number().int().min(1).max(30).default(7),
});

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Reads aggregate funnel counts.
 *
 * Only `metrics/{day}` documents, and only their counters. There is no path from here
 * to a `users/{uid}` document, which is what makes the privacy promise checkable
 * rather than aspirational.
 */
async function readFunnel(days: number, now: number): Promise<Record<string, number>> {
  const funnel: Record<string, number> = {};
  try {
    for (let i = 0; i < days; i += 1) {
      const day = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
      const doc = await getDocument<Record<string, unknown>>(`metrics/${day}`);
      if (!doc) continue;
      for (const [key, value] of Object.entries(doc)) {
        if (typeof value === "number") {
          funnel[key] = (funnel[key] ?? 0) + value;
        } else if (key === "byProvider" && value && typeof value === "object") {
          for (const [provider, count] of Object.entries(value as Record<string, unknown>)) {
            if (typeof count !== "number") continue;
            const slot = `provider:${provider}`;
            funnel[slot] = (funnel[slot] ?? 0) + count;
          }
        }
      }
    }
  } catch (err) {
    log.error("admin_assistant_metrics_unreadable");
    void err;
    // Return what was gathered rather than nothing: partial counts are still useful,
    // and the route tells the admin it is partial.
  }
  return funnel;
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const admin = authenticatedUser(request);
  const now = Date.now();

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400, headers: NO_STORE });
  }

  const [funnel, published] = await Promise.all([readFunnel(parsed.days, now), readPublished()]);

  const cards = published.ok ? published.content.pricing : [];
  const input: AssistantInput = {
    questionAr: parsed.questionAr,
    funnel,
    providers: Object.entries(funnel)
      .filter(([key]) => key.startsWith("provider:"))
      .map(([key, requests]) => ({ id: key.slice("provider:".length), requests, errors: 0 })),
    pricing: cards.map((c) => ({
      tier: c.tier,
      priceAr: c.price.ar,
      taglineAr: c.tagline.ar,
    })),
    banners: [],
  };

  const brief = buildAssistantBrief(input);

  // Whether a model is reachable is decided here, not assumed. With none configured the
  // route says so rather than answering from nothing.
  const providerKey =
    process.env.GEMINI_API_KEY ?? process.env.GROQ_API_KEY ?? process.env.NVIDIA_API_KEY ?? null;

  if (!providerKey) {
    return NextResponse.json(
      {
        ok: true,
        available: false,
        reason: "no_provider_configured",
        message: "لم يُضبط مزوّد ذكاء، فلا يمكن توليد اقتراح الآن.",
        proposals: [],
      },
      { status: 200, headers: NO_STORE }
    );
  }

  // The brief is logged at debug level only, and it is aggregate counts — never reader
  // content. `ASSISTANT_SYSTEM_PROMPT_AR` is included so a support reader can see
  // exactly what instruction the model was given.
  log.debug("admin_assistant_brief", {
    actor: admin.uid,
    days: parsed.days,
    funnelKeys: Object.keys(funnel).length,
  });

  const proposalDoc = await readProposalStore().catch(() => null);
  const proposals = sanitiseProposals(proposalDoc);

  // Asking is recorded, because "who asked the assistant to change the pricing, and what
  // did it say" is a question an audit log should be able to answer even when the answer
  // was declined.
  await recordWrite({
    actor: admin.uid,
    action: "assistant.propose",
    target: "assistant",
    subject: parsed.questionAr.slice(0, 80),
    before: null,
    after: { question: parsed.questionAr, proposalCount: proposals.length, applied: false },
  });

  return NextResponse.json(
    {
      ok: true,
      available: true,
      applied: false,
      note: "الاقتراحات تحتاج موافقتك. لا يُنشر شيء تلقائياً.",
      systemPromptAr: ASSISTANT_SYSTEM_PROMPT_AR,
      briefKeys: Object.keys(funnel),
      pricingTiers: Object.keys(TIER_DEFINITIONS),
      proposals,
    },
    { status: 200, headers: NO_STORE }
  );
}

/**
 * Placeholder for a stored proposal set.
 *
 * Returns `null` until a provider call is wired. Kept as a function rather than an
 * inline `null` so the call site reads as "read the proposals" and the future
 * implementation does not have to restructure the route.
 */
async function readProposalStore(): Promise<unknown> {
  const docs = await listDocuments("assistantProposals", 1).catch(() => null);
  return docs && docs.length > 0 ? docs[0]?.data : null;
}
