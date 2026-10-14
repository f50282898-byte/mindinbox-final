"use client";

import { useId, useState } from "react";
import { LENSES, type Lens } from "@/components/lenses/lensToken";

/**
 * The philosopher lenses.
 *
 * Replaces a row of static `<span>`s. The interaction is a two-state split that
 * most people expect without being told:
 *
 *  - **Hover or focus** *previews*. The halo warms, the line appears. Nothing is
 *    committed, so moving across the row is free and reversible — you can look at
 *    all four without having chosen anything.
 *  - **Click or Enter** *commits*. The portal button rewrites itself to name this
 *    philosopher, and that selection is what travels to `/enter`.
 *
 * The preview decays back to the committed lens on mouse leave, which is what
 * makes the strip feel like an instrument rather than a row of links.
 *
 * ## Keyboard
 *
 * A `radiogroup`, because that is exactly what it is: one choice from a set.
 * Arrow keys move between lenses, Home/End jump to the ends, and the roving
 * tabindex means Tab enters and leaves the group as one stop instead of four.
 * A plain list of buttons would put a reader's focus on all four in sequence and
 * announce nothing about how many choices there are.
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
    // Move real focus, not just the roving index, or the keyboard and the pointer
    // disagree about which lens is focused.
    const el = document.getElementById(`${groupLabel}-${next.id}`);
    el?.focus();
  };

  /** Home/End are absolute jumps, so they wrap nowhere. */
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
        className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 sm:gap-x-7"
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
              className={`group flex items-baseline gap-2 text-[11px] uppercase tracking-[0.32em] transition-colors duration-500 sm:text-xs ${
                isOn ? "text-gold-light" : "text-ink-3 hover:text-gold-muted"
              }`}
            >
              <span className="display-latin text-base leading-none">{lens.symbol}</span>
              <span className="display-latin">{lens.nameEn}</span>
              {isChosen && (
                <span aria-hidden="true" className="h-px w-4 self-center bg-gold/70" />
              )}
            </button>
          );
        })}
      </div>

      {/*
        The line. `key` forces a remount per philosopher so the fade actually
        replays — without it React would only animate the first line and the rest
        would appear instantly, which reads as a glitch rather than a reveal.

        `aria-live="polite"` because this is a genuine answer to "what did I just
        hover", and a screen reader should hear it. It is not a live region that
        fires on every pointer move — only on a change of philosopher.
      */}
      <div aria-live="polite" className="mt-6 flex min-h-[4.5rem] w-full max-w-2xl items-start justify-center px-2">
        {showing && (
          <figure
            key={showing.id}
            className="animate-fade-rise text-center"
            style={{ animationDuration: "0.7s" }}
          >
            <blockquote className="display-arabic text-base leading-loose text-gold-muted/90 sm:text-lg">
              {showing.lineIsQuote ? `«${showing.lineAr}»` : showing.lineAr}
            </blockquote>
            <figcaption className="mt-2 text-[11px] tracking-[0.25em] text-ink-3">
              {showing.lineIsQuote && showing.attributionAr
                ? `${showing.attributionAr} — ${showing.epithetAr}`
                : showing.epithetAr}
            </figcaption>
          </figure>
        )}
      </div>

      {!compact && !committed && (
        /* Full `text-ink-3`, not `/70`: at 11px this is below the 3:1 floor for
           body text on `--bg-1`, and `verify-contrast` fails the build on it. The
           line earns its contrast — it is the only instruction telling a reader
           that skipping the choice is allowed. */
        <p className="mt-1 text-[11px] tracking-[0.2em] text-ink-3">
          أو تابع دون اختيار — تدخل إلى العزلة مباشرة
        </p>
      )}
    </div>
  );
}

export default PhilosopherLenses;