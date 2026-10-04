/**
 * The journal data model, v1.
 *
 * ## Shape
 *
 * ```
 * users/{uid}/habits/{habitId}   habit definitions (schedule, grace, archived)
 * users/{uid}/days/{yyyy-mm-dd}   one document per day
 * users/{uid}/principles          { items: Principle[] }
 * users/{uid}/settings            { timeZone, aiJournalConsent, ... }
 * ```
 *
 * ## Why one document per day
 *
 * A journal's most common read is "the last N days, and today". With one document
 * per day that is N range reads with no fan-out; with one document per entry it is
 * a collection read that grows without bound, and a reader with three years of
 * entries pays for all of them on every page load. A day also *is* the unit the
 * UI and the charts both want, so nothing has to reassemble one.
 *
 * The cost is honesty about write amplification: editing yesterday's entry rewrites
 * a whole day. That is the right trade — a day document is small — but it means the
 * sync layer must merge by day, not append, or two devices will overwrite each
 * other's same-day edits. See `store.ts`.
 *
 * ## Timezone
 *
 * The day key is the reader's **local** calendar date, never UTC. `users/{uid}/settings.timeZone`
 * is the source; `day-key.ts` owns every conversion.
 */

import type { DayKey } from "./day-key";

/** A 1–5 self-rating. Optional everywhere except where noted. */
export type Rating = 1 | 2 | 3 | 4 | 5;

/**
 * The daily check-in. Every field is optional.
 *
 * "Optional" is load-bearing: a reader who does not want to rate their mood must be
 * able to use the whole product without ever being asked. Nothing here is required,
 * and the check-in form renders nothing that is not wanted.
 */
export interface CheckIn {
  energy?: Rating;
  focus?: Rating;
  /**
   * Mood. The most sensitive field in the product, and the only one gated behind a
   * separate explicit opt-in (D36). Never inferred, never derived from other
   * ratings, and never written without the reader choosing it.
   */
  mood?: Rating;
  /** Optional free tags. The reader's own words, never a fixed vocabulary. */
  tags?: string[];
}

/** Practice of philosophy: read / applied / reflected. */
export interface Practice {
  read?: boolean;
  applied?: boolean;
  reflected?: boolean;
  /** Optional one-line note: what was read or applied. */
  note?: string;
}

/** The four virtues the radar chart scores. */
export const VIRTUES = ["wisdom", "courage", "temperance", "justice"] as const;
export type Virtue = (typeof VIRTUES)[number];

export const VIRTUE_AR: Record<Virtue, string> = {
  wisdom: "حكمة",
  courage: "شجاعة",
  temperance: "اعتدال",
  justice: "عدل",
};

/** Self-assessed virtue ratings for the day. */
export type VirtueRatings = Partial<Record<Virtue, Rating>>;

/** Which journal template a free-form block came from. */
export type JournalTemplate = "morning" | "evening" | "question" | "free";

/**
 * The reflective journal.
 *
 * `private` defaults to true and is never defaulted to false by any code path. A
 * reader who writes here has not consented to it being read — by the Oracle, by an
 * export, by anyone. Only `settings.aiJournalConsent` changes what the server may
 * read, and that is a separate, explicit, revocable switch.
 */
export interface JournalBlock {
  template: JournalTemplate;
  text: string;
  /** The question shown for the `question` template, so history stays readable. */
  prompt?: string;
  updatedAt: number;
}

/** Per-day habit completion. */
export interface DayHabitTick {
  done: boolean;
  /** Optional note: what made it hard, or what the tick actually was today. */
  note?: string;
  updatedAt: number;
}

/** `users/{uid}/days/{yyyy-mm-dd}` */
export interface DayDocument {
  /** `yyyy-mm-dd` in the reader's timezone. Also the document id. */
  date: DayKey;
  /** The zone the key was computed in, recorded so a later change is detectable. */
  timeZone: string;
  habits?: Record<string, DayHabitTick>;
  checkIn?: CheckIn;
  practice?: Practice;
  virtues?: VirtueRatings;
  journal?: JournalBlock[];
  /** Reader's own epoch ms. Not the server's, and never inferred. */
  updatedAt: number;
  /** Which device last wrote, for the sync merge to break ties. */
  lastWriter?: string;
}

/** A habit definition. */
export interface Habit {
  id: string;
  /** The reader's own words for it. Never generated. */
  title: string;
  /** Optional: what it is for. Shown in the day view, never required. */
  intention?: string;
  /** Which weekday it is due, 0 = Monday … 6 = Sunday. */
  weekdays: number[];
  /** Empty means every day. Overrides `weekdays` when non-empty. */
  everyNDays?: number;
  /** Grace days allowed per run. Defaults to one. */
  grace: number;
  /** Archived habits keep their history and stop appearing in the day view. */
  archived: boolean;
  /** Optional: the habit the reader is working on, e.g. "قراءة". */
  category?: string;
  createdAt: number;
  updatedAt: number;
  order: number;
}

/** A value the reader has articulated, shown in the daily view. */
export interface Principle {
  id: string;
  text: string;
  createdAt: number;
}

/** `users/{uid}/settings` */
export interface JournalSettings {
  /** IANA zone. The single source of truth for every day key. */
  timeZone: string;
  /**
   * Whether the Oracle may read journal and mood content.
   *
   * Off by default, a separate switch from anything else in settings, and checked
   * on the server before any journal document is read — never in the client. See D36.
   */
  aiJournalConsent: boolean;
  /** Free limits, mirrored for display only. The server is authoritative. */
  habitsLimit: number;
  historyDaysLimit: number;
}

/** Whether a habit is due on a given day key. */
export function isDueOn(habit: Habit, key: DayKey, indexOfDay: number): boolean {
  if (habit.archived) return false;
  if (habit.everyNDays && habit.everyNDays > 0) {
    // Anchored on the habit's creation day so the rhythm is stable.
    return indexOfDay % habit.everyNDays === 0;
  }
  const weekday = weekdayOf(key);
  return habit.weekdays.length === 0 || habit.weekdays.includes(weekday);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayOf(key: DayKey): number {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  // 1970-01-01 was a Thursday; shifting by 3 makes Monday index 0.
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** The free tier's limits. Mirrored here so the UI and the tests agree. */
export const FREE_LIMITS = {
  habits: 3,
  historyDays: 30,
} as const;

/** Empty settings for a reader who has set nothing. */
export function defaultJournalSettings(): JournalSettings {
  return {
    // UTC as the fallback, never the server's current offset: the reader's zone is
    // resolved once they set it, and until then UTC is at least deterministic.
    timeZone: "UTC",
    aiJournalConsent: false,
    habitsLimit: FREE_LIMITS.habits,
    historyDaysLimit: FREE_LIMITS.historyDays,
  };
}
