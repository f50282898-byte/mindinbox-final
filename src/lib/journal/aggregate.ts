/**
 * Aggregation for the views.
 *
 * Pure functions from a set of day documents to the numbers each chart draws. Every
 * one is defined for **absence**: a day with no entry is not a zero, it is missing,
 * and the charts must be able to say so. Conflating the two is how a product ends
 * telling someone they were less consistent than they were.
 *
 * The habit–energy view is the one place where overclaiming is easy, so it is worth
 * being explicit about what it computes: Pearson's r over the days where *both* a
 * habit tick and an energy rating exist. It is a description of two columns in a
 * table the reader filled in. It is not a claim that the habit caused the energy,
 * and the UI is forbidden from phrasing it as one.
 */

import { addDays, dayRange, type DayKey } from "./day-key";
import { VIRTUES, type Habit, type DayDocument, type Virtue } from "./types";

export interface DayPoint {
  date: DayKey;
  /** Null when the reader did not rate. Never coerced to 0. */
  energy: number | null;
  focus: number | null;
  mood: number | null;
  habitsDone: number;
  habitsDue: number;
}

export interface Series {
  points: DayPoint[];
  /** Mean of the present values, or null when nothing was rated. */
  energyMean: number | null;
  focusMean: number | null;
  moodMean: number | null;
  /** Days with at least one habit ticked, over days with at least one due. */
  habitCompletion: number | null;
}

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

/**
 * Builds a dense day series across a window.
 *
 * Dense rather than sparse because the charts need every column to be positioned
 * correctly; a missing day is `null`, not absent.
 */
export function buildSeries(args: {
  days: Record<string, DayDocument>;
  habits: Habit[];
  from: DayKey;
  to: DayKey;
  /** Returns the weekday indices a habit is due on, given a day key. */
  isDue: (habit: Habit, key: DayKey) => boolean;
}): Series {
  const active = args.habits.filter((h) => !h.archived);
  const points: DayPoint[] = [];

  for (const date of dayRange(args.from, args.to)) {
    const day = args.days[date];
    let habitsDone = 0;
    let habitsDue = 0;

    for (const habit of active) {
      if (!args.isDue(habit, date)) continue;
      habitsDue += 1;
      if (day?.habits?.[habit.id]?.done) habitsDone += 1;
    }

    points.push({
      date,
      energy: day?.checkIn?.energy ?? null,
      focus: day?.checkIn?.focus ?? null,
      // Mood is read but never inferred, and never defaulted to the mean of the
      // others — it is only ever what the reader set.
      mood: day?.checkIn?.mood ?? null,
      habitsDone,
      habitsDue,
    });
  }

  const energies = points.map((p) => p.energy).filter((v): v is number => v !== null);
  const focuses = points.map((p) => p.focus).filter((v): v is number => v !== null);
  const moods = points.map((p) => p.mood).filter((v): v is number => v !== null);
  const dueTotal = points.reduce((sum, p) => sum + p.habitsDue, 0);

  return {
    points,
    energyMean: mean(energies),
    focusMean: mean(focuses),
    moodMean: mean(moods),
    habitCompletion:
      dueTotal === 0 ? null : points.reduce((sum, p) => sum + p.habitsDone, 0) / dueTotal,
  };
}

/* ── Heatmap ─────────────────────────────────────────────────────────────── */

/** One cell of the heatmap. `value` null means no entry, not zero. */
export interface HeatCell {
  date: DayKey;
  /** 0…1 intensity, or null when there was nothing recorded. */
  value: number | null;
  /** What produced the intensity, for the tooltip and the screen reader. */
  kind: "entry" | "none";
}

export interface Heatmap {
  cells: HeatCell[];
  from: DayKey;
  to: DayKey;
  /** The highest value present, for scaling. Null when the window is empty. */
  peak: number | null;
}

/**
 * A heatmap of how much was recorded each day.
 *
 * Intensity is a blend of entries and habit ticks, capped at 1. Blending rather
 * than choosing means a reader who ticks four habits and writes nothing still sees
 * their days light up — which is the truth of their week, and refusing to show it
 * would privilege the writer over the doer.
 */
export function buildHeatmap(args: {
  days: Record<string, DayDocument>;
  habits: Habit[];
  from: DayKey;
  to: DayKey;
}): Heatmap {
  const active = args.habits.filter((h) => !h.archived);
  const cells: HeatCell[] = [];
  let peak: number | null = null;

  for (const date of dayRange(args.from, args.to)) {
    const day = args.days[date];
    const entries = day?.journal?.length ?? 0;
    const ticks = Object.values(day?.habits ?? {}).filter((h) => h.done).length;

    if (!day || (entries === 0 && ticks === 0)) {
      cells.push({ date, value: null, kind: "none" });
      continue;
    }

    const value = Math.min(1, entries / 3 + ticks / Math.max(1, active.length));
    cells.push({ date, value, kind: "entry" });
    if (peak === null || value > peak) peak = value;
  }

  return { cells, from: args.from, to: args.to, peak };
}

/* ── Virtues radar ───────────────────────────────────────────────────────── */

export interface RadarAxis {
  virtue: Virtue;
  /** Mean of the ratings actually given, or null. */
  value: number | null;
  /** How many days were rated, so a single day is not shown as a trend. */
  samples: number;
}

export interface Radar {
  axes: RadarAxis[];
  /** True when any axis rests on fewer than three days. */
  thin: boolean;
}

/** Mean virtue ratings over a window, with the sample count kept visible. */
export function buildRadar(args: {
  days: Record<string, DayDocument>;
  from: DayKey;
  to: DayKey;
}): Radar {
  const axes: RadarAxis[] = VIRTUES.map((virtue) => {
    const values: number[] = [];
    for (const date of dayRange(args.from, args.to)) {
      const rating = args.days[date]?.virtues?.[virtue];
      if (typeof rating === "number") values.push(rating);
    }
    return {
      virtue,
      value: values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length,
      samples: values.length,
    };
  });

  // Fewer than three days is not a pattern. The chart says so instead of drawing a
  // confident shape from two data points.
  const thin = axes.some((a) => a.samples > 0 && a.samples < 3);

  return { axes, thin };
}

/* ── Habit ↔ energy ──────────────────────────────────────────────────────── */

export interface Correlation {
  /** Pearson's r over the days where both columns exist, or null. */
  r: number | null;
  samples: number;
  /** A plain-language description. Deliberately not a causal claim. */
  wording: "no_data" | "too_few" | "moves_together" | "moves_apart" | "no_pattern";
}

export interface HabitEnergyPoint {
  date: DayKey;
  /** 0…1 — the share of due habits ticked that day. */
  completion: number;
  energy: number;
}

/**
 * Descriptive association between habit completion and energy.
 *
 * Computed only over days where the reader supplied both. Excluded days are
 * excluded, not imputed: filling them in would manufacture a correlation.
 *
 * The wording never contains "caused", "leads to" or "improves". It describes two
 * columns moving together in a table the reader filled in, which is all the data
 * supports.
 */
export function correlateHabitsWithEnergy(args: {
  series: Series;
}): Correlation {
  const pairs: HabitEnergyPoint[] = args.series.points
    // Only days with *both* columns. A day that was due and nothing was ticked is
    // a real low-completion observation, not missing data — excluding it would
    // quietly delete every bad day and inflate whatever relationship remained.
    .filter(
      (p): p is DayPoint & { energy: number } => p.energy !== null && p.habitsDue > 0
    )
    .map((p) => ({ date: p.date, completion: p.habitsDone / p.habitsDue, energy: p.energy }));

  if (pairs.length === 0) return { r: null, samples: 0, wording: "no_data" };
  if (pairs.length < 4) return { r: null, samples: pairs.length, wording: "too_few" };

  const n = pairs.length;
  const mx = pairs.reduce((s, p) => s + p.completion, 0) / n;
  const my = pairs.reduce((s, p) => s + p.energy, 0) / n;

  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const p of pairs) {
    const a = p.completion - mx;
    const b = p.energy - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }

  // A zero variance in either column means r is undefined, not zero.
  const r = dx === 0 || dy === 0 ? null : num / Math.sqrt(dx * dy);
  if (r === null) return { r: null, samples: n, wording: "no_pattern" };

  return {
    r,
    samples: n,
    wording: r >= 0.4 ? "moves_together" : r <= -0.4 ? "moves_apart" : "no_pattern",
  };
}

/* ── Week summary ────────────────────────────────────────────────────────── */

export interface WeekSummary {
  from: DayKey;
  to: DayKey;
  daysRecorded: number;
  daysInWindow: number;
  habitTicks: number;
  journalEntries: number;
  /** Notable days, by contribution. Empty rather than padded. */
  brightest: DayKey | null;
}

/** Descriptive counts for the week view. */
export function summariseWeek(args: {
  days: Record<string, DayDocument>;
  habits: Habit[];
  from: DayKey;
  to: DayKey;
}): WeekSummary {
  let daysRecorded = 0;
  let habitTicks = 0;
  let journalEntries = 0;
  let brightest: DayKey | null = null;
  let brightestScore = 0;

  const window = dayRange(args.from, args.to);

  for (const date of window) {
    const day = args.days[date];
    if (!day) continue;

    const entries = day.journal?.length ?? 0;
    const ticks = Object.values(day.habits ?? {}).filter((h) => h.done).length;
    const hasRating = typeof day.checkIn?.energy === "number";

    if (entries > 0 || ticks > 0 || hasRating) daysRecorded += 1;
    habitTicks += ticks;
    journalEntries += entries;

    const score = entries + ticks + (hasRating ? 1 : 0);
    if (score > brightestScore) {
      brightestScore = score;
      brightest = date;
    }
  }

  return {
    from: args.from,
    to: args.to,
    daysRecorded,
    daysInWindow: window.length,
    habitTicks,
    journalEntries,
    brightest,
  };
}

/** The window a chart covers, given a view and an anchor day. */
export function windowFor(
  view: "day" | "week" | "month" | "year",
  anchor: DayKey
): { from: DayKey; to: DayKey } {
  switch (view) {
    case "day":
      return { from: anchor, to: anchor };
    case "week":
      return { from: addDays(anchor, -6), to: anchor };
    case "month":
      return { from: `${anchor.slice(0, 7)}-01`, to: anchor };
    case "year":
      return { from: `${anchor.slice(0, 4)}-01-01`, to: anchor };
  }
}
