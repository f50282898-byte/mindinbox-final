/**
 * Export — JSON and CSV.
 *
 * ## What is exported, and what is not
 *
 * The export contains **only what the reader wrote**, addressed to them: their day
 * documents, their habits, their principles, their settings. No derived figure, no
 * AI output, no usage metric.
 *
 * Two fields are handled specially:
 *
 *  - **Mood** is included, because it is the reader's own data and an export that
 *    silently dropped it would be a lie about what they had recorded. It is never
 *    exported unless it exists.
 *  - **Nothing is read from the server.** The export is built from the local store,
 *    so it works with no connection and cannot leak anything the reader has not
 *    already got on their device.
 *
 * ## CSV and Arabic
 *
 * CSV has no notion of right-to-left text. Two consequences are handled here rather
 * than pushed to the reader's spreadsheet:
 *
 *  - A UTF-8 **BOM** is written. Without it, Excel on Windows renders Arabic as
 *    mojibake, and the reader concludes their journal is corrupt rather than that
 *    their spreadsheet is misconfigured.
 *  - Fields containing a comma, quote, or newline are quoted, and quotes are
 *    doubled. Journal prose contains all three.
 */

import type { DayDocument, Habit, JournalSettings, Principle, Rating } from "./types";
import type { DayKey } from "./day-key";
import { VIRTUES } from "./types";

export interface JournalExport {
  /** Version, so a future importer can tell what it is looking at. */
  schema: 1;
  exportedAt: string;
  /** The zone the day keys were computed in. Without it, keys are meaningless. */
  timeZone: string;
  habits: Habit[];
  principles: Principle[];
  settings: Omit<JournalSettings, "aiJournalConsent"> & { aiJournalConsent: boolean };
  days: DayDocument[];
}

/** Assembles the export payload. Ordered by date so diffs are readable. */
export function buildExport(args: {
  days: Record<string, DayDocument>;
  habits: Habit[];
  principles: Principle[];
  settings: JournalSettings;
  exportedAt?: number;
}): JournalExport {
  return {
    schema: 1,
    exportedAt: new Date(args.exportedAt ?? Date.now()).toISOString(),
    timeZone: args.settings.timeZone,
    habits: [...args.habits].sort((a, b) => a.order - b.order),
    principles: [...args.principles].sort((a, b) => a.createdAt - b.createdAt),
    settings: args.settings,
    days: Object.values(args.days).sort((a, b) => (a.date < b.date ? -1 : 1)),
  };
}

/** Pretty-printed JSON, for a file the reader can re-import or read. */
export function toJson(payload: JournalExport): string {
  return JSON.stringify(payload, null, 2);
}

/** Escapes one CSV field per RFC 4180. */
function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvField).join(",");
}

/**
 * CSV of the days, one row per day.
 *
 * Wide rather than long: a reader opening this in a spreadsheet wants to see the
 * week across, not to pivot a `key,value` table first.
 *
 * Columns are stable and ordered, so two exports a month apart diff cleanly.
 */
export function toCsv(args: {
  days: Record<string, DayDocument>;
  habits: Habit[];
  from?: DayKey;
  to?: DayKey;
}): string {
  const habits = args.habits.filter((h) => !h.archived).sort((a, b) => a.order - b.order);
  const rows = Object.values(args.days)
    .filter((d) => (!args.from || d.date >= args.from) && (!args.to || d.date <= args.to))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const header = [
    "التاريخ",
    "الطاقة",
    "التركيز",
    "المزاج",
    "الوسوم",
    ...habits.map((h) => h.title),
    ...VIRTUES,
    "نيّة الصباح",
    "مراجعة المساء",
    "سؤال اليوم",
    "صفحة حرة",
    "قرأت",
    "طبّقت",
    "تأمّلت",
  ];

  const lines = [csvRow(header)];

  for (const day of rows) {
    const journalFor = (template: string): string =>
      (day.journal ?? [])
        .filter((b) => b.template === template)
        .map((b) => b.text)
        .join("\n\n");

    lines.push(
      csvRow([
        day.date,
        day.checkIn?.energy ?? "",
        day.checkIn?.focus ?? "",
        // Mood is the reader's own entry, so it exports when present. Absent stays
        // an empty cell rather than becoming a zero.
        day.checkIn?.mood ?? "",
        (day.checkIn?.tags ?? []).join("، "),
        ...habits.map((h) => (day.habits?.[h.id]?.done ? "نعم" : "")),
        ...VIRTUES.map((v) => day.virtues?.[v] ?? ""),
        journalFor("morning"),
        journalFor("evening"),
        journalFor("question"),
        journalFor("free"),
        day.practice?.read ? "نعم" : "",
        day.practice?.applied ? "نعم" : "",
        day.practice?.reflected ? "نعم" : "",
      ])
    );
  }

  // A BOM so Excel on Windows reads the Arabic. Without it the export opens as
  // mojibake and looks corrupt rather than misconfigured.
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** A filename that sorts and is recognisable. */
export function exportFilename(kind: "json" | "csv", at: number): string {
  const d = new Date(at);
  const stamp = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return `mindinbox-journal-${stamp}.${kind}`;
}

/** Triggers a download in the browser. No-op outside one. */
export function downloadText(filename: string, text: string, mime: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Released on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Averages for the Oracle's descriptive notes, computed without the content. */
export interface PeriodSummary {
  daysRecorded: number;
  averageEnergy: number | null;
  averageFocus: number | null;
  practiceDays: number;
  habitTicks: number;
}

function avg(values: Rating[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

/** Numeric-only summary. Carries no text, so it needs no consent to produce. */
export function summarisePeriod(days: DayDocument[]): PeriodSummary {
  const energies: Rating[] = [];
  const focuses: Rating[] = [];
  let practiceDays = 0;
  let habitTicks = 0;
  let daysRecorded = 0;

  for (const day of days) {
    if (day.checkIn?.energy) energies.push(day.checkIn.energy);
    if (day.checkIn?.focus) focuses.push(day.checkIn.focus);
    if (day.practice?.read || day.practice?.applied || day.practice?.reflected) practiceDays += 1;
    habitTicks += Object.values(day.habits ?? {}).filter((h) => h.done).length;
    if (day.journal?.length || day.checkIn || day.practice) daysRecorded += 1;
  }

  return {
    daysRecorded,
    averageEnergy: avg(energies),
    averageFocus: avg(focuses),
    practiceDays,
    habitTicks,
  };
}
