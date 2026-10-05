"use client";

import { PERSONAS, type Persona } from "@/lib/ai/personas";

/**
 * Persona picker.
 *
 * Cards rather than a dropdown, because a philosopher is a choice worth seeing
 * not making blind: the line under each name is what the reader is choosing
 * between. A dropdown would hide exactly the information that makes the choice
 * meaningful.
 *
 * The selection is stored per conversation, not globally â€” switching philosopher
 * mid-thread should not rewrite what the earlier turns meant.
 */
export function PersonaCards({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="اختر فيلسوفك"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      {PERSONAS.map((p) => (
        <PersonaCard
          key={p.id}
          persona={p}
          selected={p.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function PersonaCard({
  persona,
  selected,
  onSelect,
}: {
  persona: Persona;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(persona.id)}
      className={`group flex items-start gap-4 rounded-2xl border p-4 text-start transition-colors ${
        selected
          ? "border-gold/55 bg-gold/[0.08]"
          : "border-gold/15 bg-gold/[0.04] hover:border-gold/35 hover:bg-gold/[0.07]"
      }`}
    >
      {/* Fixed square so the mark cannot reflow the row as cards differ. */}
      <span
        aria-hidden="true"
        className={`mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full border text-lg transition-colors ${
          selected ? "border-gold/50 text-gold-light" : "border-gold/25 text-gold-muted/70"
        }`}
      >
        {persona.symbol}
      </span>

      <span className="min-w-0 flex-1">
        <span className="display-arabic flex flex-wrap items-baseline gap-x-2 text-[0.98rem] font-bold text-gold-light">
          {persona.nameAr}
          <span className="display-latin text-[10px] tracking-widest text-ink-3">
            {persona.nameEn}
          </span>
        </span>

        {/* The style line: the reason to pick this one over another. */}
        <span className="display-arabic mt-1 block text-[0.8rem] leading-relaxed text-gold-muted/75">
          {persona.focusAr}
        </span>

        <span className="mt-1.5 block text-[0.7rem] text-ink-3">
          {persona.epithetAr} Â· {persona.years}
        </span>
      </span>
    </button>
  );
}

export default PersonaCards;
