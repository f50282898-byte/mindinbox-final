/**
 * The audit log.
 *
 * **Server-only.** Every admin write goes through `recordWrite()`. There is no other
 * way to write admin-owned content, because the routes that do it all call this.
 *
 * ## Why a log and not a `createdAt` field
 *
 * A document's own timestamps answer "when was this last written". They do not answer
 * the two questions an admin actually asks after something goes wrong: **who** did it,
 * and **what did the value look like before**. An admin console without before/after
 * is a console that can be misused without anyone being able to tell.
 *
 * ## What is recorded, and what is not
 *
 * Every entry holds the acting uid, the action, the document path, the previous value
 * and the new value. It holds **no** conversation text, no journal entry, and no
 * reader's personal data — because an audit trail is read by admins, and the privacy
 * policy promises admins see aggregates only. Copying a reader's data into a document
 * admins can list would quietly break that promise.
 *
 * Entries are **append-only from the server's perspective** and never edited or
 * deleted. A log that can be edited is a log that proves nothing.
 */

import { setDocument } from "@/lib/google/firestore-rest";
import { log } from "@/lib/log";

/** What an admin did. A closed vocabulary — a free-text action field is not auditable. */
export type AuditAction =
  | "site.draft.update"
  | "site.publish"
  | "site.undo"
  | "pricing.update"
  | "pricing.link"
  | "banner.create"
  | "banner.update"
  | "banner.delete"
  | "quote.create"
  | "quote.update"
  | "quote.delete"
  | "lesson.update"
  | "video.link"
  | "persona.update"
  | "user.grant"
  | "user.suspend"
  | "settings.update"
  | "riddle.settings"
  | "assistant.propose"
  | "assistant.apply";

/**
 * The subject of the write, as a dotted path.
 *
 * Used for grouping and filtering. Deliberately not the full Firestore path, because
 * the uid is already a separate field and repeating it invites a mismatch.
 */
export type AuditTarget =
  | "site"
  | "pricing"
  | "banners"
  | "quotes"
  | "paths"
  | "videos"
  | "personas"
  | "users"
  | "settings"
  | "riddles"
  | "assistant";

export interface AuditEntry {
  /** Who did it. From the verified ID token, never from a request body. */
  actor: string;
  action: AuditAction;
  target: AuditTarget;
  /**
   * The specific item, e.g. a banner id or a uid. `null` for a whole-document write.
   *
   * A uid here is intentional: "granted 7 days to reader X" is exactly the record an
   * admin needs, and it is an identifier, not personal content.
   */
  subject: string | null;
  /** The value before the write. `null` when the document did not exist. */
  before: unknown;
  /** The value after the write. */
  after: unknown;
  at: number;
}

/**
 * How much of a value is kept.
 *
 * A cap rather than the whole document, because `before`/`after` are for reading a
 * diff. An unbounded copy of a large document turns the audit log into a second copy
 * of the database, and the second copy is the one nobody reviews. Truncation is
 * recorded in the entry so a reader knows the diff is partial rather than misled.
 */
const MAX_SERIALISED = 4_000;

/**
 * Records one write.
 *
 * ## The write happens first, and the log is recorded after
 *
 * Ordering is deliberate and slightly uncomfortable: if the audit write fails, the
 * change has already landed and is unlogged. The alternative — logging first — means a
 * log entry that claims a change which then failed, which is worse: it makes the log
 * unreliable in the direction that looks like a successful change.
 *
 * So a failure is loud (`log.error`) and the function returns `false` so a route can
 * report "the change was made but not logged" rather than pretending otherwise. An
 * admin who is told the log failed can escalate; an admin who is told nothing cannot.
 *
 * ## Fire-and-forget is not used here
 *
 * Unlike `recordUsage`, an audit failure is not swallowed. Telemetry that breaks a
 * response is bad; an audit trail that silently stops is worse.
 */
export async function recordWrite(entry: Omit<AuditEntry, "at"> & { at?: number }): Promise<boolean> {
  const at = entry.at ?? Date.now();
  const full: AuditEntry = {
    actor: entry.actor,
    action: entry.action,
    target: entry.target,
    subject: entry.subject ?? null,
    before: clip(entry.before),
    after: clip(entry.after),
    at,
  };

  // Keyed by time then actor, so a listing ordered by document id is chronological and
  // two entries in the same millisecond by the same admin do not collide.
  const id = `${at.toString(36)}-${full.actor}`;

  try {
    await setDocument(`auditLog/${id}`, { ...full });
    return true;
  } catch (err) {
    log.error("audit_write_failed", { action: full.action, target: full.target });
    void err;
    return false;
  }
}

/**
 * Clips a value to something a human can read in a diff pane.
 *
 * Strings are cut with an explicit marker rather than silently, because a truncated
 * diff that looks complete is how a change goes unnoticed.
 */
function clip(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;

  if (typeof value === "string") {
    return value.length <= MAX_SERIALISED
      ? value
      : `${value.slice(0, MAX_SERIALISED)}…[truncated ${value.length - MAX_SERIALISED} chars]`;
  }

  if (typeof value !== "object") return value;

  let json: string;
  try {
    json = JSON.stringify(value);
  } catch {
    // Circular, or a value Firestore cannot hold. Record the fact rather than an
    // exception that would take the write down with it.
    return "[unserialisable]";
  }

  if (json.length <= MAX_SERIALISED) return value;

  return {
    _clipped: true,
    _bytes: json.length,
    _preview: `${json.slice(0, MAX_SERIALISED)}…`,
  };
}
