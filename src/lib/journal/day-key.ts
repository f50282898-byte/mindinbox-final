/**
 * Day keys — `yyyy-mm-dd` in the reader's own timezone.
 *
 * Why this exists at all, and why it is its own module: a journal that files
 * entries under the server's timezone files them under the wrong day. Someone in
 * Asia/Riyadh writing at 01:00 local is writing on *their* Tuesday, whatever UTC
 * says, and a streak that counts UTC days breaks for them twice a year.
 *
 * ## The rule this module follows
 *
 * A day is identified by its **local calendar date**, never by an instant. Every
 * day-key operation is therefore calendar arithmetic on `yyyy-mm-dd`, which is
 * completely immune to daylight saving. A day in Europe/London is 23 hours long
 * twice a year and 25 hours once; here, that simply does not exist. There is no
 * `+86_400_000` anywhere in this file, and adding one is the bug this file exists
 * to prevent.
 *
 * The one place an instant is involved is the very first conversion, and that is
 * where the timezone does all the work.
 */

/** A calendar date, `yyyy-mm-dd`. Never a timestamp. */
export type DayKey = string;

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** How many days a month has, leap years included. */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** True when `key` is a well-formed `yyyy-mm-dd` that names a real date. */
export function isDayKey(key: unknown): key is DayKey {
  if (typeof key !== "string" || !DAY_KEY_RE.test(key)) return false;
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > daysInMonth(y, m)) return false;
  return true;
}

/**
 * Whether a timezone identifier is usable.
 *
 * `Intl` throws a `RangeError` on an unknown zone, and an unset or corrupt
 * preference in `users/{uid}` must not take the journal down with it.
 */
export function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone || typeof timeZone !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The local calendar date at `instantMs`, in `timeZone`.
 *
 * `en-CA` is used for one reason: its date format is `yyyy-mm-dd`, so the parts
 * can be sliced apart and reassembled without a locale-dependent formatter. Any
 * other locale risks a month-first ordering silently producing wrong keys.
 *
 * An unknown zone falls back to UTC rather than throwing: a wrong-but-consistent
 * day is recoverable, a crash that loses the entry is not.
 */
export function dayKeyFor(instantMs: number, timeZone: string | null | undefined): DayKey {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";

  // `hourCycle` is irrelevant here but leaving it out lets some engines pick a
  // non-Gregorian default calendar for some zones, which would be worse.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instantMs));

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "01";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Today's key for a reader, in their own timezone. */
export function todayKey(
  timeZone: string | null | undefined,
  now: number = Date.now()
): DayKey {
  return dayKeyFor(now, timeZone);
}

/**
 * Adds `days` to a day key, in calendar terms.
 *
 * Pure string arithmetic through `Date.UTC`, which exists only to reuse the
 * platform's own leap-year and month-length rules. Reading and writing the UTC
 * fields is safe precisely because no local time is ever involved: the value is
 * a container for `y/m/d`, not a moment.
 */
export function addDays(key: DayKey, days: number): DayKey {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: DayKey, to: DayKey): number {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86_400_000);
}

/** The inclusive list of keys from `start` to `end`. */
export function dayRange(start: DayKey, end: DayKey): DayKey[] {
  const span = daysBetween(start, end);
  if (span < 0) return [];
  const out: DayKey[] = [];
  for (let i = 0; i <= span; i += 1) out.push(addDays(start, i));
  return out;
}

/** The first day of the month `key` falls in. */
export function startOfMonth(key: DayKey): DayKey {
  return `${key.slice(0, 7)}-01`;
}

/** The last day of the month `key` falls in. */
export function endOfMonth(key: DayKey): DayKey {
  const [y, m] = key.split("-").map(Number) as [number, number];
  return `${key.slice(0, 7)}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
}

/** The Monday on or before `key`. Weeks start Monday, per Arabic convention. */
export function startOfWeek(key: DayKey): DayKey {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  // Date.UTC maps 1970-01-01 (a Thursday) to weekday 4. Shift so Monday is 0.
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(key, -weekday);
}

/**
 * The user's timezone, from their stored preference, validated.
 *
 * A caller that needs a guaranteed-valid zone should use this rather than
 * trusting `settings.timeZone`.
 */
export function resolveTimeZone(stored: string | null | undefined): string {
  return isValidTimeZone(stored) ? stored : "UTC";
}
