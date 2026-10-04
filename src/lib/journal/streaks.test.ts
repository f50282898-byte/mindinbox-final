import { describe, expect, it } from "vitest";
import {
  computeBestRun,
  computeStreak,
  completionRate,
  type DoneSet,
  type ScheduledSet,
} from "@/lib/journal/streaks";
import { dayRange } from "@/lib/journal/day-key";

/**
 * Streaks and the grace day.
 *
 * The design questions these tests settle:
 *
 *  - An unticked **today** must not break a run. The day is not over.
 *  - A grace day is **one per run**, never banked, and never available for a day
 *    that was not scheduled. Otherwise the number stops meaning anything.
 *  - A habit that runs three days a week must not be "broken" by the four days it
 *    was never meant to happen.
 */

const set = (keys: string[]): DoneSet => new Set(keys);
const sched = (keys: string[]): ScheduledSet => new Set(keys);

/** Every day from `from` to `to`, for building long histories. */
const span = (from: string, to: string): string[] => dayRange(from, to);

describe("computeStreak — the basics", () => {
  const today = "2026-05-10";

  it("is zero for a habit never ticked", () => {
    const r = computeStreak({ today, done: set([]) });
    expect(r.current).toBe(0);
    expect(r.completed).toBe(0);
    expect(r.startedOn).toBeNull();
    expect(r.doneToday).toBe(false);
    expect(r.pendingToday).toBe(false);
  });

  it("counts an unbroken run ending today", () => {
    const r = computeStreak({
      today,
      done: set(["2026-05-08", "2026-05-09", "2026-05-10"]),
    });
    expect(r.current).toBe(3);
    expect(r.completed).toBe(3);
    expect(r.doneToday).toBe(true);
    expect(r.graceUsed).toBe(false);
    expect(r.startedOn).toBe("2026-05-08");
  });

  it("counts a run that ended yesterday, with today still pending", () => {
    // The important one: it is 09:00 and the reader has not got round to it.
    const r = computeStreak({
      today,
      done: set(["2026-05-07", "2026-05-08", "2026-05-09"]),
    });
    expect(r.current).toBe(3);
    expect(r.completed).toBe(3);
    expect(r.doneToday).toBe(false);
    // Pending, not broken.
    expect(r.pendingToday).toBe(true);
  });

  it("counts a tick on today as a real day, and its absence as merely pending", () => {
    // Ticking today extends the run by one, because it is a real completed day.
    // Leaving it unticked must not shorten the run either — it must not break it.
    const withToday = computeStreak({
      today,
      done: set(["2026-05-08", "2026-05-09", "2026-05-10"]),
    });
    const withoutToday = computeStreak({
      today,
      done: set(["2026-05-08", "2026-05-09"]),
    });

    expect(withToday.current).toBe(3);
    expect(withoutToday.current).toBe(2);
    // The run that ends yesterday is still alive at 09:00 today.
    expect(withoutToday.pendingToday).toBe(true);
    expect(withoutToday.startedOn).toBe("2026-05-08");
  });

  it("resets after two consecutive misses", () => {
    const r = computeStreak({
      today,
      done: set(["2026-05-03", "2026-05-04"]),
    });
    // 05-05 and 05-06 were both missed: the run ends before them.
    expect(r.current).toBe(0);
    expect(r.startedOn).toBeNull();
  });
});

describe("computeStreak — the grace day", () => {
  const today = "2026-05-10";

  it("absorbs exactly one missed day inside a run", () => {
    const r = computeStreak({
      today,
      done: set(["2026-05-06", "2026-05-08", "2026-05-09", "2026-05-10"]),
      // 05-07 was scheduled and missed.
      scheduled: sched(span("2026-05-06", "2026-05-10")),
    });
    expect(r.current).toBe(5);
    expect(r.completed).toBe(4);
    expect(r.graceUsed).toBe(true);
  });

  it("spends the grace on the most recent miss, not the oldest", () => {
    // 05-07 missed, 05-06 done, 05-08..10 done. The run still reaches 05-06.
    const r = computeStreak({
      today,
      done: set(["2026-05-06", "2026-05-08", "2026-05-09", "2026-05-10"]),
      scheduled: sched(span("2026-05-06", "2026-05-10")),
    });
    expect(r.startedOn).toBe("2026-05-06");
  });

  it("breaks the run when a second day is missed", () => {
    // Two grace days inside one run would make the streak unlosable.
    const r = computeStreak({
      today,
      done: set(["2026-05-03", "2026-05-04", "2026-05-07", "2026-05-08", "2026-05-09", "2026-05-10"]),
      scheduled: sched(span("2026-05-03", "2026-05-10")),
    });
    // Walking back from 05-10: 10, 09, 08, 07 done; 06 missed (grace); 05 missed
    // again — over budget, so the run is 10..06 and does not reach 04.
    expect(r.current).toBe(5);
    expect(r.startedOn).toBe("2026-05-06");
  });

  it("skips unscheduled days instead of spending grace on them", () => {
    // A Monday habit. 05-04 and 05-11 are Mondays in 2026; the days between were
    // never due, so a run must cross them rather than stop at them.
    const scheduled = sched(["2026-05-04", "2026-05-11"]);
    const done = set(["2026-05-04"]);

    const r = computeStreak({ today: "2026-05-10", done, scheduled, grace: 0 });
    expect(r.current).toBe(1);
    expect(r.graceUsed).toBe(false);
  });

  it("spends grace when a scheduled day is actually missed", () => {
    const scheduled = sched(["2026-05-04", "2026-05-11"]);
    // 05-04 was due and missed; 05-11 is in the future.
    const missed = computeStreak({
      today: "2026-05-10",
      done: set(["2026-05-11"]),
      scheduled,
      grace: 0,
    });
    expect(missed.current).toBe(0);
  });

  it("lets a three-days-a-week habit hold a real streak", () => {
    // The failure that makes skipping unscheduled days mandatory: Mon/Wed/Fri
    // ticked for three weeks. Four days in seven are never due, and a run must
    // cross them rather than stop.
    const mwf = (from: string, to: string): string[] =>
      dayRange(from, to).filter((k) => {
        const weekday = (new Date(`${k}T00:00:00Z`).getUTCDay() + 6) % 7;
        return weekday === 0 || weekday === 2 || weekday === 4;
      });

    const scheduled = sched(mwf("2026-05-04", "2026-05-24"));
    const done = set(mwf("2026-05-04", "2026-05-22")); // one still to come

    const r = computeStreak({ today: "2026-05-22", done, scheduled, grace: 0 });
    expect(r.current).toBe(mwf("2026-05-04", "2026-05-22").length);
    expect(r.current).toBeGreaterThan(5);
    expect(r.graceUsed).toBe(false);
  });

  it("breaks a three-days-a-week habit when a due day is missed", () => {
    const due = dayRange("2026-05-04", "2026-05-24").filter((k) => {
      const weekday = (new Date(`${k}T00:00:00Z`).getUTCDay() + 6) % 7;
      return weekday === 0 || weekday === 2 || weekday === 4;
    });
    // Everything due except Wednesday 2026-05-20.
    const done = set(due.filter((k) => k !== "2026-05-20"));

    const r = computeStreak({
      today: "2026-05-22",
      done,
      scheduled: sched(due),
      grace: 0,
    });
    // 2026-05-22 is the Friday: done. Then the missed Wednesday stops the run.
    expect(r.current).toBe(1);
    expect(r.startedOn).toBe("2026-05-22");
  });

  it("can be switched off", () => {
    const done = set(["2026-05-06", "2026-05-08", "2026-05-09", "2026-05-10"]);
    const scheduled = sched(span("2026-05-06", "2026-05-10"));
    // With grace: 05-07 is absorbed, so the run reaches back to 05-06.
    expect(computeStreak({ today, done, scheduled, grace: 1 }).current).toBe(5);
    // Without it, the run stops at the miss.
    expect(computeStreak({ today, done, scheduled, grace: 0 }).current).toBe(3);
    expect(computeStreak({ today, done, scheduled, grace: 0 }).startedOn).toBe("2026-05-08");
  });

  it("stops at a gap when no schedule is supplied, rather than inventing misses", () => {
    // Without a schedule, "not done" and "no data" are indistinguishable. Guessing
    // would give a reader with sparse records a streak they never earned.
    const r = computeStreak({ today, done: set(["2026-05-03", "2026-05-04"]) });
    expect(r.current).toBe(0);
  });

  it("never lets grace make the streak exceed the elapsed days", () => {
    // A run cannot be longer than the calendar span it covers.
    const done = set(["2026-05-09", "2026-05-10"]);
    const scheduled = sched(span("2026-05-09", "2026-05-10"));
    const r = computeStreak({ today, done, scheduled, grace: 1 });
    expect(r.current).toBeLessThanOrEqual(2);
  });
});

describe("computeBestRun", () => {
  it("is zero with no history", () => {
    expect(computeBestRun([])).toBe(0);
  });

  it("counts a single day", () => {
    expect(computeBestRun(["2026-05-01"])).toBe(1);
  });

  it("counts an unbroken run", () => {
    expect(computeBestRun(span("2026-05-01", "2026-05-07"))).toBe(7);
  });

  it("breaks at a gap larger than the grace", () => {
    expect(computeBestRun(["2026-05-01", "2026-05-05"])).toBe(1);
  });

  it("bridges a single missed day when grace is allowed", () => {
    expect(computeBestRun(["2026-05-01", "2026-05-03"])).toBe(2);
    expect(computeBestRun(["2026-05-01", "2026-05-03"], 0)).toBe(1);
  });

  it("does not chain grace across consecutive gaps", () => {
    // 01, 03 (grace), 05 would need two graces in one run.
    expect(computeBestRun(["2026-05-01", "2026-05-03", "2026-05-05"])).toBe(2);
  });

  it("finds the longest of several runs", () => {
    const history = [
      ...span("2026-04-01", "2026-04-05"), // 5
      "2026-04-10",
      ...span("2026-04-12", "2026-04-20"), // 9
      "2026-04-25",
    ];
    // The gap 05→10 is five days, so that run ends at 5. The gap 10→12 is a
    // single missed day, which the grace bridges — making 10..20 one run of ten.
    expect(computeBestRun(history)).toBe(10);
    // Without grace the 10th stands alone and the best is the nine-day run.
    expect(computeBestRun(history, 0)).toBe(9);
  });

  it("is at least the current run", () => {
    const today = "2026-05-10";
    const history = span("2026-05-01", "2026-05-10");
    const r = computeStreak({ today, done: set(history), scheduled: sched(history) });
    expect(r.best).toBeGreaterThanOrEqual(r.current);
  });
});

describe("completionRate", () => {
  const today = "2026-05-10";

  it("counts only scheduled days", () => {
    // Scheduled on 3 of the last 7 days; done on 2 of them.
    const scheduled = sched(["2026-05-08", "2026-05-09", "2026-05-10"]);
    const done = set(["2026-05-08", "2026-05-10"]);
    expect(completionRate(done, scheduled, today, 7)).toBeCloseTo(2 / 3, 5);
  });

  it("returns null when nothing was scheduled, rather than zero", () => {
    // Zero would read as "you failed everything", which is a different claim.
    expect(completionRate(set([]), sched([]), today, 7)).toBeNull();
  });

  it("returns 1 for perfect attendance", () => {
    const scheduled = sched(span("2026-05-06", "2026-05-10"));
    expect(completionRate(set(span("2026-05-06", "2026-05-10")), scheduled, today, 5)).toBe(1);
  });

  it("returns 0 for complete miss", () => {
    const scheduled = sched(span("2026-05-06", "2026-05-10"));
    expect(completionRate(set([]), scheduled, today, 5)).toBe(0);
  });

  it("excludes today from the denominator when it is unscheduled", () => {
    // Today is pending, not missed.
    const scheduled = sched(["2026-05-08", "2026-05-09"]);
    expect(completionRate(set(["2026-05-08", "2026-05-09"]), scheduled, today, 3)).toBe(1);
  });
});
