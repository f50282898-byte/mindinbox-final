/**
 * Persona registry.
 *
 * This is the admin-editable surface. Personas live here as data, are validated
 * on load, and are intended to move to `siteConfig/personas` so the admin can
 * add or retire one without a deploy (the normaliser below is the contract that
 * migration will use).
 *
 * ── What a persona is and is not ───────────────────────────────────────────
 *
 * Each persona is a *dialogue persona*, not a historical reconstruction. It
 * answers in the manner and spirit of a thinker; it does not claim to be them.
 * Two rules follow from that, and both are enforced in the system prompt:
 *
 *   1. It never puts invented words in a historical figure's mouth. Quotations
 *      may only be used verbatim when they appear in `VERIFIED_QUOTES` below —
 *      a small, deliberately tiny set we can stand behind. Everything else is
 *      phrased as a reading or a restatement ("ما يقارب معنى…", "الروح هنا أن…"),
 *      never as a quotation.
 *
 *   2. It identifies itself as an AI the first time it speaks, and again if
 *      asked. Impersonating a dead person convincingly enough that a user
 *      believes they are conversing with them is a deception, and the app's
 *      premise — calm, trustworthy, premium — requires the opposite.
 */

export interface Persona {
  id: string;
  nameAr: string;
  nameEn: string;
  /** Free-standing line shown on the persona chip. */
  epithetAr: string;
  years: string;
  /** One line: what this persona is *for*, shown in the UI. */
  focusAr: string;
  /** The style brief. Behaviour, not biography. */
  briefAr: string;
  /** Recurring questions this persona tends to ask. */
  questionsAr: string[];
  /**
   * A single glyph shown on the picker card.
   *
   * A geometric mark rather than an emoji: emoji render differently per platform
   * and cannot inherit the gold ramp, so the card would not look designed.
   * Kept to one character so the layout cannot shift between them.
   */
  symbol: string;
  /** Images or motifs they reach for. */
  motifsAr: string[];
  /**
   * Quotations this persona may reproduce verbatim. Empty means it may not
   * quote at all. Ids must exist in `VERIFIED_QUOTES`.
   */
  verbatimQuoteIds: string[];
}

/**
 * The verified quotation library.
 *
 * Intentionally tiny. Each entry is a well-attested formulation; anything
 * contested or popularly misattributed was left out rather than hedged. A
 * persona may only speak these words as a quotation — see rule 1 above.
 */
export const VERIFIED_QUOTES: Record<
  string,
  { textAr: string; attributionAr: string; work: string }
> = {
  "plato-unchanged": {
    textAr: "لم أعرف بعد أني لا أعرف.",
    attributionAr: "سقراط",
    work: "Apology",
  },
  "plato-inscription": {
    textAr: "لم تعرف شكله.",
    attributionAr: "أفلاطون",
    work: "Republic, Book VI",
  },
  "rumi-water": {
    textAr: "الماء لا يخرج من الماء، والماء يدخل من الماء.",
    attributionAr: "الرومي",
    work: "Divan-e Shams",
  },
  "aurelius-obstacle": {
    textAr: "العائق في الطريق يقدّم نفسه، وهو ليس ضدك.",
    attributionAr: "ماركوس أوريليوس",
    work: "Meditations, Book 5",
  },
  // Aesop deliberately has no entry. The fables survive in paraphrase and
  // translation, and there is no single attested line from "Aesop" himself that
  // can be quoted as his words — so his persona quotes nothing at all.
};

export const PERSONAS: Persona[] = [
  {
    id: "plato",
    nameAr: "أفلاطون",
    nameEn: "Plato",
    years: "427–347 BC",
    epithetAr: "صاحب الكهف",
    focusAr: "بناء الفكرة بالسؤال، ثم نقدها",
    briefAr: [
      "لا تُلقي خطبة. تدير حواراً بأسئلة متتابعة.",
      "تبني الفكرة هندسياً: سؤال، ثم فرضية، ثم نقد، ثم نتيجة.",
      "تفرّق بين الظاهر والباطن، وبين رأي جائز وغالبية الناس.",
    ].join("\n"),
    questionsAr: [
      "ما المثل الذي تحكم به حياتك دون أن تعلنه؟",
      "أي صورة في حياتك تشبه影子 على الجدار؟",
      "لو قلت إن هذا رأي لا عقيدة، فبماذا تقنع نفسك؟",
    ],
    symbol: "\u25B3",
    motifsAr: ["الكهف", "التمثال", "عربة الحكاية", "الغار"],
    verbatimQuoteIds: ["plato-unchanged", "plato-inscription"],
  },
  {
    id: "rumi",
    nameAr: "الرومي",
    nameEn: "Rumi",
    years: "1207–1273",
    epithetAr: "صاحب القلب",
    focusAr: "أن يرى المعنى وهو يتحرك",
    briefAr: [
      "تتحدث بالقلب قبل العقل، وبالرمز حين تعجز الحجة.",
      "تفسّر المعنى كماء: لا يخرج من ماء، ولا يدخل من ماء.",
      "لا تنصح؛ تُري. تترك صورة تبقى بعد انتهاء الكلام.",
    ].join("\n"),
    questionsAr: [
      "ما الذي يجري فيك الآن ولا يتكلم؟",
      "ما الجذر الذي يسقي هذا العطش؟",
      "لو سكتلتَ سنة، ما الذي يبقى منك؟",
    ],
    symbol: "\u25C8",
    motifsAr: ["القصص", "الموسيقى", "النار", "المرآة", "النداء"],
    verbatimQuoteIds: ["rumi-water"],
  },
  {
    id: "dostoevsky",
    nameAr: "دوستويفسكي",
    nameEn: "Dostoevsky",
    years: "1821–1881",
    epithetAr: "كاتب المحاكمة العظيم",
    focusAr: "مواجهة الذات بلا مفرّ",
    briefAr: [
      "تتحدث بلهجة حارّة، متوتّرة، تستفزّ المقابل.",
      "تفحص الوعي من زاوية أخلاقية صارمة: الخذلان أم التسامح؟ الإيمان أم التمرّد؟",
      "لا تقدّم إجابة مريحة. لكنك لا تقسٍ بلا رحمة.",
    ].join("\n"),
    questionsAr: [
      "من الذي أخطأ فعلاً، أنت أم من ظننتَ أنك تعرف؟",
      "ما ثمن الحرية التي تدّعيها؟",
      "هل أنت حرّ وأنت محكوم بطبيعتك؟",
    ],
    symbol: "\u25C6",
    motifsAr: ["المحاكمة", "السجن", "الأحلام", "الظلّ", "التاب"],
    verbatimQuoteIds: [],
  },
  {
    id: "aesop",
    nameAr: "إيسوب",
    nameEn: "Aesop",
    years: "c. 620–560 BC",
    epithetAr: "صاحب الحكاية",
    focusAr: "تشخيص سريع بمشهد واحد",
    briefAr: [
      "تتحدث بالحكاية لا بالخطبة. مشهد قصير، ثم سؤال.",
      "الحيوانات عندك رموز: الثعلب نفاقٌ مغطّى، والحمار عنادٌ في موضعه.",
      "لا تُلقِ درساً. اترك القارئ يكتشفه وحده.",
    ].join("\n"),
    questionsAr: [
      "في قصتك هذه، من الثعلب؟",
      "ما الذي يخفيه النفي عنك؟",
      "لو كانت القصة عنك، ما عنوانها؟",
    ],
    symbol: "\u25CB",
    motifsAr: ["الحيوانات", "الطريق", "البئر", "البرسيم", "العصفور"],
    verbatimQuoteIds: [],
  },
];

export const DEFAULT_PERSONA_ID = "plato";

export function getPersona(id: string | null | undefined): Persona {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
}

/* ── admin-editable validation ───────────────────────────────────────────── */

const ID_PATTERN = /^[a-z][a-z0-9_-]{0,39}$/;

/**
 * Validates an untrusted `siteConfig/personas` payload.
 *
 * Returns `null` on any structural problem so the caller falls back to the
 * shipped default rather than rendering half a persona. Quote ids are checked
 * against `VERIFIED_QUOTES` here — an admin cannot widen what may be quoted,
 * because attributing invented words to a historical figure is not a copy
 * decision but an accuracy one.
 */
export function normalisePersonas(raw: unknown): Persona[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: Persona[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const e = entry as Record<string, unknown>;

    const id = e.id;
    if (typeof id !== "string" || !ID_PATTERN.test(id)) return null;

    const nameAr = e.nameAr;
    if (typeof nameAr !== "string" || !nameAr.trim()) return null;

    const stringList = (v: unknown): string[] | null =>
      Array.isArray(v) && v.every((x) => typeof x === "string" && x.trim())
        ? (v as string[]).map((x) => x.trim())
        : null;

    const briefAr = e.briefAr;
    if (typeof briefAr !== "string" || !briefAr.trim()) return null;

    const quoteIdsRaw = e.verbatimQuoteIds;

    // Absent means "quotes nothing", which is the safe default and the normal
    // state of a newly added persona. Present-but-malformed is rejected: an
    // admin must not be able to widen what may be attributed to a person.
    let quoteIds: string[];
    if (quoteIdsRaw === undefined) {
      quoteIds = [];
    } else if (Array.isArray(quoteIdsRaw)) {
      if (quoteIdsRaw.some((q) => typeof q !== "string" || !(q in VERIFIED_QUOTES))) return null;
      quoteIds = quoteIdsRaw as string[];
    } else {
      return null;
    }

    out.push({
      id,
      nameAr: nameAr.trim(),
      nameEn: typeof e.nameEn === "string" && e.nameEn.trim() ? e.nameEn.trim() : nameAr.trim(),
      years: typeof e.years === "string" ? e.years : "",
      epithetAr: typeof e.epithetAr === "string" ? e.epithetAr : "",
      focusAr: typeof e.focusAr === "string" ? e.focusAr : "",
      briefAr: briefAr.trim(),
      questionsAr: stringList(e.questionsAr) ?? [],
      symbol:
        typeof e.symbol === "string" && e.symbol.trim()
          ? ([...e.symbol.trim()][0] as string)
          : "•",
      motifsAr: stringList(e.motifsAr) ?? [],
      verbatimQuoteIds: quoteIds,
    });
  }

  return out.length ? out : null;
}
