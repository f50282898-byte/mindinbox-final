import { describe, expect, it } from "vitest";
import {
  buildHeatmap,
  buildRadar,
  buildSeries,
  correlateHabitsWithEnergy,
  summariseWeek,
  windowFor,
} from "@/lib/journal/aggregate";
import type { DayDocument, Habit, Rating } from "@/lib/journal/types";
import { dayRange } from "@/lib/journal/day-key";
import { weekdayOf } from "@/lib/journal/types";

/**
 * Aggregation.
 *
 * The property under test throughout is **absence is not zero**. A reader who did
 * not rate their energy did not rate it zero, and every one of these functions has
 * to be able to say "I do not know" rather than drawing a confident zero.
 */

const today = "2026-05-22";

function habit(id: string, overrides: Partial<Habit> = {}): Habit {
  return {
    id,
    title: id,
    weekdays: [],
    grace: 1,
    archived: false,
    createdAt: 0,
    updatedAt: 0,
    order: 0,
    ...overrides,
  };
}

/** A daily habit, so every day in the window is due. */
const daily = habit("daily");
const isDue = () => true;

function day(overrides: Partial<DayDocument> = {}): DayDocument {
  return { date: today, timeZone: "UTC", updatedAt: 1, ...overrides };
}

describe("buildSeries", () => {
  it("is dense: one point per day, with gaps as null", () => {
    const days = {
      "2026-05-20": day({ date: "2026-05-20", checkIn: { energy: 3 } }),
      "2026-05-22": day({ date: "2026-05-22", checkIn: { energy: 5 } }),
    };
    const series = buildSeries({ days, habits: [daily], from: "2026-05-20", to: "2026-05-22", isDue });

    expect(series.points).toHaveLength(3);
    expect(series.points[0]?.energy).toBe(3);
    // The absent day is null, never 0 — a zero would draw a real low point.
    expect(series.points[1]?.energy).toBeNull();
    expect(series.points[2]?.energy).toBe(5);
  });

  it("means only the values actually given", () => {
    const days = {
      "2026-05-21": day({ date: "2026-05-21", checkIn: { energy: 1 } }),
      "2026-05-22": day({ date: "2026-05-22", checkIn: { energy: 5 } }),
    };
    const series = buildSeries({ days, habits: [], from: "2026-05-21", to: "2026-05-22", isDue });
    // The mean of 1 and 5, not of 1, 0 and 5.
    expect(series.energyMean).toBe(3);
  });

  it("reports a null mean rather than zero when nothing was rated", () => {
    const series = buildSeries({ days: {}, habits: [], from: "2026-05-01", to: "2026-05-07", isDue });
    expect(series.energyMean).toBeNull();
    expect(series.focusMean).toBeNull();
    expect(series.moodMean).toBeNull();
    expect(series.habitCompletion).toBeNull();
  });

  it("reads mood only from what the reader set", () => {
    const days = {
      "2026-05-22": day({ date: "2026-05-22", checkIn: { energy: 4 } }),
    };
    const series = buildSeries({ days, habits: [], from: "2026-05-22", to: "2026-05-22", isDue });
    // Energy was rated; mood was not. Mood must not follow from energy.
    expect(series.points[0]?.energy).toBe(4);
    expect(series.points[0]?.mood).toBeNull();
  });

  it("ignores archived habits", () => {
    const archived = habit("archived", { archived: true });
    const days = { "2026-05-22": day({ date: "2026-05-22" }) };
    const series = buildSeries({
      days,
      habits: [archived],
      from: "2026-05-22",
      to: "2026-05-22",
      isDue: () => true,
    });
    expect(series.points[0]?.habitsDue).toBe(0);
  });

  it("respects the schedule when deciding what was due", () => {
    // Mondays only. Over a week, one day is due.
    const monday = habit("monday", { weekdays: [0] });
    const mondayOnly = (h: Habit, key: string) => h.weekdays.includes(weekdayOf(key));

    const series = buildSeries({
      days: {},
      habits: [monday],
      from: "2026-05-18", // Monday
      to: "2026-05-24",
      isDue: mondayOnly,
    });

    const due = series.points.filter((p) => p.habitsDue > 0);
    expect(due).toHaveLength(1);
  });

  it("computes habit completion over due days only", () => {
    const days = {
      "2026-05-20": day({ date: "2026-05-20", habits: { daily: { done: true, updatedAt: 1 } } }),
      "2026-05-21": day({ date: "2026-05-21", habits: { daily: { done: false, updatedAt: 1 } } }),
      "2026-05-22": day({ date: "2026-05-22", habits: { daily: { done: true, updatedAt: 1 } } }),
    };
    const series = buildSeries({ days, habits: [daily], from: "2026-05-20", to: "2026-05-22", isDue });
    expect(series.habitCompletion).toBeCloseTo(2 / 3, 5);
  });
});

describe("buildHeatmap", () => {
  it("marks an empty day as none, with a null value", () => {
    const map = buildHeatmap({ days: {}, habits: [], from: "2026-05-01", to: "2026-05-03" });
    expect(map.cells).toHaveLength(3);
    for (const cell of map.cells) {
      expect(cell.kind).toBe("none");
      expect(cell.value).toBeNull();
    }
    expect(map.peak).toBeNull();
  });

  it("lights a day up for a habit tick even with no writing", () => {
    // The reader who does four habits and writes nothing has still had a week.
    const habits = [habit("a"), habit("b"), habit("c"), habit("d")];
    const days = {
      "2026-05-02": day({
        date: "2026-05-02",
        habits: {
          a: { done: true, updatedAt: 1 },
          b: { done: true, updatedAt: 1 },
          c: { done: true, updatedAt: 1 },
          d: { done: true, updatedAt: 1 },
        },
      }),
    };
    const map = buildHeatmap({ days, habits, from: "2026-05-01", to: "2026-05-03" });
    const lit = map.cells.find((c) => c.date === "2026-05-02");
    expect(lit?.kind).toBe("entry");
    expect(lit?.value).toBeGreaterThan(0);
  });

  it("caps intensity at 1", () => {
    const days = {
      "2026-05-02": day({
        date: "2026-05-02",
        journal: Array.from({ length: 6 }, (_, i) => ({
          template: "free" as const,
          text: String(i),
          updatedAt: i,
        })),
        habits: { a: { done: true, updatedAt: 1 } },
      }),
    };
    const map = buildHeatmap({ days, habits: [habit("a")], from: "2026-05-01", to: "2026-05-03" });
    const cell = map.cells.find((c) => c.date === "2026-05-02");
    expect(cell?.value).toBeLessThanOrEqual(1);
  });

  it("has one cell per day across a month boundary", () => {
    const map = buildHeatmap({ days: {}, habits: [], from: "2026-01-30", to: "2026-02-02" });
    expect(map.cells.map((c) => c.date)).toEqual(dayRange("2026-01-30", "2026-02-02"));
  });
});

describe("buildRadar", () => {
  it("has one axis per virtue, always, even with no data", () => {
    const radar = buildRadar({ days: {}, from: "2026-05-01", to: "2026-05-07" });
    expect(radar.axes).toHaveLength(4);
    for (const axis of radar.axes) {
      expect(axis.value).toBeNull();
      expect(axis.samples).toBe(0);
    }
    // Nothing at all is not "thin data", it is no data.
    expect(radar.thin).toBe(false);
  });

  it("means only the ratings given", () => {
    const days = {
      "2026-05-20": day({ date: "2026-05-20", virtues: { wisdom: 5 } }),
      "2026-05-21": day({ date: "2026-05-21", virtues: { wisdom: 2 } }),
    };
    const radar = buildRadar({ days, from: "2026-05-20", to: "2026-05-21" });
    const wisdom = radar.axes.find((a) => a.virtue === "wisdom");
    expect(wisdom?.value).toBe(3.5);
    expect(wisdom?.samples).toBe(2);
  });

  it("flags a shape drawn from fewer than three days", () => {
    const days = {
      "2026-05-20": day({ date: "2026-05-20", virtues: { courage: 4 } }),
    };
    const radar = buildRadar({ days, from: "2026-05-20", to: "2026-05-22" });
    // One day is not a pattern, and the chart must say so rather than draw one.
    expect(radar.thin).toBe(true);
  });
});

describe("correlateHabitsWithEnergy", () => {
  /** Builds a series-shaped input directly, since that is what the function takes. */
  const seriesOf = (rows: Array<{ completion: number; energy: Rating }>) => ({
    points: rows.map((r, i) => ({
      date: `2026-05-${String(i + 1).padStart(2, "0")}`,
      energy: r.energy,
      focus: null,
      mood: null,
      habitsDone: r.completion > 0 ? 1 : 0,
      habitsDue: 1,
    })),
    energyMean: null,
    focusMean: null,
    moodMean: null,
    habitCompletion: null,
  });

  it("says so when there is no data", () => {
    const result = correlateHabitsWithEnergy({ series: seriesOf([]) });
    expect(result.wording).toBe("no_data");
    expect(result.r).toBeNull();
  });

  it("refuses to compute from fewer than four points", () => {
    const result = correlateHabitsWithEnergy({
      series: seriesOf([
        { completion: 1, energy: 5 },
        { completion: 0, energy: 1 },
      ]),
    });
    expect(result.wording).toBe("too_few");
    expect(result.r).toBeNull();
    expect(result.samples).toBe(2);
  });

  it("describes two columns moving together", () => {
    const result = correlateHabitsWithEnergy({
      series: seriesOf([
        { completion: 1, energy: 5 },
        { completion: 1, energy: 4 },
        { completion: 0, energy: 2 },
        { completion: 0, energy: 1 },
      ]),
    });
    expect(result.wording).toBe("moves_together");
    expect(result.r).toBeGreaterThan(0.9);
  });

  it("describes two columns moving apart", () => {
    const result = correlateHabitsWithEnergy({
      series: seriesOf([
        { completion: 1, energy: 1 },
        { completion: 1, energy: 2 },
        { completion: 0, energy: 4 },
        { completion: 0, energy: 5 },
      ]),
    });
    expect(result.wording).toBe("moves_apart");
    expect(result.r).toBeLessThan(-0.9);
  });

  it("reports no pattern when one column does not vary", () => {
    // Energy rated identically every day: r is undefined, not zero. Reporting 0
    // would be a claim — "these are unrelated" — where the truth is "there is
    // nothing here to compare".
    const result = correlateHabitsWithEnergy({
      series: seriesOf([
        { completion: 1, energy: 3 },
        { completion: 0, energy: 3 },
        { completion: 1, energy: 3 },
        { completion: 0, energy: 3 },
        { completion: 1, energy: 3 },
      ]),
    });
    expect(result.r).toBeNull();
    expect(result.wording).toBe("no_pattern");
    expect(result.samples).toBe(5);
  });

  it("describes a weak relationship as no pattern", () => {
    const result = correlateHabitsWithEnergy({
      series: {
        points: [
          { date: "2026-05-01", energy: 2, focus: null, mood: null, habitsDone: 2, habitsDue: 2 },
          { date: "2026-05-02", energy: 4, focus: null, mood: null, habitsDone: 1, habitsDue: 2 },
          { date: "2026-05-03", energy: 3, focus: null, mood: null, habitsDone: 2, habitsDue: 2 },
          { date: "2026-05-04", energy: 2, focus: null, mood: null, habitsDone: 1, habitsDue: 2 },
          { date: "2026-05-05", energy: 4, focus: null, mood: null, habitsDone: 2, habitsDue: 2 },
          { date: "2026-05-06", energy: 3, focus: null, mood: null, habitsDone: 1, habitsDue: 2 },
        ],
        energyMean: null,
        focusMean: null,
        moodMean: null,
        habitCompletion: null,
      },
    });
    expect(result.wording).toBe("no_pattern");
  });

  it("excludes days where either column is missing rather than imputing", () => {
    // Four days with both, one with energy only. The energy-only day must not
    // count as a completion of zero.
    const series = {
      points: [
        { date: "2026-05-01", energy: 5, focus: null, mood: null, habitsDone: 1, habitsDue: 1 },
        { date: "2026-05-02", energy: 4, focus: null, mood: null, habitsDone: 1, habitsDue: 1 },
        { date: "2026-05-03", energy: 2, focus: null, mood: null, habitsDone: 1, habitsDue: 1 },
        { date: "2026-05-04", energy: 1, focus: null, mood: null, habitsDone: 1, habitsDue: 1 },
        // No energy rating: excluded entirely.
        { date: "2026-05-05", energy: null, focus: null, mood: null, habitsDone: 0, habitsDue: 1 },
      ],
      energyMean: null,
      focusMean: null,
      moodMean: null,
      habitCompletion: null,
    };
    const result = correlateHabitsWithEnergy({ series });
    expect(result.samples).toBe(4);
  });

  it("never claims causation", () => {
    // The wording is the product surface here; a causal phrase would be a lie the
    // data cannot support.
    const result = correlateHabitsWithEnergy({
      series: seriesOf([
        { completion: 1, energy: 5 },
        { completion: 1, energy: 4 },
        { completion: 0, energy: 2 },
        { completion: 0, energy: 1 },
      ]),
    });
    const text = JSON.stringify(result.wording);
    expect(text).not.toMatch(/caus|because|leads|improv/i);
  });
});

describe("summariseWeek", () => {
  it("counts only days with something in them", () => {
    const days = {
      "2026-05-20": day({
        date: "2026-05-20",
        checkIn: { energy: 3 },
        journal: [{ template: "free", text: "x", updatedAt: 1 }],
      }),
      "2026-05-22": day({ date: "2026-05-22", habits: { daily: { done: true, updatedAt: 1 } } }),
    };
    const summary = summariseWeek({
      days,
      habits: [daily],
      from: "2026-05-20",
      to: "2026-05-22",
    });
    expect(summary.daysRecorded).toBe(2);
    expect(summary.daysInWindow).toBe(3);
    expect(summary.journalEntries).toBe(1);
    expect(summary.habitTicks).toBe(1);
  });

  it("leaves brightest null for an empty window rather than naming a day", () => {
    const summary = summariseWeek({ days: {}, habits: [], from: "2026-05-20", to: "2026-05-22" });
    expect(summary.brightest).toBeNull();
    expect(summary.daysRecorded).toBe(0);
  });

  it("names the most substantial day", () => {
    const days = {
      "2026-05-20": day({ date: "2026-05-20", checkIn: { energy: 3 } }),
      "2026-05-21": day({
        date: "2026-05-21",
        journal: [
          { template: "morning", text: "a", updatedAt: 1 },
          { template: "evening", text: "b", updatedAt: 2 },
        ],
      }),
    };
    const summary = summariseWeek({ days, habits: [], from: "2026-05-20", to: "2026-05-22" });
    expect(summary.brightest).toBe("2026-05-21");
  });
});

describe("windowFor", () => {
  it("covers the right span for each view", () => {
    expect(windowFor("day", "2026-05-22")).toEqual({ from: "2026-05-22", to: "2026-05-22" });
    expect(windowFor("week", "2026-05-22")).toEqual({ from: "2026-05-16", to: "2026-05-22" });
    expect(windowFor("month", "2026-05-22")).toEqual({ from: "2026-05-01", to: "2026-05-22" });
    expect(windowFor("year", "2026-05-22")).toEqual({ from: "2026-01-01", to: "2026-05-22" });
  });

  it("spans a year boundary correctly", () => {
    expect(windowFor("year", "2026-01-05")).toEqual({ from: "2026-01-01", to: "2026-01-05" });
  });
});
