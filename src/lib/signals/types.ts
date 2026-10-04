/**
 * Signals — the vocabulary, and the list of what is forbidden.
 *
 * ## The principle
 *
 * "Non-intrusive but not undisclosed." Every event here is something the reader
 * *did* that is meaningful to them — chose a philosopher, finished a lesson, ticked
 * a habit — and nothing they merely *are*. The distinction is the whole design.
 *
 * ## What is forbidden, and why it is an enumerated list rather than a principle
 *
 * An open-ended "collect nothing sensitive" is a promise no code can keep, because
 * the next contributor will find a new way to infer a trait. So the prohibitions
 * are concrete and testable:
 *
 *  - **No keystrokes, no pointer movement.** Those are behavioural capture, not
 *    product analytics, and they are the raw material of surveillance.
 *  - **No fingerprinting.** Canvas hashes, audio stacks, font enumeration, installed
 *    fonts — all of it identifies a *device* across sites, which we have no business
 *    doing.
 *  - **No third-party trackers.** One origin, one request, no pixels.
 *  - **No IP storage.** Cloudflare puts an IP in every log we do not control; we
 *    must not add a second copy. The per-IP quota hash (D24) is a salted daily
 *    digest used to count, never stored.
 *
 * `FORBIDDEN_SIGNAL_KINDS` is asserted against in tests, so adding a new kind
 * requires deciding, in the same commit, whether it is one of these.
 */

/** The closed vocabulary. Anything not here is not collectable. */
export const SIGNAL_KINDS = [
  /** The reader picked a philosopher. An explicit choice. */
  "philosopher_selected",
  /** The topic of a question, as classified. Derived from what they typed. */
  "question_topic",
  /** A path lesson finished. */
  "lesson_completed",
  /** A habit ticked for the day. */
  "habit_completed",
  /**
   * Which of five coarse buckets the interaction fell in.
   *
   * Deliberately coarse: "morning" is a fact about a clock, not a claim about a
   * routine. Five buckets is the most that can honestly be called approximate.
   */
  "time_of_day",
] as const;

export type SignalKind = (typeof SIGNAL_KINDS)[number];

/**
 * Things that are never collected, whatever the reason.
 *
 * Exported so a test can assert no event of these kinds can be emitted, and so the
 * account page can state the prohibitions to the reader in their own words.
 */
export const FORBIDDEN_SIGNAL_KINDS = [
  "keystroke",
  "pointer_move",
  "scroll_depth",
  "canvas_fingerprint",
  "font_fingerprint",
  "audio_fingerprint",
  "ip_address",
  "raw_conversation_text",
  "raw_journal_text",
  "device_id",
] as const;

export type ForbiddenSignalKind = (typeof FORBIDDEN_SIGNAL_KINDS)[number];

/** Time-of-day buckets. Five, and no finer. */
export const TIME_BUCKETS = ["fajr", "morning", "afternoon", "evening", "night"] as const;
export type TimeBucket = (typeof TIME_BUCKETS)[number];

/** Which consent switch an event requires. */
export type ConsentSwitch = "conversation" | "journal";

/** A signal, before it is derived into aggregates. Never persisted raw. */
export interface Signal {
  kind: SignalKind;
  /** The dimension: a philosopher id, a topic, a path id. Never free text. */
  value: string;
  /** Epoch ms, bucketed on arrival. */
  at: number;
  /** Which switch this event needs consent for. */
  consent: ConsentSwitch;
  /**
   * False for events raised before the reader had an account.
   *
   * Such events may be counted for the current session but must never be written
   * against a uid — attaching them later is exactly the "no signal linked to
   * identity without consent" failure.
   */
  identified: boolean;
}

/** A `Signal` plus the reader, which is what actually gets sent. */
export interface IdentifiedSignal extends Signal {
  identified: true;
  uid: string;
}

/** Bounds on `value`. Prevents a payload from becoming a smuggling channel. */
export const MAX_VALUE_LENGTH = 48;

/**
 * Rejects any event outside the vocabulary, or over the value bound.
 *
 * This is the last gate before `sendBeacon`, so a programming mistake upstream
 * cannot turn into a request carrying anything else.
 */
export function isCollectable(value: {
  kind: unknown;
  value: unknown;
  consent: unknown;
}): boolean {
  if (!SIGNAL_KINDS.includes(value.kind as SignalKind)) return false;
  if (typeof value.value !== "string") return false;
  if (value.value.length === 0 || value.value.length > MAX_VALUE_LENGTH) return false;
  if (!/^[a-z0-9-]{1,48}$/.test(value.value)) return false;
  if (value.consent !== "conversation" && value.consent !== "journal") return false;
  return true;
}

/** The coarse bucket for an instant, in the reader's own timezone. */
export function bucketFor(at: number, timeZone: string): TimeBucket {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      hour12: false,
    }).format(new Date(at))
  );
  if (hour >= 3 && hour < 9) return "fajr";
  if (hour >= 9 && hour < 14) return "morning";
  if (hour >= 14 && hour < 19) return "afternoon";
  if (hour >= 19 && hour < 24) return "evening";
  return "night";
}

/** Human-readable Arabic for a bucket, for the account page. */
export const BUCKET_AR: Record<TimeBucket, string> = {
  fajr: "الفجر",
  morning: "الصباح",
  afternoon: "بعد الظهر",
  evening: "المساء",
  night: "الليل",
};
