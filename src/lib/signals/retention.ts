/**
 * Rolling retention for signal aggregates.
 *
 * ## Why aggregates and not a log
 *
 * A log is a liability. It has to be retained, secured, deleted on request, and
 * argued about in a privacy policy. An aggregate — a tally of `kind:value` for a
 * month — supports every feature the aggregates exist for (recurring topics, a
 * reading rhythm) while holding nothing that reconstructs a session. So incoming
 * events are folded into a count and discarded.
 *
 * ## Twelve months
 *
 * The brief's figure, and it is a rolling window rather than a purge schedule: the
 * oldest month is dropped as the newest arrives, so the store never exceeds twelve
 * documents. This file exists to compute *which* months, in one place, so the route
 * stays a transport.
 */

import { monthKeyOf } from "./months";

/** Rolling window. Twelve months. */
export const RETENTION_MONTHS = 12;

/**
 * Month keys older than the window, relative to `now`.
 *
 * Returned as a list so the caller can delete by key without computing anything
 * itself. The current month is never included — pruning it would delete the very
 * document just written.
 */
export function expiredMonths(now: number, limit = RETENTION_MONTHS + 2): string[] {
  const out: string[] = [];
  const nowDate = new Date(now);
  for (let back = limit; back >= RETENTION_MONTHS; back -= 1) {
    const d = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() - back, 1));
    out.push(monthKeyOf(d.getTime()));
  }
  return out;
}

/**
 * Whether a month key is still inside the window.
 *
 * The cheap form of the same rule, for a read path that must not load a document
 * to decide whether to keep it.
 */
export function isWithinRetention(month: string, now: number): boolean {
  return month >= monthKeyOf(now - RETENTION_MONTHS * 31 * 86_400_000) && month <= monthKeyOf(now);
}
