/**
 * Streaks, with one grace day.
 *
 * Pure functions over a set of day keys. No dates-as-instants, no timezone, no
 * clock — the caller passes `today` because only it knows the reader's timezone,
 * and that keeps every decision here reproducible in a test.
 *
 * ## What a grace day is, precisely
 *
 * A habit scheduled for three days a week will, sooner or later, be missed once
 * through no change of heart — illness, travel, a bad week. Without a grace, one
 * such day resets a twelve-week run to zero, and the honest response is to stop
 * opening the app. So a single missed day inside a run does not break it, and
 * that spent day is shown to the reader.
 *
 * Two properties this deliberately does **not** have:
 *
 * - **One grace per run, not per week, and not per day.** A run of 30 may absorb
 *   exactly one miss. A second consecutive miss ends it. A streak you cannot end
 *   is not a streak, it is a participation trophy.
 * - **No grace can be banked.** A grace is only ever available for a day that was
 *   actually scheduled and actually missed. You cannot save one up and spend it
 *   later, and a day that was never scheduled is not a miss at all.
 */

import { addDays, daysBetween, type DayKey } from "./day-key";

export interface StreakResult {
  /** Consecutive days, counting the grace day if one was spent. */
  current: number;
  /** Completed days in the current run, excluding the grace day. */
  completed: number;
  /** Longest run ever, in days. */
  best: number;
  /** Whether today is already satisfied. */
  doneToday: boolean;
  /** Whether the run is alive but today's habit has not been ticked yet. */
  pendingToday: boolean;
  /** Whether a grace day was spent inside the current run. */
  graceUsed: boolean;
  /**
   * The day the current run started, or null when there is no run.
   *
   * `null` and "started today" are different: a brand-new reader has no run at
   * all, and showing them a streak of one on their first ever entry would be a
   * lie about the past.
   */
  startedOn: DayKey | null;
}

/** Keys on which this habit was actually ticked. */
export type DoneSet = ReadonlySet<DayKey>;

/**
 * Keys on which the habit was scheduled and not ticked.
 *
 * Passed separately from the done set because a day that was never scheduled must
 * not count as a miss — otherwise a daily habit would be "broken" by every day it
 * was not meant to happen.
 */
export type ScheduledSet = ReadonlySet<DayKey>;

export interface StreakOptions {
  /**
   * Today, in the reader's timezone.
   *
   * Required rather than defaulted: the server's clock is in UTC and using it
   * would file today's tick under the wrong day for most of the world.
   */
  today: DayKey;
  done: DoneSet;
  /**
   * Every scheduled day up to and including today. Required for the reason above.
   */
  scheduled?: ScheduledSet;
  /** Grace days allowed per run. Defaults to one. */
  grace?: number;
}

/**
 * Current and best streaks for one habit.
 *
 * Walks backwards from today. "Backwards" is deliberate: the run a reader cares
 * about is the live one, and computing it from the present rather than by
 * scanning the whole history is what keeps this O(run length) instead of
 * O(history).
 */
export function computeStreak(options: StreakOptions): StreakResult {
  const { today, done } = options;
  const grace = Math.max(0, options.grace ?? 1);
  const scheduled = options.scheduled;

  const empty: StreakResult = {
    current: 0,
    completed: 0,
    best: computeBestRun([...done].sort(), grace),
    doneToday: done.has(today),
    pendingToday: false,
    graceUsed: false,
    startedOn: null,
  };

  const sortedDone = [...done].sort();
  if (sortedDone.length === 0) return empty;

  // The habit has not started before this, so there is no run to find.
  const earliest = sortedDone[0] as DayKey;

  let cursor = today;
  let completed = 0;
  let graceUsed = false;
  let missStreak = 0;
  let length = 0;
  let startedOn: DayKey | null = null;

  for (;;) {
    // Never walk past the first recorded day: below that there is no history, and
    // inventing misses down there is how a brand-new reader gets a phantom streak.
    // `daysBetween(earliest, cursor)` is negative once the cursor is before it.
    if (daysBetween(earliest, cursor) < 0) break;

    if (done.has(cursor)) {
      completed += 1;
      missStreak = 0;
      startedOn = cursor;
      length += 1;
      cursor = addDays(cursor, -1);
      continue;
    }

    if (cursor === today) {
      // Not yet done today. The day is not over, so this is pending — it must not
      // break a run and must not spend a grace day.
      cursor = addDays(cursor, -1);
      continue;
    }

    if (scheduled?.has(cursor)) {
      // A real, past, scheduled miss.
      missStreak += 1;
      if (missStreak > grace) break;
      graceUsed = true;
      // The grace day counts toward the run's length but not toward `completed`:
      // the reader did not do it, and the number must say so.
      startedOn = cursor;
      length += 1;
      cursor = addDays(cursor, -1);
      continue;
    }

    if (scheduled) {
      // A scheduled set is known, and this day is not in it: the habit was simply
      // not due. Skip it without spending grace.
      //
      // This must not end the walk. A Monday/Wednesday/Friday habit always has
      // unscheduled days between its ticks, so treating them as terminal would
      // leave every such habit permanently stuck at a streak of one.
      cursor = addDays(cursor, -1);
      continue;
    }

    // No schedule was supplied, so "not done" cannot be distinguished from "no
    // data", and a gap in the record is not a failure. The walk stops rather than
    // guessing.
    //
    // This is deliberately more cautious than `computeBestRun`, which does bridge
    // single gaps — there, the input *is* a list of completions, so a missing day
    // is unambiguously a day off.
    break;
  }

  return {
    current: length,
    completed,
    best: computeBestRun(sortedDone, grace),
    doneToday: done.has(today),
    pendingToday: !done.has(today) && length > 0,
    graceUsed,
    startedOn,
  };
}

/**
 * Longest run in a sorted list of done days, honouring grace.
 *
 * Grace is matched here the same way it is in the live run: one missed scheduled
 * day may sit inside a run. With no `scheduled` set — the historical case, where
 * only completions were kept — a gap breaks the run unless it is a single day,
 * which keeps a reader who ticked on the 1st and 3rd from seeing two separate
 * one-day runs.
 */
export function computeBestRun(sortedDone: DayKey[], grace = 1): number {
  if (sortedDone.length === 0) return 0;

  let best = 1;
  let run = 1;
  let graceUsedInRun = false;

  for (let i = 1; i < sortedDone.length; i += 1) {
    const gap = daysBetween(sortedDone[i - 1] as DayKey, sortedDone[i] as DayKey);

    if (gap === 1) {
      run += 1;
      graceUsedInRun = false;
    } else if (gap === 2 && grace > 0 && !graceUsedInRun) {
      // Exactly one day missed, and no grace spent in this run yet.
      graceUsedInRun = true;
      run += 1;
    } else {
      run = 1;
      graceUsedInRun = false;
    }

    if (run > best) best = run;
  }

  return best;
}

/**
 * Completion ratio over the last `windowDays`, counting scheduled days only.
 *
 * A ratio against calendar days would punish a five-days-a-week habit for the two
 * days it was never meant to happen.
 */
export function completionRate(
  done: DoneSet,
  scheduled: ScheduledSet,
  today: DayKey,
  windowDays: number
): number | null {
  let scheduledCount = 0;
  let completedCount = 0;

  for (let i = 0; i < windowDays; i += 1) {
    const key = addDays(today, -i);
    if (!scheduled.has(key)) continue;
    scheduledCount += 1;
    if (done.has(key)) completedCount += 1;
  }

  if (scheduledCount === 0) return null;
  return completedCount / scheduledCount;
}

/**
 * The strongest single run across several habits.
 *
 * The maximum, not an average. An average of streaks is neither a streak nor a
 * number a reader can hold in their head, and averaging across habits with wildly
 * different schedules produces a figure that describes nothing.
 */
export function strongestStreak(
  entries: Array<{ habitId: string } & StreakResult>
): { habitId: string; streak: number } | null {
  let best: { habitId: string; streak: number } | null = null;
  for (const entry of entries) {
    if (!best || entry.current > best.streak) {
      best = { habitId: entry.habitId, streak: entry.current };
    }
  }
  return best;
}
