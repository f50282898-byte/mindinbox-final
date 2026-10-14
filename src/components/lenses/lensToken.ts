/**
 * Philosopher lenses — presentation data derived from the persona registry.
 *
 * ## Nothing here is a second source of truth
 *
 * The four names, their order, their symbols and their epithets all come from
 * `PERSONAS` in `@/lib/ai/personas`. The landing page previously hardcoded
 * `AESOP — PLATO — RUMI — DOSTOEVSKY` as literal `<span>`s, which meant renaming a
 * persona in one file left the other showing a name that no longer existed. Adding
 * or removing a persona here is a one-line change in one place.
 *
 * ## The quotation rule, honoured
 *
 * `personas.ts` is explicit: a persona may reproduce a line verbatim only if that
 * line is in `VERIFIED_QUOTES` and listed in the persona's `verbatimQuoteIds`.
 * Two of the four — Dostoevsky and Aesop — have empty lists, Aesop deliberately,
 * because no line survives as his own words.
 *
 * So a lens with no verified quote falls back to that persona's `focusAr`: a line
 * *about* the lens, written by us, which can be displayed without attribution.
 * The result is that every lens has something to say and nothing is ever put in a
 * dead philosopher's mouth. A new lens therefore never needs a new quote written
 * for it — it only gets an attributed one if someone can verify the source.
 */

import { PERSONAS, VERIFIED_QUOTES, type Persona } from "@/lib/ai/personas";

export interface Lens {
  readonly id: string;
  readonly nameAr: string;
  readonly nameEn: string;
  readonly symbol: string;
  readonly epithetAr: string;
  /** The line shown under the strip. Either a verified quote or our own framing. */
  readonly lineAr: string;
  /** `true` when `lineAr` is a real quotation and needs an attribution rendered. */
  readonly lineIsQuote: boolean;
  readonly attributionAr: string | null;
  /** The CSS custom property carrying this philosopher's hue, as an RGB triplet. */
  readonly accentVar: string;
}

/**
 * Hue per persona.
 *
 * Deliberately not a lookup keyed by id that could fall through to a default: an
 * unrecognised id is a developer error, and throwing at module scope means it
 * breaks the build rather than shipping a philosopher rendered in the wrong colour.
 */
const ACCENT: Readonly<Record<string, string>> = {
  plato: "var(--lens-plato)",
  rumi: "var(--lens-rumi)",
  dostoevsky: "var(--lens-dostoevsky)",
  aesop: "var(--lens-aesop)",
};

function accentFor(id: string): string {
  const accent = ACCENT[id];
  if (!accent) {
    throw new Error(
      `No lens accent declared for persona "${id}". Add one to ACCENT in lensToken.ts ` +
        `and a matching --lens-* triplet in globals.css, or the strip renders the ` +
        `philosopher in a colour nobody chose.`
    );
  }
  return accent;
}

/** The first verified quote a persona is permitted to speak, if any. */
function verifiedLine(p: Persona): { text: string; attribution: string } | null {
  for (const id of p.verbatimQuoteIds) {
    const quote = VERIFIED_QUOTES[id];
    if (quote) return { text: quote.textAr, attribution: quote.attributionAr };
  }
  return null;
}

function toLens(p: Persona): Lens {
  const quote = verifiedLine(p);
  return {
    id: p.id,
    nameAr: p.nameAr,
    nameEn: p.nameEn,
    symbol: p.symbol,
    epithetAr: p.epithetAr,
    lineAr: quote ? quote.text : p.focusAr,
    lineIsQuote: quote !== null,
    attributionAr: quote ? quote.attribution : null,
    accentVar: accentFor(p.id),
  };
}

/** Every persona, as a lens, in the registry's own order. */
export const LENSES: readonly Lens[] = PERSONAS.map(toLens);

/**
 * Resolves a `?philosopher=` value to a lens.
 *
 * Returns `null` for anything unrecognised rather than silently falling back to
 * the first philosopher: a stale or hand-edited URL should land on the neutral
 * hero, not quietly put someone else's name on the button.
 */
export function lensById(id: string | null | undefined): Lens | null {
  if (!id) return null;
  return LENSES.find((l) => l.id === id) ?? null;
}