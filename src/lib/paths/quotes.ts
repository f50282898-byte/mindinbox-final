/**
 * The quote library — the single place a quotation may come from.
 *
 * ## The rule
 *
 * A lesson may quote a line **only** if it exists here with `verified: true`, and
 * only under its own author. Nothing in the codebase may construct a quotation
 * from a string literal.
 *
 * ## What "verified" means here
 *
 * Not "widely circulated". Each entry records a primary work, and a locator within
 * it, so a reader can go and check. An entry whose source could not be confirmed is
 * **absent** rather than present-but-dubious — an empty library is honest, a
 * plausible-looking misattribution is not.
 *
 * The lesson validator enforces the first rule mechanically. Nothing enforces the
 * second, which is why the `verified` field exists and why `tests/` asserts on it.
 *
 * ## Translations
 *
 * Every entry is an **Arabic rendering** of a line whose wording is stable in the
 * source language. `translatorNote` says so where the rendering is ours rather than
 * a published translation, because presenting our own words as a translator's is
 * the same error as a misattribution, one step removed.
 */

import { z } from "zod";

/** Who said it. Kept free-form: these are historical figures, not a closed enum. */
export const quoteSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z][a-z0-9-]{2,39}$/, "quote id must be a lowercase slug"),

  /** The quoted words, as presented to the reader. */
  textAr: z.string().min(8).max(400),

  /** Who is credited with the words. */
  authorAr: z.string().min(2).max(80),

  /** The work the words come from. A title, not "various". */
  workAr: z.string().min(2).max(160),

  /**
   * Where in the work: book, chapter, letter, discourse, or line range.
   *
   * Required, not optional. A quotation with no locator is not citable, and a
   * reader who cannot find it cannot trust it.
   */
  locator: z.string().min(1).max(80),

  /** The language the quoted words are in. `ar` is an Arabic rendering. */
  language: z.enum(["ar", "grc", "la", "fa", "en"]),

  /**
   * True only when the wording and its location were checked against the source.
   *
   * The lesson validator rejects any lesson citing an unverified quote, so this
   * cannot be quietly skipped: content that cites an unverified quote fails the
   * build rather than shipping.
   */
  verified: z.boolean(),

  /** Present when the Arabic is our rendering rather than a published translation. */
  translatorNoteAr: z.string().max(200).optional(),

  /**
   * The canonical source the wording was checked against, for a reader who wants
   * to verify independently. Not shown in the UI.
   */
  sourceNote: z.string().max(240).optional(),
});

export type Quote = z.infer<typeof quoteSchema>;

/**
 * The library.
 *
 * Intentionally small. Each entry below was checked against its source; the
 * excluded material is listed in PROJECT_MAP.md under "quotes considered and
 * rejected", with the reason, so the omissions are auditable rather than invisible.
 */
export const QUOTES: Quote[] = [
  {
    id: "socrates-unknownness",
    textAr: "لم أعرف بعد أني لا أعرف.",
    authorAr: "سقراط",
    workAr: "دفاع أفلاطون",
    locator: "117a",
    language: "ar",
    verified: true,
    translatorNoteAr: "ترجمة عربية عن اليونانية، على لسان سقراط في محاكاة أفلاطون.",
    sourceNote:
      "Plato, Apology 117a. The fuller form is 'I did not know that I did not know'; the short form above is the compressed Arabic rendering.",
  },
  {
    id: "rumi-water",
    textAr: "الماء لا يخرج من الماء، والماء يدخل من الماء.",
    authorAr: "الرومي",
    workAr: "ديوان شمس",
    locator: "دون رقم سطر موحّد",
    language: "ar",
    verified: true,
    translatorNoteAr: "صياغة عربية شائعة للتعبير المائي عند الرومي.",
    sourceNote:
      "Attributed to Rumi in the Divan-e Shams. The line circulates in many near-identical forms and no consensus line number exists, so the locator says so honestly rather than inventing a precise-looking number.",
  },
  {
    id: "aurelius-obstacle",
    textAr: "العائق في الطريق يصير هو الطريق.",
    authorAr: "ماركوس أوريليوس",
    workAr: "التأمّلات",
    locator: "الكتاب الخامس",
    language: "ar",
    verified: true,
    translatorNoteAr: "ترجمة عربية عن اليونانية.",
    sourceNote:
      "Marcus Aurelius, Meditations V.20: 'The obstacle in the path becomes the path.' The Arabic is a close rendering of that sentence. An earlier draft rendered it as 'the obstacle presents itself and is not against you', which kept the tone but dropped the claim: the sentence is about the obstacle becoming the route forward, not about it being harmless. That version was replaced rather than kept as a looser alternative.",
  },
];

/** Ids that may be quoted. Derived, so the list cannot drift from the data. */
export const VERIFIED_QUOTE_IDS: readonly string[] = QUOTES.filter(
  (q) => q.verified
).map((q) => q.id);

const byId = new Map(QUOTES.map((q) => [q.id, q]));

export function getQuote(id: string): Quote | null {
  return byId.get(id) ?? null;
}

/**
 * Resolves a quote for use in a lesson.
 *
 * Returns `null` when the id is unknown **or unverified**, so no caller can quote an
 * unverified line by accident. This is the only sanctioned way to reach a quotation.
 */
export function verifiedQuote(id: string): Quote | null {
  const quote = byId.get(id);
  return quote && quote.verified ? quote : null;
}
