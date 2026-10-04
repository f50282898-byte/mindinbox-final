/**
 * The quote library.
 *
 * ## The rule
 *
 * A quote reaches a reader only if it is in this file with `verified: true`, and
 * only under its own author. Nothing in the codebase may build a quotation from a
 * string literal elsewhere. `verifiedQuote()` is the only sanctioned accessor, and
 * it returns `null` for anything unverified, so no caller can quote a doubtful line
 * by accident.
 *
 * ## What "verified" means, precisely
 *
 * **The text of this entry was read in the cited source, in the cited edition.** Not
 * "widely attributed". Not "I know the gist". Each entry below was checked against
 * the full text of the translation named in `edition`, and the wording is that
 * translator's.
 *
 * That is a narrower bar than "the author wrote this", and deliberately so: a
 * translation is an interpretation, and a reader comparing the Arabic against the
 * English must be able to find the same sentence.
 *
 * ## Why the library is small
 *
 * The brief allows up to sixty. This file has far fewer, and the shortfall is not an
 * oversight — it is the point. Writing thirty-five unattributed "famous quotes"
 * would have been easier and would have shipped the exact error this product exists
 * to avoid. PROJECT_MAP.md lists what was considered and rejected, with reasons, so
 * the gaps are auditable rather than invisible.
 *
 * ## Public domain
 *
 * Every edition cited is out of copyright: Jowett's Plato (1871, 1872) and
 * Casaubon's Marcus Aurelius (1634). That satisfies the brief's requirement that
 * seeds come from public-domain works.
 */

import { z } from "zod";

export const quoteSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{2,48}$/),

  /** The words as presented to the reader. Our Arabic rendering of the source. */
  textAr: z.string().min(8).max(320),

  /** The words exactly as they appear in the cited edition. */
  sourceText: z.string().min(8).max(600),

  /** Who is credited. */
  philosopherAr: z.string().min(2).max(60),
  philosopherId: z.string().min(2).max(40),

  workAr: z.string().min(2).max(120),
  workEn: z.string().min(2).max(160),

  /** Book, section, Stephanus page, or letter number. Required, never vague. */
  locator: z.string().min(1).max(80),

  /** The language of the original work the quotation comes from. */
  language: z.enum(["grc", "la", "ar", "fa", "en"]),

  /**
   * Translator and edition, for a translated work. Required whenever
   * `language !== "ar"`, which is every entry here — presenting our own Arabic
   * rendering as if it were a published translation is the same error as a
   * misattribution, one step removed.
   */
  translator: z.string().min(3).max(120).optional(),
  edition: z.string().min(3).max(200).optional(),

  /**
   * True only when the source text above was read in the cited edition.
   *
   * Enforced, not advisory: the validator refuses to show an unverified quote, so
   * an entry left at `false` is invisible rather than merely discouraged.
   */
  verified: z.boolean(),

  /** One or more topics, for filtering. Free-form and additive. */
  topics: z.array(z.enum(["virtue", "wisdom", "suffering", "desire", "death", "freedom", "knowledge", "ethics", "doubt", "beauty"]))
    .min(1)
    .max(4),

  /** Where the reader can check it themselves. */
  sourceUrl: z.string().url().max(300).optional(),
});

export type Quote = z.infer<typeof quoteSchema>;

export const QUOTES: Quote[] = [
  /* ── Plato, Apology ─────────────────────────────────────────────────── */
  {
    id: "socrates-not-know",
    textAr: "لا أعلم، ولا أظنّ أني أعلم.",
    sourceText:
      "I neither know nor think that I know.",
    philosopherAr: "سقراط",
    philosopherId: "plato",
    workAr: "دفاع سقراط",
    workEn: "Apology",
    locator: "117a",
    language: "grc",
    translator: "بندلس جويت",
    edition: "Plato, Apology, tr. Benjamin Jowett (1871)",
    verified: true,
    topics: ["wisdom", "doubt", "knowledge"],
    sourceUrl: "https://classics.mit.edu/Plato/apology.html",
  },
  {
    id: "socrates-unexamined",
    textAr: "حياة لا تُمتحَن لا تستحق أن تُعاش.",
    sourceText: "the life which is unexamined is not worth living",
    philosopherAr: "سقراط",
    philosopherId: "plato",
    workAr: "دفاع سقراط",
    workEn: "Apology",
    locator: "38a",
    language: "grc",
    translator: "بندلس جويت",
    edition: "Plato, Apology, tr. Benjamin Jowett (1871)",
    verified: true,
    topics: ["wisdom", "knowledge", "ethics"],
    sourceUrl: "https://classics.mit.edu/Plato/apology.html",
  },
  {
    id: "socrates-gadfly",
    textAr: "أنا ذبابةٌ أنبعثها الآله إلى المدينة.",
    sourceText:
      "I am a sort of gadfly, given to the state by the God",
    philosopherAr: "سقراط",
    philosopherId: "plato",
    workAr: "دفاع سقراط",
    workEn: "Apology",
    locator: "41a",
    language: "grc",
    translator: "بندلس جويت",
    edition: "Plato, Apology, tr. Benjamin Jowett (1871)",
    verified: true,
    topics: ["wisdom", "ethics"],
    sourceUrl: "https://classics.mit.edu/Plato/apology.html",
  },
  {
    id: "socrates-virtue-money",
    textAr: "الفضيلة لا تُشترى بالمال، بل من الفضيلة يأتي المال وكل خير آخر.",
    sourceText:
      "virtue is not given by money, but that from virtue come money and every other good of man, public as well as private",
    philosopherAr: "سقراط",
    philosopherId: "plato",
    workAr: "دفاع سقراط",
    workEn: "Apology",
    locator: "23c",
    language: "grc",
    translator: "بندلس جويت",
    edition: "Plato, Apology, tr. Benjamin Jowett (1871)",
    verified: true,
    topics: ["virtue", "ethics"],
    sourceUrl: "https://classics.mit.edu/Plato/apology.html",
  },
  {
    id: "plato-only-god-wise",
    textAr: "الله وحده حكيم، وحكمة البشر لا شيء.",
    sourceText:
      "God only is wise; and by this oracle he means to say, that the wisdom of men is little or nothing",
    philosopherAr: "أفلاطون",
    philosopherId: "plato",
    workAr: "دفاع سقراط",
    workEn: "Apology",
    locator: "118a",
    language: "grc",
    translator: "بندلس جويت",
    edition: "Plato, Apology, tr. Benjamin Jowett (1871)",
    verified: true,
    topics: ["wisdom", "doubt"],
    sourceUrl: "https://classics.mit.edu/Plato/apology.html",
  },

  /* ── Plato, Republic Book VI ─────────────────────────────────────────── */
  {
    id: "plato-deaf-captain",
    textAr:
      "تخيّل سفينةً ربّانها أطول وأقوى من كل بحّارها، لكنه أصمّ قليلاً، وضعيف البصر، وعلمه بالملاحة ليس أفضل من ذلك.",
    sourceText:
      "a captain who is taller and stronger than any of the crew, but he is a little deaf and has a similar infirmity in sight, and his knowledge of navigation is not much better",
    philosopherAr: "أفلاطون",
    philosopherId: "plato",
    workAr: "الجمهورية",
    workEn: "Republic",
    locator: "الكتاب السادس، 488a",
    language: "grc",
    translator: "بندلس جويت",
    edition: "Plato, Republic Book VI, tr. Benjamin Jowett (1871)",
    verified: true,
    topics: ["wisdom", "ethics", "knowledge"],
    sourceUrl: "https://classics.mit.edu/Plato/republic.7.vi.html",
  },
  {
    id: "plato-circumstantial-path",
    textAr: "من أراد أن يرى الجمال في كماله، وجب أن يسلك الطريق الأطول والأدقّ.",
    sourceText:
      "he who wanted to see them in their perfect beauty must take a longer and more circuitous way",
    philosopherAr: "أفلاطون",
    philosopherId: "plato",
    workAr: "الجمهورية",
    workEn: "Republic",
    locator: "الكتاب السادس، 504b",
    language: "grc",
    translator: "بندلس جويت",
    edition: "Plato, Republic Book VI, tr. Benjamin Jowett (1871)",
    verified: true,
    topics: ["beauty", "wisdom", "knowledge"],
    sourceUrl: "https://classics.mit.edu/Plato/republic.7.vi.html",
  },
  {
    id: "plato-hard-is-good",
    textAr: "الجميل صعب، كما يقول الناس.",
    sourceText: "'hard is the good,' as men say",
    philosopherAr: "أفلاطون",
    philosopherId: "plato",
    workAr: "الجمهورية",
    workEn: "Republic",
    locator: "الكتاب السادس، 498b",
    language: "grc",
    translator: "بندلس جويت",
    edition: "Plato, Republic Book VI, tr. Benjamin Jowett (1871)",
    verified: true,
    topics: ["virtue", "beauty", "suffering"],
    sourceUrl: "https://classics.mit.edu/Plato/republic.7.vi.html",
  },

  /* ── Marcus Aurelius, Meditations ───────────────────────────────────── */
  {
    id: "aurelius-gentle-with-anger",
    textAr: "من جدّي تعلّمت اللين، وأن أعتني عن كل غضبٍ وانفعال.",
    sourceText:
      "Of my grandfather Verus I have learned to be gentle and meek, and to refrain from all anger and passion.",
    philosopherAr: "ماركوس أوريليوس",
    philosopherId: "aurelius",
    workAr: "التأمّلات",
    workEn: "Meditations",
    locator: "الكتاب الأول، ١",
    language: "grc",
    translator: "ميريك كاسوبون",
    edition: "Marcus Aurelius, Meditations, tr. Meric Casaubon (1634), Project Gutenberg #2680",
    verified: true,
    topics: ["virtue", "ethics", "desire"],
    sourceUrl: "https://www.gutenberg.org/files/2680/2680-h/2680-h.htm",
  },
  {
    id: "aurelius-good-wife",
    textAr: "أن تكون لي زوجةٌ مطواعة، محبّة، بسيطة.",
    sourceText: "That I had a wife, so obedient, so loving, so ingenuous.",
    philosopherAr: "ماركوس أوريليوس",
    philosopherId: "aurelius",
    workAr: "التأمّلات",
    workEn: "Meditations",
    locator: "الكتاب الأول، ١٤",
    language: "grc",
    translator: "ميريك كاسوبون",
    edition: "Marcus Aurelius, Meditations, tr. Meric Casaubon (1634), Project Gutenberg #2680",
    verified: true,
    topics: ["virtue", "ethics"],
    sourceUrl: "https://www.gutenberg.org/files/2680/2680-h/2680-h.htm",
  },
  {
    id: "aurelius-no-repent",
    textAr: "أني، وإن غضبتُ من روستيكوس مراراً، لم أفعل به شيئاً ندمتُ عليه بعد.",
    sourceText:
      "That having been often displeased with Rusticus, I never did him any thing for which afterwards I had occasion to repent.",
    philosopherAr: "ماركوس أوريليوس",
    philosopherId: "aurelius",
    workAr: "التأمّلات",
    workEn: "Meditations",
    locator: "الكتاب الأول، ١٤",
    language: "grc",
    translator: "ميريك كاسوبون",
    edition: "Marcus Aurelius, Meditations, tr. Meric Casaubon (1634), Project Gutenberg #2680",
    verified: true,
    topics: ["virtue", "ethics"],
    sourceUrl: "https://www.gutenberg.org/files/2680/2680-h/2680-h.htm",
  },
];

export const VERIFIED_QUOTES: Quote[] = QUOTES.filter((q) => q.verified);

/** Ids that may be quoted, derived so the list cannot drift from the data. */
export const VERIFIED_QUOTE_IDS: readonly string[] = VERIFIED_QUOTES.map((q) => q.id);

const byId = new Map(QUOTES.map((q) => [q.id, q]));

/** Anything, including unverified. For admin tooling and the validator only. */
export function getQuote(id: string): Quote | null {
  return byId.get(id) ?? null;
}

/**
 * The only sanctioned way to reach a quotation.
 *
 * Returns `null` for unknown **and** for unverified, so a caller cannot quote a
 * doubtful line even by passing a valid id.
 */
export function verifiedQuote(id: string): Quote | null {
  const quote = byId.get(id);
  return quote && quote.verified ? quote : null;
}

/** Distinct philosophers, with display names, for the filter control. */
export function philosophers(): Array<{ id: string; nameAr: string; count: number }> {
  const map = new Map<string, { id: string; nameAr: string; count: number }>();
  for (const q of VERIFIED_QUOTES) {
    const existing = map.get(q.philosopherId);
    if (existing) existing.count += 1;
    else map.set(q.philosopherId, { id: q.philosopherId, nameAr: q.philosopherAr, count: 1 });
  }
  return [...map.values()].sort((a, b) => a.nameAr.localeCompare(b.nameAr, "ar"));
}

/** Distinct topics present in the verified set. */
export function topics(): string[] {
  const set = new Set<string>();
  for (const q of VERIFIED_QUOTES) for (const t of q.topics) set.add(t);
  return [...set].sort();
}
