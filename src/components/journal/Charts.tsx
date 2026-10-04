"use client";

/**
 * The charts. Hand-drawn SVG — gold on volcanic, no charting library.
 *
 * ## Why no library
 *
 * Three reasons, in order of weight:
 *
 *  1. **Weight.** A charting library is 40–120 KB before the first chart is drawn.
 *    These are six small charts on two pages.
 *  2. **Colour.** The palette is CSS variables and a gold ramp with a light-theme
 *    counterpart. A library's defaults would need overriding, and any override
 *    drifts on the next upgrade.
 *  3. **Absence.** A missing datum must render as *nothing*, not as a zero. That is
 *    a rendering decision, and it is easier to make honestly in 30 lines of SVG than
 *    to configure out of a library that assumes a value is always present.
 *
 * ## Rules every chart here obeys
 *
 *  - A gap in the data is a gap in the line, not a drop to the floor.
 *  - Every chart carries a `role="img"` with a label, and a text summary beside it,
 *    because a screen reader cannot see a shape.
 *  - Colours come from tokens, so Parchment works without a second palette.
 *  - Nothing animates on scroll, and nothing animates at all under
 *    `prefers-reduced-motion`.
 */

import { useId } from "react";
import type { DayPoint, HeatCell, RadarAxis } from "@/lib/journal/aggregate";
import { addDays } from "@/lib/journal/day-key";
import { VIRTUE_AR } from "@/lib/journal/types";

const GOLD = "rgb(var(--gold))";
const GOLD_LIGHT = "rgb(var(--gold-light))";
const MUTED = "rgb(var(--gold-muted))";

/* ── Day / week bars ─────────────────────────────────────────────────────── */

export function DayBars({
  points,
  field,
  label,
}: {
  points: DayPoint[];
  field: "energy" | "focus" | "mood" | "habitsDone";
  label: string;
}) {
  const titleId = useId();
  const max = field === "habitsDone" ? Math.max(1, ...points.map((p) => p.habitsDue)) : 5;
  const given = points.filter((p) => (field === "habitsDone" ? p.habitsDue > 0 : p[field] !== null));

  const summary =
    given.length === 0
      ? "لا يوجد تسجيل في هذه الفترة."
      : field === "habitsDone"
        ? `${given.reduce((s, p) => s + p.habitsDone, 0)} علامة على ${given.reduce((s, p) => s + p.habitsDue, 0)} مستحقّة.`
        : `${label}: ${given.map((p) => p[field]).join("، ")}`;

  return (
    <figure className="m-0">
      <svg
        viewBox="0 0 320 96"
        className="h-24 w-full"
        role="img"
        aria-labelledby={titleId}
        preserveAspectRatio="none"
      >
        <title id={titleId}>{summary}</title>
        {points.map((point, i) => {
          const width = 320 / Math.max(1, points.length);
          const value = field === "habitsDone" ? point.habitsDone : point[field];
          const has = field === "habitsDone" ? point.habitsDue > 0 : value !== null;
          const ratio = has ? (value as number) / max : 0;
          const h = Math.max(has ? 3 : 0, ratio * 80);
          return (
            <rect
              key={point.date}
              x={i * width + width * 0.15}
              y={88 - h}
              width={width * 0.7}
              height={h}
              rx={2}
              /* No bar for an unrated day. A zero-height bar would still read as
                 "rated zero", which is the confusion this whole module avoids. */
              fill={has ? GOLD : "transparent"}
              opacity={has ? 0.85 : 1}
              stroke={has ? "none" : `rgb(var(--gold) / 0.18)`}
              strokeDasharray={has ? undefined : "2 2"}
              strokeWidth={has ? 0 : 1}
            >
              <title>{`${point.date}${has ? `: ${value}` : ": لا تسجيل"}`}</title>
            </rect>
          );
        })}
        <line x1={0} y1={88} x2={320} y2={88} stroke={`rgb(var(--gold) / 0.2)`} strokeWidth={1} />
      </svg>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}

/* ── Trend line ──────────────────────────────────────────────────────────── */

/**
 * A line that breaks at gaps.
 *
 * The path is built from contiguous runs only. Drawing through a missing day would
 * assert something was measured when nothing was, and the line would sit at zero
 * rather than nowhere.
 */
export function TrendLine({
  points,
  field,
  label,
}: {
  points: DayPoint[];
  field: "energy" | "focus" | "mood";
  label: string;
}) {
  const titleId = useId();
  const W = 320;
  const H = 96;
  const pad = 8;

  const runs: Array<Array<{ x: number; y: number; date: string }>> = [];
  let current: Array<{ x: number; y: number; date: string }> = [];

  points.forEach((point, i) => {
    const value = point[field];
    if (value === null) {
      if (current.length > 0) runs.push(current);
      current = [];
      return;
    }
    const x = pad + (i / Math.max(1, points.length - 1)) * (W - pad * 2);
    const y = H - pad - ((value - 1) / 4) * (H - pad * 2);
    current.push({ x, y, date: point.date });
  });
  if (current.length > 0) runs.push(current);

  const given = points.filter((p) => p[field] !== null);
  const summary =
    given.length === 0
      ? `${label}: لا يوجد تسجيل.`
      : `${label} عبر ${given.length} يوماً، بين ${Math.min(...given.map((p) => p[field] as number))} و${Math.max(...given.map((p) => p[field] as number))}.`;

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" role="img" aria-labelledby={titleId}>
        <title id={titleId}>{summary}</title>
        {[1, 3, 5].map((tick) => {
          const y = H - pad - ((tick - 1) / 4) * (H - pad * 2);
          return (
            <g key={tick}>
              <line
                x1={pad}
                y1={y}
                x2={W - pad}
                y2={y}
                stroke={`rgb(var(--gold) / 0.12)`}
                strokeWidth={1}
                strokeDasharray="2 4"
              />
              <text x={0} y={y + 3} fontSize={7} fill={MUTED}>
                {tick}
              </text>
            </g>
          );
        })}
        {runs.map((run, i) => (
          <g key={i}>
            {run.length === 1 ? (
              /* A single point cannot be a line. Drawn as a dot so the day is
                 still visible instead of vanishing. */
              <circle cx={run[0]?.x} cy={run[0]?.y} r={2.5} fill={GOLD_LIGHT}>
                <title>{`${run[0]?.date}: ${points.find((p) => p.date === run[0]?.date)?.[field]}`}</title>
              </circle>
            ) : (
              <polyline
                points={run.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={GOLD}
                strokeWidth={1.6}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {run.map((p) => (
              <circle key={p.date} cx={p.x} cy={p.y} r={1.8} fill={GOLD_LIGHT}>
                <title>{`${p.date}: ${points.find((d) => d.date === p.date)?.[field]}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}

/* ── Heatmap ─────────────────────────────────────────────────────────────── */

export function HeatmapGrid({
  cells,
  ariaLabel,
}: {
  cells: HeatCell[];
  ariaLabel: string;
}) {
  const titleId = useId();
  const recorded = cells.filter((c) => c.kind === "entry").length;

  return (
    <figure className="m-0">
      <svg
        viewBox="0 0 320 64"
        className="w-full"
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>{`${ariaLabel}: ${recorded} يوماً مسجّلاً من ${cells.length}.`}</title>
        {cells.map((cell, i) => {
          const columns = Math.min(16, cells.length);
          const size = 320 / columns;
          const row = Math.floor(i / columns);
          const col = i % columns;
          return (
            <rect
              key={cell.date}
              x={col * size + 1}
              y={row * (size * 0.8) + 1}
              width={size - 2}
              height={size * 0.8 - 2}
              rx={1.5}
              fill={
                cell.value === null
                  ? "transparent"
                  : `rgb(var(--gold) / ${(0.14 + cell.value * 0.66).toFixed(2)})`
              }
              stroke={cell.value === null ? `rgb(var(--gold) / 0.14)` : "none"}
              strokeWidth={cell.value === null ? 1 : 0}
            >
              <title>{`${cell.date}${cell.value === null ? ": لا تسجيل" : ""}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="display-arabic mt-2 text-xs text-gold-muted/55">
        {recorded === 0
          ? "لا شيء مسجّل بعد. أول يوم يكفي."
          : `${recorded} يوماً مسجّلاً.`}
      </figcaption>
    </figure>
  );
}

/* ── Virtues radar ───────────────────────────────────────────────────────── */

export function VirtueRadar({
  axes,
  thin,
}: {
  axes: RadarAxis[];
  thin: boolean;
}) {
  const titleId = useId();
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const r = 72;
  const rated = axes.filter((a) => a.value !== null);

  const pointAt = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
    return [cx + Math.cos(angle) * r * value, cy + Math.sin(angle) * r * value] as const;
  };

  const shape = axes
    .map((axis, i) => {
      if (axis.value === null) return null;
      const [x, y] = pointAt(i, (axis.value - 1) / 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");

  const summary =
    rated.length === 0
      ? "لم تُقيَّم أي فضيلة بعد."
      : rated.map((a) => `${VIRTUE_AR[a.virtue]}: ${a.value?.toFixed(1)} من ٥`).join("، ");

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto w-full max-w-[13rem]" role="img" aria-labelledby={titleId}>
        <title id={titleId}>{summary}</title>

        {/* Concentric rings at 1…5. */}
        {[0.25, 0.5, 0.75, 1].map((ring) => (
          <polygon
            key={ring}
            points={axes
              .map((_, i) => pointAt(i, ring).map((n) => n.toFixed(1)).join(","))
              .join(" ")}
            fill="none"
            stroke={`rgb(var(--gold) / ${(0.08 + ring * 0.06).toFixed(2)})`}
            strokeWidth={1}
          />
        ))}
        {axes.map((_, i) => {
          const [x, y] = pointAt(i, 1);
          return (
            <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={`rgb(var(--gold) / 0.12)`} strokeWidth={1} />
          );
        })}

        {shape && (
          <polygon
            points={shape}
            fill={`rgb(var(--gold) / 0.18)`}
            stroke={GOLD}
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
        )}

        {axes.map((axis, i) => {
          const [lx, ly] = pointAt(i, 1.22);
          return (
            <text
              key={axis.virtue}
              x={lx}
              y={ly}
              fontSize={9}
              fill={axis.value === null ? `rgb(var(--gold-muted) / 0.45)` : GOLD_LIGHT}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {VIRTUE_AR[axis.virtue]}
            </text>
          );
        })}
      </svg>

      <figcaption className="display-arabic mt-2 text-center text-xs leading-relaxed text-gold-muted/60">
        {rated.length === 0 ? (
          "لم تُقيَّم أي فضيلة بعد."
        ) : thin ? (
          /* Two days is not a shape. Saying so is more honest than drawing one. */
          <>
            قيّمت في {Math.min(...rated.map((a) => a.samples))} أيام فقط.
            <br />
            التقييم يحتاج ثلاثة أيام على الأقل ليُقال عنه شيء.
          </>
        ) : (
          summary
        )}
      </figcaption>
    </figure>
  );
}

/* ── Habit ↔ energy scatter ──────────────────────────────────────────────── */

/**
 * A scatter, deliberately not a fitted line.
 *
 * A trend line through scattered points implies a relationship the data may not
 * support, and a scatter without one lets the reader see the scatter for what it
 * is. The caption says the same thing in words.
 */
export function HabitEnergyScatter({
  points,
  wording,
}: {
  points: Array<{ date: string; completion: number; energy: number }>;
  wording: "no_data" | "too_few" | "moves_together" | "moves_apart" | "no_pattern";
}) {
  const titleId = useId();
  const W = 320;
  const H = 140;
  const pad = 16;

  const caption: Record<typeof wording, string> = {
    no_data: "لا توجد أيام فيها عادة مستحقّة وتقييم للطاقة معاً.",
    too_few: `أيام قليلة جداً (${points.length}) لا تكفي لشيء يُقال.`,
    moves_together: "الأيام التي أنجزت فيها أكثر هي الأيام التي كتبت فيها طاقتك أعلى.",
    moves_apart: "الأيام التي أنجزت فيها أكثر هي الأيام التي كتبت فيها طاقتك أقل.",
    no_pattern: "لا يظهر نمط واضح بين الإجازة والطاقة في هذه الفترة.",
  };

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-labelledby={titleId}>
        <title id={titleId}>{caption[wording]}</title>
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke={`rgb(var(--gold) / 0.2)`} strokeWidth={1} />
        <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke={`rgb(var(--gold) / 0.2)`} strokeWidth={1} />
        <text x={2} y={pad + 4} fontSize={7} fill={MUTED}>
          ٥
        </text>
        <text x={2} y={H - pad} fontSize={7} fill={MUTED}>
          ١
        </text>
        <text x={W - pad} y={H - pad + 9} fontSize={7} fill={MUTED} textAnchor="end">
          كل العادات
        </text>
        <text x={0} y={H - 2} fontSize={7} fill={MUTED}>
          لا شيء
        </text>

        {points.map((p) => {
          const x = pad + p.completion * (W - pad * 2);
          const y = H - pad - ((p.energy - 1) / 4) * (H - pad * 2);
          return (
            <circle
              key={p.date}
              cx={x}
              cy={y}
              r={3.5}
              fill={`rgb(var(--gold) / 0.55)`}
              stroke={GOLD_LIGHT}
              strokeWidth={0.8}
            >
              <title>{`${p.date}: ${Math.round(p.completion * 100)}٪ من العادات، طاقة ${p.energy}`}</title>
            </circle>
          );
        })}
      </svg>
      <figcaption className="display-arabic mt-2 text-xs leading-relaxed text-gold-muted/60">
        {caption[wording]}
      </figcaption>
      {/* The disclaimer is part of the chart, not a footnote. */}
      <p className="display-arabic mt-1 text-[0.7rem] leading-relaxed text-gold-muted/40">
        هذا وصف لما كتبته أنت في يومين، وليس ادعاءً بأن العادة تغيّر الطاقة.
      </p>
    </figure>
  );
}

/* ── Week strip ──────────────────────────────────────────────────────────── */

/** Seven day cells, marking recorded days. Fixed size, so the row never shifts. */
export function WeekStrip({ from, recorded }: { from: string; recorded: Set<string> }) {
  const titleId = useId();
  const week = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const names = ["إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت", "أحد"];

  return (
    <figure className="m-0">
      <div
        className="grid grid-cols-7 gap-1"
        role="img"
        aria-labelledby={titleId}
        aria-label={`أيام الأسبوع، ${recorded.size} منها مسجّل`}
      >
        {week.map((date, i) => {
          const on = recorded.has(date);
          return (
            <div key={date} className="flex flex-col items-center gap-1">
              <div
                className={`h-8 w-full rounded-md border ${
                  on ? "border-gold/50 bg-gold/25" : "border-gold/12 bg-transparent"
                }`}
                title={`${date}${on ? "" : " — لا تسجيل"}`}
              />
              <span className="display-arabic text-[0.6rem] text-gold-muted/55">{names[i]}</span>
            </div>
          );
        })}
      </div>
      <figcaption className="sr-only">
        {`${recorded.size} يوماً مسجّلاً من 7.`}
      </figcaption>
    </figure>
  );
}
