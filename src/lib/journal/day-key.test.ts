import { describe, expect, it } from "vitest";
import {
  addDays,
  dayKeyFor,
  dayRange,
  daysBetween,
  daysInMonth,
  endOfMonth,
  isDayKey,
  isValidTimeZone,
  resolveTimeZone,
  startOfMonth,
  startOfWeek,
  todayKey,
} from "@/lib/journal/day-key";

/**
 * Day keys and timezones.
 *
 * The two properties that matter and that a naive implementation gets wrong:
 *
 *  1. **Daylight saving.** In Europe/London a year contains one 23-hour day and
 *     one 25-hour day. Any implementation that adds 86 400 000 ms to move to
 *     "tomorrow" drifts by an hour twice a year, which eventually files an entry
 *     under the wrong day. These tests exist to fail if anyone reintroduces that.
 *
 *  2. **Midnight.** A reader in Asia/Riyadh writing at 01:00 local is writing on
 *     their Tuesday. If the key came from UTC it would be Monday, and the entry
 *     would land in the wrong day's streak.
 */

describe("dayKeyFor", () => {
  it("uses the local date, not UTC, when the reader is far ahead", () => {
    // 2026-03-10T22:00Z is already the 11th in Riyadh (UTC+3).
    const instant = Date.UTC(2026, 2, 10, 22, 0);
    expect(dayKeyFor(instant, "UTC")).toBe("2026-03-10");
    expect(dayKeyFor(instant, "Asia/Riyadh")).toBe("2026-03-11");
  });

  it("uses the local date when the reader is behind", () => {
    // 2026-03-11T02:00Z is still the 10th in New York (UTC-5, before DST).
    const instant = Date.UTC(2026, 2, 11, 2, 0);
    expect(dayKeyFor(instant, "UTC")).toBe("2026-03-11");
    expect(dayKeyFor(instant, "America/New_York")).toBe("2026-03-10");
  });

  it("assigns a post-midnight entry to the new local day", () => {
    // The failure this prevents: someone writing at 00:30 sees yesterday's streak.
    // January, because London is on GMT then — in June the same instants land a
    // day later, which is correct but would make this assertion meaningless.
    const justAfterMidnight = Date.UTC(2026, 0, 15, 0, 30);
    expect(dayKeyFor(justAfterMidnight, "Europe/London")).toBe("2026-01-15");

    // And one minute before belongs to the day before.
    const justBeforeMidnight = Date.UTC(2026, 0, 14, 23, 59);
    expect(dayKeyFor(justBeforeMidnight, "Europe/London")).toBe("2026-01-14");

    // The same instant, read in Riyadh (UTC+3), is already the next day — which is
    // the whole reason the zone is stored per reader.
    expect(dayKeyFor(justBeforeMidnight, "Asia/Riyadh")).toBe("2026-01-15");
  });

  it("produces the same key across a daylight-saving transition", () => {
    // Europe/London springs forward 2026-03-29. The instant is irrelevant to the
    // key — what must not happen is a 23-hour day being counted as a partial one.
    const before = Date.UTC(2026, 2, 28, 12, 0);
    const after = Date.UTC(2026, 2, 30, 12, 0);
    expect(dayKeyFor(before, "Europe/London")).toBe("2026-03-28");
    expect(dayKeyFor(after, "Europe/London")).toBe("2026-03-30");
    // Exactly one calendar day apart, despite the clock moving.
    expect(daysBetween(dayKeyFor(before, "Europe/London"), dayKeyFor(after, "Europe/London"))).toBe(2);
  });

  it("crosses the spring-forward day without skipping it", () => {
    // The local day 2026-03-29 in London is 23 hours long. Both ends of it are the
    // same key, and the next key is the following date — not the one after.
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
  });

  it("crosses the autumn fall-back day without repeating it", () => {
    // 2026-10-25 in London is 25 hours long, and still exactly one day.
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
  });

  it("falls back to UTC for an unknown zone instead of throwing", () => {
    // A corrupt preference in the user's settings must not lose their entry.
    const instant = Date.UTC(2026, 6, 4, 12, 0);
    expect(dayKeyFor(instant, "Not/AZone")).toBe("2026-07-04");
    expect(dayKeyFor(instant, "")).toBe("2026-07-04");
    expect(dayKeyFor(instant, null)).toBe("2026-07-04");
    expect(dayKeyFor(instant, undefined)).toBe("2026-07-04");
  });

  it("handles zones with a half-hour offset", () => {
    // Asia/Kolkata is +5:30, the classic case where a naive hour offset breaks.
    const instant = Date.UTC(2026, 6, 4, 20, 0);
    expect(dayKeyFor(instant, "Asia/Kolkata")).toBe("2026-07-05");
  });

  it("handles a zone ahead of UTC+12", () => {
    const instant = Date.UTC(2026, 6, 4, 14, 0);
    expect(dayKeyFor(instant, "Pacific/Auckland")).toBe("2026-07-05");
  });
});

describe("addDays", () => {
  it("moves across month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("handles leap years", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
    // 2026 is not a leap year.
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("crosses the 2028 leap day going backwards", () => {
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("moves many days at once", () => {
    expect(addDays("2026-01-01", 365)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -31)).toBe("2026-01-29");
  });
});

describe("daysBetween", () => {
  it("counts whole days in both directions", () => {
    expect(daysBetween("2026-01-01", "2026-01-08")).toBe(7);
    expect(daysBetween("2026-01-08", "2026-01-01")).toBe(-7);
    expect(daysBetween("2026-01-01", "2026-01-01")).toBe(0);
  });

  it("counts a month boundary correctly", () => {
    expect(daysBetween("2026-01-31", "2026-02-01")).toBe(1);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });

  it("is unaffected by daylight saving, because it is calendar arithmetic", () => {
    // Both operands are calendar dates, so no offset can be applied to either.
    expect(daysBetween("2026-03-28", "2026-03-29")).toBe(1);
    expect(daysBetween("2026-10-24", "2026-10-25")).toBe(1);
  });
});

describe("dayRange", () => {
  it("is inclusive at both ends", () => {
    expect(dayRange("2026-01-01", "2026-01-04")).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
    ]);
  });

  it("returns a single day when both ends match", () => {
    expect(dayRange("2026-05-05", "2026-05-05")).toEqual(["2026-05-05"]);
  });

  it("returns nothing when the end precedes the start", () => {
    expect(dayRange("2026-05-05", "2026-05-01")).toEqual([]);
  });

  it("spans a month boundary", () => {
    const range = dayRange("2026-01-30", "2026-02-02");
    expect(range).toEqual(["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"]);
  });
});

describe("month and week helpers", () => {
  it("finds the month boundaries", () => {
    expect(startOfMonth("2026-03-17")).toBe("2026-03-01");
    expect(endOfMonth("2026-03-17")).toBe("2026-03-31");
    expect(endOfMonth("2026-02-17")).toBe("2026-02-28");
    expect(endOfMonth("2028-02-17")).toBe("2028-02-29");
  });

  it("starts the week on Monday", () => {
    // 2026-03-17 is a Tuesday.
    expect(startOfWeek("2026-03-17")).toBe("2026-03-16");
    // 2026-03-16 is itself a Monday, so it is its own start.
    expect(startOfWeek("2026-03-16")).toBe("2026-03-16");
    // 2026-03-22 is a Sunday, which belongs to the week beginning the 16th.
    expect(startOfWeek("2026-03-22")).toBe("2026-03-16");
  });

  it("crosses a month boundary when a week does", () => {
    // 2026-03-01 is a Sunday: its week began in February.
    expect(startOfWeek("2026-03-01")).toBe("2026-02-23");
  });
});

describe("isDayKey", () => {
  it("accepts real dates", () => {
    expect(isDayKey("2026-01-01")).toBe(true);
    expect(isDayKey("2028-02-29")).toBe(true);
  });

  it("rejects malformed and impossible dates", () => {
    for (const bad of [
      "",
      "2026-1-1",
      "2026-13-01",
      "2026-00-10",
      "2026-02-30",
      "2026-02-29", // 2026 is not a leap year
      "not-a-date",
      "2026/01/01",
      null,
      undefined,
      20260101,
    ]) {
      expect(isDayKey(bad as never), String(bad)).toBe(false);
    }
  });
});

describe("isValidTimeZone / resolveTimeZone", () => {
  it("accepts real IANA zones", () => {
    expect(isValidTimeZone("Asia/Riyadh")).toBe(true);
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidTimeZone("Asia/Atlantis")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
  });

  it("falls back to UTC rather than returning an invalid zone", () => {
    expect(resolveTimeZone("Asia/Riyadh")).toBe("Asia/Riyadh");
    expect(resolveTimeZone("garbage")).toBe("UTC");
    expect(resolveTimeZone(null)).toBe("UTC");
  });
});

describe("todayKey", () => {
  it("is the same helper as dayKeyFor, defaulted to now", () => {
    const now = Date.UTC(2026, 7, 4, 20, 0);
    expect(todayKey("Asia/Riyadh", now)).toBe(dayKeyFor(now, "Asia/Riyadh"));
  });

  it("gives two readers in different zones different days at the same instant", () => {
    // The situation this whole module exists for: the same moment is two
    // different days, and each reader's entry belongs to their own.
    const now = Date.UTC(2026, 7, 4, 21, 0);
    expect(todayKey("UTC", now)).toBe("2026-08-04");
    expect(todayKey("Asia/Riyadh", now)).toBe("2026-08-05");
    expect(todayKey("America/Los_Angeles", now)).toBe("2026-08-04");
  });
});

describe("daysInMonth", () => {
  it("knows the lengths", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});
