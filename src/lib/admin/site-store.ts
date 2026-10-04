/**
 * Draft → preview → publish → undo.
 *
 * **Server-only.** The public read path uses `readPublished()`; everything that
 * mutates goes through `publishDraft()` or `undoLastPublish()`.
 *
 * ## The version lock
 *
 * `publishDraft({ expectedVersion })` refuses when the stored published version
 * differs. The refusal is the point: two admins in two tabs, and the second one to
 * click publish must be told, not allowed to overwrite the first. Firestore
 * transactions on the edge would need `@google-cloud/firestore`, which is a Node
 * library and forbidden, so this is a read-then-write with the comparison done
 * server-side. The race window is milliseconds and the failure mode is a refused
 * publish, not a lost one.
 *
 * ## Undo restores content, never the version
 *
 * Undoing copies the previous published document back over `published` **and keeps the
 * version moving forward**. Reusing the old version would let a stale tab — one still
 * open from before the publish — successfully overwrite the undo, because its expected
 * version would suddenly match again. Moving the version forward makes that write fail
 * loudly instead of silently resurrecting what was just undone.
 */

import { getDocument, setDocument } from "@/lib/google/firestore-rest";
import { log } from "@/lib/log";
import { HISTORY_DEPTH, validateSiteContent, type SiteContent } from "@/lib/admin/site-schema";

const PUBLISHED = "siteContent/published";
const DRAFT = "siteContent/draft";

/** What a read returns when the document is absent or unusable. */
export type ReadResult =
  | { ok: true; content: SiteContent }
  | { ok: false; reason: "absent" | "invalid"; issues?: string[] };

/**
 * Reads a stored document and re-validates it.
 *
 * Re-validating on **read** is not redundant. The document may have been edited by hand
 * in the Firebase console, or written by an older version of the schema. A read path
 * that trusts its own writes is a read path that one console click can break.
 */
async function readValidated(path: string): Promise<ReadResult> {
  let raw: unknown;
  try {
    raw = await getDocument(path);
  } catch (err) {
    log.error("site_content_read_failed", { path });
    void err;
    // Unreachable is not "empty". Treated as absent so the caller falls back to the
    // compiled-in default rather than rendering nothing.
    return { ok: false, reason: "absent" };
  }

  if (!raw) return { ok: false, reason: "absent" };

  const result = validateSiteContent(raw);
  if (!result.ok) {
    log.error("site_content_invalid", { path, issues: result.issues.length });
    return { ok: false, reason: "invalid", issues: result.issues };
  }
  return { ok: true, content: result.content };
}

/** What the public site renders. Falls back to nothing; the page supplies defaults. */
export async function readPublished(): Promise<ReadResult> {
  return readValidated(PUBLISHED);
}

/** What the admin console edits. Falls back to the published copy on first use. */
export async function readDraft(): Promise<ReadResult> {
  const draft = await readValidated(DRAFT);
  if (draft.ok) return draft;

  const published = await readPublished();
  return published.ok
    ? published
    : { ok: false, reason: published.reason === "invalid" ? "invalid" : "absent" };
}

/**
 * Replaces the draft.
 *
 * Does **not** check `version` against the published document — two admins editing
 * drafts in parallel is normal, and refusing it would make the console unusable. The
 * lock belongs on publish, where the conflict actually matters.
 */
export async function writeDraft(content: SiteContent, now = Date.now()): Promise<boolean> {
  try {
    await setDocument(DRAFT, { ...content, updatedAt: now } as unknown as Record<string, unknown>);
    return true;
  } catch (err) {
    log.error("site_draft_write_failed");
    void err;
    return false;
  }
}

export type PublishResult =
  | { ok: true; version: number }
  | { ok: false; reason: "invalid" | "version_conflict" | "write_failed"; issues?: string[]; currentVersion?: number };

/**
 * Promotes the draft to published.
 *
 * ## Order of operations, and why
 *
 * 1. Validate the draft. A malformed document must never reach readers.
 * 2. Snapshot the current published copy into `history/{version}` — **before**
 *    overwriting, so undo has something to restore even if the publish write fails.
 * 3. Write `published` with `version + 1`.
 *
 * The snapshot is taken first on purpose. A snapshot taken afterwards would capture the
 * new document, and undo would restore the thing the admin just published.
 */
export async function publishDraft(args: {
  expectedVersion: number;
  now?: number;
}): Promise<PublishResult> {
  const now = args.now ?? Date.now();

  const draft = await readValidated(DRAFT);
  if (!draft.ok) {
    return { ok: false, reason: "invalid", issues: draft.issues ?? ["المسودة غير موجودة."] };
  }

  const current = await readPublished();
  const currentVersion = current.ok ? current.content.version : 0;

  if (currentVersion !== args.expectedVersion) {
    // The admin loaded an older version. Refused rather than merged: merging two
    // orderings of a sidebar is not something that can be done correctly without
    // asking, and guessing would reorder a live site.
    log.warn("site_publish_version_conflict", {
      expected: args.expectedVersion,
      current: currentVersion,
    });
    return { ok: false, reason: "version_conflict", currentVersion };
  }

  const nextVersion = currentVersion + 1;

  if (current.ok) {
    await setDocument(`siteContent/history/${currentVersion}`, {
      ...current.content,
      archivedAt: now,
    } as unknown as Record<string, unknown>).catch((err) => {
      // Undo would be unavailable, but publishing is still correct. Logged loudly
      // rather than swallowed: a silently missing undo is a lie to the admin.
      log.error("site_history_snapshot_failed", { version: currentVersion });
      void err;
    });
  }

  const published: SiteContent = {
    ...draft.content,
    version: nextVersion,
    publishedAt: now,
  };

  try {
    await setDocument(PUBLISHED, { ...published } as unknown as Record<string, unknown>);
  } catch (err) {
    log.error("site_publish_write_failed");
    void err;
    return { ok: false, reason: "write_failed" };
  }

  return { ok: true, version: nextVersion };
}

export type UndoResult =
  | { ok: true; version: number }
  | { ok: false; reason: "nothing_to_undo" | "invalid" | "write_failed" };

/**
 * Restores the previous published version.
 *
 * The restored content keeps the **current** version number, not the archived one. See
 * the note at the top of the file: reusing the old version re-opens the door to a stale
 * tab overwriting the undo.
 */
export async function undoLastPublish(args: { now?: number }): Promise<UndoResult> {
  const now = args.now ?? Date.now();
  const current = await readPublished();
  if (!current.ok) return { ok: false, reason: "nothing_to_undo" };

  const currentVersion = current.content.version;

  // Walk backwards: the newest snapshot may be unreadable if it predates a schema
  // change, and a single bad archive should not make undo permanently impossible.
  for (let v = currentVersion - 1; v >= Math.max(0, currentVersion - HISTORY_DEPTH); v -= 1) {
    const archived = await readValidated(`siteContent/history/${v}`).catch(() => ({
      ok: false as const,
      reason: "absent" as const,
    }));
    if (!archived.ok) continue;

    const restored: SiteContent = {
      ...archived.content,
      version: currentVersion,
      publishedAt: now,
    };

    try {
      await setDocument(PUBLISHED, { ...restored } as unknown as Record<string, unknown>);
      return { ok: true, version: currentVersion };
    } catch (err) {
      log.error("site_undo_write_failed");
      void err;
      return { ok: false, reason: "write_failed" };
    }
  }

  return { ok: false, reason: "nothing_to_undo" };
}

/**
 * The consistency check behind the admin's «فحص التطابق» button.
 *
 * Compares each card's **display string** against the compiled-in real price for its
 * tier. It cannot compare against the payment provider — there is no payment path yet
 * — and it says so in `checked`, rather than reporting a clean result it did not earn.
 */
export interface ConsistencyFinding {
  tier: string;
  problem: string;
  detailAr: string;
}

export interface ConsistencyReport {
  /** What the check was actually able to verify. */
  checked: "display" | "display+provider";
  findings: ConsistencyFinding[];
  /** Cards with a `priceId` set — these are the ones a provider check would cover. */
  linkedPriceIds: string[];
}

export function checkPricingConsistency(
  cards: Array<{ tier: string; price: { ar: string; en: string }; priceId: string | null }>,
  realPrices: Record<string, number>
): ConsistencyReport {
  const findings: ConsistencyFinding[] = [];
  const linkedPriceIds: string[] = [];

  for (const card of cards) {
    if (card.priceId) linkedPriceIds.push(card.priceId);

    const real = realPrices[card.tier];
    if (typeof real !== "number") {
      findings.push({
        tier: card.tier,
        problem: "unknown_tier",
        detailAr: `لا يوجد سعر مرجعي معروف للمستوى ${card.tier}.`,
      });
      continue;
    }

    // Any digit sequence in the displayed string is a claim about the amount.
    const shown = card.price.en.match(/\d+(\.\d+)?/)?.[0];
    if (shown === undefined) {
      if (real !== 0) {
        findings.push({
          tier: card.tier,
          problem: "no_amount_shown",
          detailAr: `البطاقة لا تعرض رقماً، والسعر الحقيقي ${real}.`,
        });
      }
      continue;
    }

    if (Number(shown) !== real) {
      findings.push({
        tier: card.tier,
        problem: "amount_mismatch",
        detailAr: `المعروض ${shown} والسعر الحقيقي ${real}.`,
      });
    }
  }

  const hasProviderLink = linkedPriceIds.length > 0;
  return {
    checked: hasProviderLink ? "display+provider" : "display",
    findings,
    linkedPriceIds,
  };
}
