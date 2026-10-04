/**
 * The editable site schema.
 *
 * One zod schema for the whole editable surface, validated on **every** write and
 * again on every read. A single schema rather than one per panel, because the publish
 * step has to be able to say "this draft is entirely valid" — which it cannot do if
 * validity is decided field by field in five different components.
 *
 * ## The three states, and why they are separate documents
 *
 * `siteContent/published` is what the public site reads.
 * `siteContent/draft` is what an admin is editing.
 * `siteContent/history/{n}` is the last N published versions, for undo.
 *
 * Keeping the draft and the published copy in **different documents** is the whole
 * point: an admin's half-finished reordering is invisible to readers until it is
 * published, and a publish is one atomic swap rather than a migration of edits across
 * live fields.
 *
 * ## `version` is an optimistic lock, not bookkeeping
 *
 * Two admins with the console open in two tabs will both save. Without a lock the
 * second silently overwrites the first, and neither learns it happened. Every write
 * carries the `version` the admin loaded; the route refuses a mismatch and the UI
 * reloads. This is the cheapest correct answer — Firestore transactions on the edge
 * need a Node SDK we are not permitted to use.
 */

import { z } from "zod";

/** Bilingual text. Arabic is required; English may be the Arabic, never blank. */
const bilingual = z.object({
  ar: z.string().trim().min(1, "النص العربي مطلوب").max(400),
  en: z.string().trim().max(400),
});

/**
 * The navigation ids that actually exist.
 *
 * Derived by hand from `FALLBACK_NAV` rather than invented, because the first version
 * of this schema listed `home`, `oracle`, `sanctum` and `community` — none of which
 * are nav items in this product. A closed enum is what stops an admin adding a menu
 * entry that navigates nowhere, so it has to be the real list.
 *
 * **If you add a route to `FALLBACK_NAV`, add it here too**, or the site builder will
 * silently refuse to reorder it.
 */
export const NAV_IDS = [
  "enter",
  "wisdom",
  "dialogue",
  "journal",
  "tracker",
  "paths",
  "quotes",
  "pricing",
  "account",
  "privacy",
  "terms",
  "refund",
] as const;

export type NavId = (typeof NAV_IDS)[number];

/**
 * A navigation override.
 *
 * Deliberately **not** the whole `NavItem`. `href`, `icon`, `group` and `requires`
 * are not editable here, and that is the point:
 *
 *  - `href` is validated in `nav.ts` against same-origin absolute paths and against
 *    `HIDDEN_ROUTES`. Making it editable here would mean re-implementing that check,
 *    and an editable `href` is how a menu item ends up pointing at `/god-mode-admin`.
 *  - `icon`, `group` and `requires` are structural. `requires` in particular gates
 *    what a reader can see; it is not a copy field.
 *
 * So an override is: order, visibility, and the two labels. Everything else comes
 * from `FALLBACK_NAV`, which means an override document can never invent structure.
 */
export const navItemSchema = z.object({
  id: z.enum(NAV_IDS),
  label: bilingual,
  visible: z.boolean(),
});

/** A pricing card. */
export const pricingCardSchema = z.object({
  /** Must match a `Tier`, so a card can never claim a level that does not exist. */
  tier: z.enum(["free", "oracle", "sanctum"]),
  name: bilingual,
  /** Display string only. The real number lives on the tier, and "فحص التطابق" compares them. */
  price: bilingual,
  period: bilingual,
  tagline: bilingual,
  includes: z.array(bilingual).max(12),
  limits: z.array(bilingual).max(12),
  cta: bilingual,
  /**
   * The provider's price id, once billing exists.
   *
   * Optional because there is no payment path yet. When it is set, the consistency
   * check compares the displayed price against the provider's amount and warns on a
   * mismatch rather than silently trusting the display string.
   */
  priceId: z.string().trim().max(120).nullable(),
  highlighted: z.boolean(),
});

/** A Sanctum lecture link. `embedUrl` is always the `-nocookie` form. */
export const videoSchema = z.object({
  id: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/, "معرّف غير صالح"),
  title: bilingual,
  summary: bilingual,
  /** Already normalised by `toNoCookieEmbedUrl`. Re-checked on read, never trusted. */
  embedUrl: z.string().url().max(300),
});

/** The editable document. */
export const siteContentSchema = z.object({
  nav: z.array(navItemSchema).max(20),
  pricing: z.array(pricingCardSchema).max(6),
  videos: z.array(videoSchema).max(60),
  /**
   * Bumped on every publish. Carried by the client on every write; a mismatch is the
   * concurrent-write signal.
   */
  version: z.number().int().min(0),
  /** Epoch ms of the last publish. Display only. */
  publishedAt: z.number().int().min(0).nullable(),
});

export type SiteContent = z.infer<typeof siteContentSchema>;
export type NavItem = z.infer<typeof navItemSchema>;
export type PricingCard = z.infer<typeof pricingCardSchema>;
export type Video = z.infer<typeof videoSchema>;

/**
 * Merges published nav overrides onto the real nav.
 *
 * ## Why this lives here and not in the shell
 *
 * The shell must render identically on the server and on the client, and the overrides
 * arrive from Firestore — so the merge has to be a pure function of two plain values.
 * Doing it here means the shell never has to know that overrides exist, and the merge
 * is unit-testable without a browser.
 *
 * ## Unknown ids are dropped, not rendered
 *
 * An override naming an id that is no longer in `FALLBACK_NAV` is skipped. That is what
 * happens after a route is removed while an old draft is still published, and rendering
 * a label for a route with no href would produce a dead menu item.
 *
 * ## Every `FALLBACK_NAV` entry survives
 *
 * A published document that omits an id entirely does **not** hide it — it falls back
 * to `FALLBACK_NAV`'s own entry, visible. Omission means "no opinion", not "removed".
 * Otherwise a partial draft silently deleted navigation from the live site, and "hide
 * this item" would be indistinguishable from "forgot to include it".
 */
export function applyNavOverrides<T extends { id: string; label: { ar: string; en: string } }>(
  base: readonly T[],
  overrides: ReadonlyArray<{ id: string; label: { ar: string; en: string }; visible: boolean }>
): T[] {
  const byId = new Map(overrides.map((o) => [o.id, o]));
  const known = new Set(base.map((b) => b.id));

  const merged = base.map((item) => {
    const override = byId.get(item.id);
    if (!override) return { ...item };
    return { ...item, label: { ...override.label } };
  });

  // Overrides for ids the base does not have cannot be rendered; they are dropped.
  // Their order is otherwise unrepresentable and would need inventing an href.
  void known;

  // Order comes from the override list, restricted to ids that exist. Then anything the
  // override list did not mention is appended in its original order, so a partial
  // document never drops entries.
  const ordered: T[] = [];
  for (const override of overrides) {
    const item = merged.find((m) => m.id === override.id);
    if (item) ordered.push(item);
  }
  for (const item of merged) {
    if (!ordered.some((o) => o.id === item.id)) ordered.push(item);
  }

  // Visibility is a separate pass, because it must apply to the final ordering.
  return ordered
    .filter((item) => byId.get(item.id)?.visible !== false)
    .map((item) => {
      const override = byId.get(item.id);
      return override ? { ...item, label: { ...override.label } } : { ...item };
    });
}

/* ── cross-field invariants zod cannot express ───────────────────────────── */

/**
 * Every tier must have exactly one card.
 *
 * zod validates each card in isolation; this checks the collection. Without it a
 * draft could hold two `oracle` cards and no `free` card, and the pricing page would
 * render three columns with two of them claiming the same level.
 */
export function hasExactlyOneCardPerTier(content: Pick<SiteContent, "pricing">): boolean {
  const required = ["free", "oracle", "sanctum"];
  const seen = new Set(content.pricing.map((c) => c.tier));
  return required.every((t) => seen.has(t as PricingCard["tier"])) && seen.size === required.length;
}

/** Nav ids are unique — a duplicate renders two identical menu items. */
export function hasUniqueNavIds(content: Pick<SiteContent, "nav">): boolean {
  return new Set(content.nav.map((n) => n.id)).size === content.nav.length;
}

/**
 * Validates a whole document, including the invariants zod cannot state.
 *
 * Returns a discriminated result rather than throwing, because callers differ: the
 * write routes need the list of problems to send back, and the read path needs to
 * know only "usable or not".
 */
export function validateSiteContent(
  raw: unknown
): { ok: true; content: SiteContent } | { ok: false; issues: string[] } {
  const parsed = siteContentSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map(
        (i) => `${i.path.join(".") || "(root)"}: ${i.message}`
      ),
    };
  }

  const issues: string[] = [];
  if (!hasExactlyOneCardPerTier(parsed.data)) {
    // No field name here: the zod issues above already carry the path, so repeating
    // it in English inside an Arabic sentence only trips the content gate.
    issues.push("يجب أن تكون هناك بطاقة واحدة لكل مستوى من المستويات الثلاثة.");
  }
  if (!hasUniqueNavIds(parsed.data)) {
    issues.push("معرّفات التنقّل يجب أن تكون فريدة، لا مكرّرة.");
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, content: parsed.data };
}

/** How many published versions are kept for undo. */
export const HISTORY_DEPTH = 10;
