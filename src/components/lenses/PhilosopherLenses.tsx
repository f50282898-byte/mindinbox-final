"use client";

import { useId, useState } from "react";
import { LENSES, type Lens } from "@/components/lenses/lensToken";

/**
 * The philosopher lenses — rendered as a row of luxury glass cards.
 *
 * Each card is self-contained: the philosopher's glyph, his name, his school
 * (epithet), and his documented line (a verified quotation where one exists,
 * otherwise our own framing). Hover/focus previews a card; click commits it.
 *
 * The interaction model (radiogroup, roving tabindex, arrow navigation) is
 * unchanged — only the presentation moved from a row of tiny labels to cards.
 */

export interface PhilosopherLensesProps {
  /** The committed philosopher, or `null` for the neutral landing. */
  selected: string | null;
  onSelect: (id: string) => void;
  /** Hides the strip entirely when a philosopher is already chosen via URL. */
  compact?: boolean;
}

export function PhilosopherLenses({ selected, onSelect, compact = false }: PhilosopherLensesProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const groupLabel = useId();

  const committed = LENSES.find((l) => l.id === selected) ?? null;
  const showing: Lens | null = (preview ? LENSES.find((l) => l.id === preview) : null) ?? committed;

  /** Index of the lens that currently holds the group's single tab stop. */
  const rovingIndex = Math.max(
    0,
    LENSES.findIndex((l) => l.id === (selected ?? LENSES[0]?.id))
  );

  const move = (from: number, delta: number) => {
    const next = LENSES[(from + delta + LENSES.length) % LENSES.length];
    if (!next) return;
    setPreview(next.id);
    onSelect(next.id);
    const el = document.getElementById(`${groupLabel}-${next.id}`);
    el?.focus();
  };

  const jump = (to: number) => {
    const next = LENSES[Math.max(0, Math.min(LENSES.length - 1, to))];
    if (!next) return;
    setPreview(next.id);
    onSelect(next.id);
    document.getElementById(`${groupLabel}-${next.id}`)?.focus();
  };

  return (
    <div className="flex w-full flex-col items-center">
      <div
        role="radiogroup"
        aria-label="اختر فيلسوفاً"
        className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 sm:gap-x-6"
        onMouseLeave={() => setPreview(null)}
      >
        {LENSES.map((lens, i) => {
          const isOn = showing?.id === lens.id;
          const isChosen = committed?.id === lens.id;
          return (
            <button
              key={lens.id}
              id={`${groupLabel}-${lens.id}`}
              type="button"
              role="radio"
              aria-checked={isChosen}
              tabIndex={i === rovingIndex ? 0 : -1}
              onClick={() => {
                onSelect(lens.id);
                setPreview(lens.id);
              }}
              onMouseEnter={() => setPreview(lens.id)}
              onFocus={() => setPreview(lens.id)}
              onBlur={() => setPreview(null)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                  e.preventDefault();
                  move(i, 1);
                } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                  e.preventDefault();
                  move(i, -1);
                } else if (e.key === "Home") {
                  e.preventDefault();
                  jump(0);
                } else if (e.key === "End") {
                  e.preventDefault();
                  jump(LENSES.length - 1);
                }
              }}
              className={`group relative flex flex-col items-start gap-2 w-full max-w-[300px] rounded-2xl border p-4 text-start transition-all duration-500 ${
                isOn || isChosen
                  ? "glass-strong border-gold/50 bg-gold/[0.06] shadow-[0_0_24px_rgba(212,175,55,0.10)]"
                  : "glass border-gold/15 bg-white/[0.03] hover:border-gold/35 hover:bg-white/[0.05]"
              }`}
            >
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-white/[0.04] text-gold-light font-bold text-xl"
              >
                {lens.symbol}
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className="display-arabic flex flex-wrap items-baseline gap-x-2 font-bold text-gold-light"
                >
                  {lens.nameAr}
                  <span className="display-latin text-[10px] tracking-widest text-gold-muted/80">
                    {lens.nameEn}
                  </span>
                </span>
                {/* The school of thought — the reason to pick this lens over another. */}
                <span className="display-arabic mt-0.5 block text-[11px] tracking-[0.22em] uppercase text-gold-muted/80">
                  {lens.epithetAr}
                </span>
              </span>

              {/* The documented line — a verified quote where one exists. */}
              <span
                className="display-arabic mt-2 block text-[0.92rem] leading-relaxed text-gold-muted/80 italic"
              >
                {lens.lineIsQuote ? `«${lens.lineAr}»` : lens.lineAr}
              </span>
              {lens.lineIsQuote && lens.attributionAr && (
                <span className="display-latin mt-1 text-[10px] tracking-widest text-gold-muted/80">
                  {lens.attributionAr}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!compact && !committed && (
        /* Full `text-ink-3`, not `/70`: at small sizes this is above the 3:1 floor
           on `--bg-1`, and `verify-contrast` passes it at 100%. */
        <p className="mt-6 text-[12px] tracking-[0.2em] text-ink-3">
          أو تابع دون اختيار — تدخل إلى العزلة مباشرة
        </p>
      )}
    </div>
  );
}

export default PhilosopherLenses;
