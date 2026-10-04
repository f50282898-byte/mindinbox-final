import { describe, expect, it } from "vitest";
import {
  buildExport,
  downloadText,
  exportFilename,
  summarisePeriod,
  toCsv,
  toJson,
} from "@/lib/journal/export";
import type { DayDocument, Habit, JournalSettings, Principle } from "@/lib/journal/types";

/**
 * Export.
 *
 * Two things must hold and are easy to lose:
 *
 *  1. **Absence stays absence.** An un-rated mood exports as an empty cell, not as
 *     0. A 0 in a spreadsheet is a claim — "you rated your mood as the lowest" —
 *     and the reader did not make it.
 *  2. **Arabic survives the round trip.** CSV has no notion of right-to-left, so a
 *     missing BOM turns a correct export into mojibake on the reader's screen and
 *     makes their journal look corrupt.
 */

const settings: JournalSettings = {
  timeZone: "Asia/Riyadh",
  aiJournalConsent: false,
  habitsLimit: 3,
  historyDaysLimit: 30,
};

const habit = (id: string, title: string, overrides: Partial<Habit> = {}): Habit => ({
  id,
  title,
  weekdays: [],
  grace: 1,
  archived: false,
  createdAt: 0,
  updatedAt: 0,
  order: 0,
  ...overrides,
});

const day = (overrides: Partial<DayDocument> = {}): DayDocument => ({
  date: "2026-05-10",
  timeZone: "Asia/Riyadh",
  updatedAt: 1,
  ...overrides,
});

describe("buildExport", () => {
  it("carries the timezone, without which the day keys mean nothing", () => {
    const payload = buildExport({
      days: { "2026-05-10": day() },
      habits: [],
      principles: [],
      settings,
    });
    expect(payload.timeZone).toBe("Asia/Riyadh");
    expect(payload.schema).toBe(1);
  });

  it("sorts days ascending so two exports diff cleanly", () => {
    const payload = buildExport({
      days: {
        "2026-05-12": day({ date: "2026-05-12" }),
        "2026-05-10": day({ date: "2026-05-10" }),
        "2026-05-11": day({ date: "2026-05-11" }),
      },
      habits: [],
      principles: [],
      settings,
    });
    expect(payload.days.map((d) => d.date)).toEqual([
      "2026-05-10",
      "2026-05-11",
      "2026-05-12",
    ]);
  });

  it("includes the reader's own consent flag verbatim", () => {
    // Their export should tell them what they had set, not a sanitised version.
    const payload = buildExport({
      days: {},
      habits: [],
      principles: [],
      settings: { ...settings, aiJournalConsent: true },
    });
    expect(payload.settings.aiJournalConsent).toBe(true);
  });

  it("round-trips through JSON without loss", () => {
    const original = day({
      checkIn: { energy: 3, focus: 4, mood: 5, tags: ["قراءة", "مشي"] },
      journal: [{ template: "evening", text: "نص فيه , و \"أقواس\"", updatedAt: 9 }],
      habits: { h1: { done: true, note: "ملاحظة", updatedAt: 2 } },
      virtues: { wisdom: 4, justice: 2 },
      practice: { read: true, applied: false, reflected: true },
    });

    const payload = buildExport({
      days: { [original.date]: original },
      habits: [habit("h1", "قراءة")],
      principles: [{ id: "p1", text: "لا تؤجل عمل اليوم", createdAt: 1 }],
      settings,
    });

    const parsed = JSON.parse(toJson(payload)) as typeof payload;
    expect(parsed.days[0]).toEqual(original);
    expect(parsed.principles[0]?.text).toBe("لا تؤجل عمل اليوم");
  });
});

describe("toCsv", () => {
  const days = {
    "2026-05-10": day({
      date: "2026-05-10",
      checkIn: { energy: 3, focus: 4, tags: ["قراءة"] },
      habits: { h1: { done: true, updatedAt: 1 } },
      virtues: { wisdom: 4 },
      journal: [{ template: "morning", text: "نية اليوم", updatedAt: 1 }],
      practice: { read: true },
    }),
    // No ratings at all: the row must exist, with empty cells.
    "2026-05-11": day({ date: "2026-05-11" }),
  };

  const habits = [habit("h1", "قراءة"), habit("h2", "مشي", { order: 1 })];

  it("starts with a BOM so Arabic survives Excel on Windows", () => {
    const csv = toCsv({ days, habits });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("writes one row per day, including the empty one", () => {
    const lines = toCsv({ days, habits }).replace(/^﻿/, "").trim().split("\r\n");
    expect(lines).toHaveLength(3);
  });

  it("leaves an unrated mood empty rather than writing zero", () => {
    const csv = toCsv({ days, habits }).replace(/^﻿/, "");
    const rows = csv.trim().split("\r\n");
    const emptyRow = rows[2] as string;
    // The first four columns are date, energy, focus, mood.
    expect(emptyRow.split(",").slice(0, 4)).toEqual(["2026-05-11", "", "", ""]);
  });

  it("writes a tick as نعم and leaves an unticked habit empty", () => {
    const csv = toCsv({ days, habits }).replace(/^﻿/, "");
    const rows = csv.trim().split("\r\n");
    expect(rows[1]).toContain("نعم");
    // The habit column for the empty day is absent, not "لا" — which would be a
    // judgement rather than an observation.
    expect(rows[2]).not.toContain("لا");
  });

  it("quotes prose containing commas, quotes and newlines", () => {
    const tricky = {
      "2026-05-12": day({
        date: "2026-05-12",
        journal: [
          {
            template: "free" as const,
            text: 'سطر فيه , ثم "أقواس"\nثم سطر آخر',
            updatedAt: 1,
          },
        ],
      }),
    };
    const csv = toCsv({ days: tricky, habits: [] }).replace(/^﻿/, "");
    const rows = csv.trim().split("\r\n");

    // Doubled inner quotes, and the field wrapped in quotes because it contains
    // a comma, a quote and a newline. The embedded line break is preserved as the
    // original LF — normalising it would silently rewrite the reader's prose.
    expect(rows[1]).toContain('""أقواس""');
    expect(rows[1]).toContain("\nثم سطر آخر");
    // And it all sits inside one quoted field, so the row is not split by it.
    expect(rows[1]).toMatch(/"سطر فيه , ثم ""أقواس""\nثم سطر آخر"/);
  });

  it("has a stable column order", () => {
    const a = toCsv({ days: { "2026-05-10": day() }, habits: [] }).replace(/^﻿/, "");
    const b = toCsv({ days: { "2026-05-11": day({ date: "2026-05-11" }) }, habits: [] }).replace(
      /^﻿/,
      ""
    );
    const headerA = a.split("\r\n")[0];
    const headerB = b.split("\r\n")[0];
    expect(headerA).toBe(headerB);
    expect(headerA).toContain("الطاقة");
    expect(headerA).toContain("المزاج");
  });

  it("excludes archived habits from the columns", () => {
    const csv = toCsv({
      days,
      habits: [habit("h1", "قراءة"), habit("h2", "مARCHIVE", { archived: true })],
    }).replace(/^﻿/, "");
    expect(csv.split("\r\n")[0]).not.toContain("mARCHIVE");
  });

  it("respects a date window", () => {
    const csv = toCsv({ days, habits, from: "2026-05-11", to: "2026-05-11" });
    expect(csv).toContain("2026-05-11");
    expect(csv).not.toContain("2026-05-10");
  });

  it("emits a header and a BOM for an empty journal", () => {
    const csv = toCsv({ days: {}, habits: [] });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.trim().split("\r\n")).toHaveLength(1);
  });
});

describe("summarisePeriod", () => {
  it("carries no text, only numbers", () => {
    // This is what can be shown without reading journal content.
    const summary = summarisePeriod([
      day({ checkIn: { energy: 3, focus: 4 }, practice: { read: true } }),
      day({ date: "2026-05-11", checkIn: { energy: 5 } }),
      day({ date: "2026-05-12" }),
    ]);

    expect(summary.averageEnergy).toBe(4);
    expect(summary.averageFocus).toBe(4);
    expect(summary.practiceDays).toBe(1);
    expect(JSON.stringify(summary)).not.toMatch(/[؀-ۿ]/);
  });

  it("ignores mood entirely", () => {
    // Mood is the most sensitive field; a summary has no reason to touch it.
    const summary = summarisePeriod([day({ checkIn: { mood: 1 } })]);
    expect(Object.keys(summary)).not.toContain("mood");
  });

  it("returns null averages rather than zeros", () => {
    const summary = summarisePeriod([day()]);
    expect(summary.averageEnergy).toBeNull();
    expect(summary.averageFocus).toBeNull();
  });

  it("counts a day as recorded when anything at all is present", () => {
    const summary = summarisePeriod([
      day({ journal: [{ template: "free", text: "x", updatedAt: 1 }] }),
      day({ date: "2026-05-11" }),
    ]);
    expect(summary.daysRecorded).toBe(1);
  });
});

describe("exportFilename", () => {
  it("is dated and sorted", () => {
    const name = exportFilename("csv", Date.UTC(2026, 4, 10, 12));
    expect(name).toBe("mindinbox-journal-2026-05-10.csv");
    expect(exportFilename("json", Date.UTC(2026, 4, 10, 12))).toMatch(/\.json$/);
  });
});

describe("downloadText", () => {
  it("does nothing outside a browser", () => {
    // Called from a route or a test without a DOM, it must not throw.
    expect(() => downloadText("x.csv", "a,b", "text/csv")).not.toThrow();
  });
});

/** The principles list is part of the export and must not be silently dropped. */
describe("principles in the export", () => {
  it("carries every principle", () => {
    const principles: Principle[] = [
      { id: "p1", text: "أبدأ بال 중요", createdAt: 2 },
      { id: "p2", text: "أترك الصباح هادئاً", createdAt: 1 },
    ];
    const payload = buildExport({ days: {}, habits: [], principles, settings });
    expect(payload.principles).toHaveLength(2);
    // Sorted by creation, so the reader reads them in the order they wrote them.
    expect(payload.principles[0]?.text).toBe("أترك الصباح هادئاً");
  });
});
