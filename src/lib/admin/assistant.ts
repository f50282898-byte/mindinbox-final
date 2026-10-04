/**
 * The admin's assistant: proposals, never actions.
 *
 * ## The single most important property
 *
 * **This module cannot write to the site.** It returns `AssistantProposal[]` and
 * nothing else. There is no function here that mutates a document, no Firestore import,
 * and no call to `setDocument`. Applying a proposal goes through the ordinary admin
 * routes — which re-check `admins/{uid}`, re-validate with zod, and write an audit
 * entry attributed to the human who clicked apply.
 *
 * That is not a stylistic choice. An assistant that can publish is an assistant that
 * can be talked into publishing: the prompt includes admin-authored text, the model
 * summarises it, and a summary is not a safe thing to hand a write key. So the model
 * never gets one.
 *
 * ## What it is allowed to read
 *
 * Aggregate metrics and configuration. **Not** conversation text, not journal entries,
 * not a reader's email, not any `users/{uid}` document. The reader-side privacy
 * promise is that admins see aggregates only, and an assistant with a wider read would
 * quietly void it while looking like a feature.
 *
 * ## Why suggestions are a diff
 *
 * A proposal is `{ path, before, after, rationale }`. Returning a whole new document
 * would let the model reorder things nobody asked about; a diff forces it to name what
 * it wants to change, and forces the human to see it.
 */

import { TIER_DEFINITIONS } from "@/lib/tiers";

/** A single proposed change. */
export interface AssistantProposal {
  /** Dotted path into the site content, e.g. `pricing[1].tagline.ar`. */
  path: string;
  /** The current value, as read from the document. */
  before: string;
  /** What it proposes instead. */
  after: string;
  /** Why, in one short Arabic sentence. */
  rationaleAr: string;
}

export interface AssistantInput {
  /** Question asked, e.g. «لماذا هبط التحويل؟». */
  questionAr: string;
  /** Aggregate funnel counts. Keys are counts, never anything identifying. */
  funnel: Record<string, number>;
  /** Per-provider request counts and error rates. */
  providers: Array<{ id: string; requests: number; errors: number }>;
  /** Current pricing copy, so a proposal can quote it rather than invent it. */
  pricing: Array<{ tier: string; priceAr: string; taglineAr: string }>;
  /** Currently active banners, if any. */
  banners: Array<{ headlineAr: string; audience: string; endsAt: number | null }>;
}

/** The only shapes the assistant is permitted to propose changes to. */
export const PROPOSABLE_PATHS = [
  "pricing",
  "banners",
  "videos",
  "nav",
] as const;

export type ProposablePath = (typeof PROPOSABLE_PATHS)[number];

/** Rejects a proposal that names a path outside the allowed set. */
export function isProposable(path: string): path is ProposablePath {
  return (PROPOSABLE_PATHS as readonly string[]).includes(path.split(/[.[]/)[0] ?? "");
}

/**
 * Builds the read-only brief handed to the model.
 *
 * ## No identifiers, ever
 *
 * The brief is assembled from counts and configuration only. There is no code path
 * that can put a uid, an email, or a piece of reader text in here, because the function
 * takes only `AssistantInput` and `AssistantInput` has no field for one. Adding such a
 * field would be the change that breaks the promise, so the type is the guarantee.
 */
export function buildAssistantBrief(input: AssistantInput): string {
  const lines: string[] = [];

  lines.push("أنت مساعد لوحة إدارة. مهمتك: قراءة أرقام مجمّعة واقتراح صياغات فقط.");
  lines.push("قواعد ملزمة:");
  lines.push("- لا تكتب أي شيء. كل مخرجاتك اقتراحات تحتاج موافقة إنسان.");
  lines.push("- لا تخترع أرقاماً. إن لم تعرف، قل ذلك في التبرير.");
  lines.push("- لا تقترح نِدرة غير حقيقية، ولا عدّاداً تنازلياً، ولا خصماً.");
  lines.push("- اكتب التبرير بالعربية، واقترح التغييرات على المسارات المسموحة فقط.");
  lines.push("");

  lines.push("## قمع التحويل (أعداد مجمّعة)");
  for (const [key, value] of Object.entries(input.funnel)) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push("");

  lines.push("## المزوّدون");
  for (const p of input.providers) {
    const rate = p.requests > 0 ? Math.round((p.errors / p.requests) * 1000) / 10 : 0;
    lines.push(`- ${p.id}: ${p.requests} طلب، ${p.errors} خطأ (${rate}%)`);
  }
  lines.push("");

  lines.push("## التسعير الحالي");
  for (const card of input.pricing) {
    lines.push(`- ${card.tier}: ${card.priceAr} — ${card.taglineAr}`);
  }
  lines.push("");

  if (input.banners.length > 0) {
    lines.push("## لافتات نشطة");
    for (const b of input.banners) {
      lines.push(`- "${b.headlineAr}" → ${b.audience}${b.endsAt ? `، تنتهي ${new Date(b.endsAt).toISOString().slice(0, 10)}` : ""}`);
    }
    lines.push("");
  }

  lines.push("## مستويات الاشتراك");
  for (const [tier, d] of Object.entries(TIER_DEFINITIONS)) {
    lines.push(`- ${tier}: ${d.name}، ${d.priceUsd} دولار`);
  }

  return lines.join("\n");
}

/**
 * Filters whatever the model returned down to proposals that are safe to show.
 *
 * A model is an untrusted source like any other. This drops a proposal whose path is
 * outside the allowed set, whose before/after are not strings, or which is a no-op.
 * Showing an unfiltered diff in an apply button is how an unintended path gets clicked.
 */
export function sanitiseProposals(raw: unknown): AssistantProposal[] {
  if (!Array.isArray(raw)) return [];

  const out: AssistantProposal[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;

    const path = typeof p.path === "string" ? p.path : "";
    const before = typeof p.before === "string" ? p.before : null;
    const after = typeof p.after === "string" ? p.after : null;
    const rationaleAr = typeof p.rationaleAr === "string" ? p.rationaleAr : "";

    if (!path || before === null || after === null) continue;
    if (!isProposable(path)) continue;
    // A proposal that changes nothing is noise in a panel an admin has to read.
    if (before === after) continue;
    // An empty "after" would blank a field a reader sees.
    if (after.trim().length === 0) continue;

    out.push({ path, before, after, rationaleAr: rationaleAr.slice(0, 400) });
  }

  return out.slice(0, 12);
}

/**
 * The system instruction. Separated so it can be asserted in a test.
 *
 * A test that reads this string and checks it forbids publishing is a cheap guard
 * against a future edit that adds "and then apply the change".
 */
export const ASSISTANT_SYSTEM_PROMPT_AR =
  "أنت مساعد لوحة إدارة لموقع فلسفي. مهمتك الوحيدة هي اقتراح صياغات أفضل. " +
  "لا تنشر، لا تعدّل، لا تحفظ. مخرجاتك قائمة من الاقتراحات، ويلزم موافقة إنسان على كل واحد. " +
  "لا تقترح نِدرة أو خصماً أو عدّاداً تنازلياً. " +
  "لا تذكر أي قارئ بالاسم أو بالبريد. ";
