"use client";

import { PERSONAS, type Persona } from "@/lib/ai/personas";

/**
 * Persona picker — each persona is a luxury glass card.
 *
 * Cards rather than a dropdown, because a philosopher is a choice worth seeing
 * not making blind: the line under each name is what the reader is choosing
 * between. A dropdown would hide exactly the information that makes the choice
 * meaningful.
 *
 * The selection is stored per conversation, not globally — switching philosopher
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
      role="group"
      aria-label="اختر فيلسوفك"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
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
      aria-pressed={selected}
      onClick={() => onSelect(persona.id)}
      className={`persona-choice group flex flex-col items-start gap-2 rounded-3xl border p-5 text-start transition-colors duration-200 ${
        selected
          ? "glass-strong border-gold/55 bg-gold/[0.08] shadow-[0_0_24px_rgba(212,175,55,0.10)]"
          : "glass border-gold/15 bg-white/[0.03] hover:border-gold/35 hover:bg-white/[0.05]"
      }`}
    >
      {/* Fixed square so the mark cannot reflow the row as cards differ. */}
      <span
        aria-hidden="true"
        className={`flex size-12 shrink-0 items-center justify-center rounded-full border text-2xl transition-colors ${
          selected
            ? "border-gold/50 text-gold-light bg-gold/[0.10]"
            : "border-gold/25 text-ink-2"
        }`}
      >
        {persona.symbol}
      </span>

      <span className="min-w-0 flex-1">
        <span className="display-arabic font-bold text-gold-light text-lg leading-tight">
          {persona.nameAr}
        </span>
        <span className="display-latin text-[10px] tracking-widest text-ink-2 mt-0.5 block">
          {persona.nameEn}
        </span>

        {/* The school of thought: the reason to pick this one over another. */}
        <span className="display-arabic mt-2 block text-[11px] tracking-[0.22em] uppercase text-ink-2">
          {persona.epithetAr}
        </span>

        <span className="mt-2 block text-[0.88rem] leading-relaxed text-ink-2">
          {persona.focusAr}
        </span>

        <span className="mt-3 block text-[11px] tracking-[0.16em] text-ink-2">
          {persona.years}
        </span>
      </span>
    </button>
  );
}

export default PersonaCards;
