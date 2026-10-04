/**
 * The riddle bank.
 *
 * **SERVER ONLY.** Importing this from a client component would ship every answer to
 * every reader, which ends the feature. `scripts/check-no-riddle-leak.mjs` scans the
 * client bundle and each route's prerendered HTML for the acceptance phrases and the
 * resolutions, and fails the build if either appears.
 *
 * ## Why a fixed bank and not generated text
 *
 * The brief says the riddle is "generated in the philosopher's spirit". It is — but
 * from a **pre-written** pool, because the answer has to be checkable. A generated
 * riddle would need a model to grade its own answer, which is unverifiable, and a
 * verifier that can be argued with is not a gate. Three riddles per philosopher, each
 * written, each with a fixed acceptance list.
 *
 * ## Why acceptance is phrase-level and not word-level
 *
 * The first version of this bank accepted **single words**: a riddle passed if the
 * answer contained "أثر" and "أعمق". Two riddles in that bank leaked their own
 * answers, and a test proved sixteen leaks across nine riddles — because a prompt
 * written from a resolution naturally reuses its vocabulary. "قال رجل: لم أعرف أني
 * لا أعرف" contains its own required answer. A prompt that contains the answer has
 * turned the verifier into a spell-check.
 *
 * Worse, single words are satisfied by a guess. Requiring "أثر" is not requiring the
 * reader to have understood anything; it requires them to have guessed which noun I
 * chose.
 *
 * So every required idea is now a **phrase** — something a reader must *argue*, not
 * something they can recall. "الأثر ينطبع في النفس" cannot be produced by someone who
 * has not understood the cave, and no phrasing of the question can contain it. The
 * invariant is asserted by a test over all 9 × 9 pairs.
 *
 * The cost, stated plainly: a reader who understood the idea perfectly and phrased it
 * differently will be refused. That is the trade for a fixed criterion, and the
 * forbidden list is what stops the refusal from being abusable.
 */

export interface Riddle {
  id: string;
  /** 1–3, matching the token. */
  number: 1 | 2 | 3;
  philosopherId: string;
  philosopherAr: string;
  promptAr: string;
  /** One line of guidance. Never a hint at the answer. */
  guidanceAr: string;
  /** At least `minRequired` must be present for the answer to pass. */
  required: Array<{ ideaAr: string; anyOf: string[] }>;
  /** Present alongside a passing answer means the reader has it backwards. */
  forbidden: Array<{ whyAr: string; anyOf: string[] }>;
  minRequired: number;
  /** Shown after a win. The answer lives here and nowhere else. */
  resolutionAr: string;
}

export const RIDDLES: Riddle[] = [
  /* ── Plato ────────────────────────────────────────────────────────────── */
  {
    id: "plato-1",
    number: 1,
    philosopherId: "plato",
    philosopherAr: "أفلاطون",
    promptAr:
      "رأيت الأشياء على الجدار، وسمعت من يسمّيها. ثم التفت فوجدت النار تضيء وجهاً آخر. " +
      "فهل خرجت من سجن، أم تحرّكت الجدران؟",
    guidanceAr: "لا تبحث عن مخرج. اسأل عن الشرط الذي جعل ذلك الوجه ممكناً.",
    required: [
      {
        ideaAr: "الأثر يصير عنده فعلاً",
        anyOf: ["الأثر ينطبع في النفس", "انطبع الأثر في النفس", "صار الأثر شيئاً في نفسه"],
      },
      {
        ideaAr: "الخارج أعمق من الصورة",
        anyOf: ["الخارج أعمق من الصورة", "الأصل أعمق من الظل", "الصورة ليست الشيء نفسه"],
      },
    ],
    minRequired: 2,
    forbidden: [
      { whyAr: "الجدران ساكنة، ولا تتحرك.", anyOf: ["الجدران تتحرك", "الجدار هو الذي تحرك"] },
      { whyAr: "الخروج ليس هروباً من الرؤية.", anyOf: ["هرب من الكهف", "الخروج هروب"] },
    ],
    resolutionAr:
      "الأثر يخبر النفس بالأشياء كما تُرى من هناك، فتصير الرؤية عندك. " +
      "والخروج ليس هروباً من الرؤية، بل إدراك أنها وُلدت في النفس نفسها.",
  },
  {
    id: "plato-2",
    number: 2,
    philosopherId: "plato",
    philosopherAr: "أفلاطون",
    promptAr: "تقول عن كل شيء أنه جميل أو غير جميل. ثم تسأل: من أين يأتي هذا الجمال الذي تقيس به؟",
    guidanceAr: "المقياس يبحث عن موضع لا يتبع المقيس.",
    required: [
      {
        ideaAr: "هناك مثال ثابت",
        anyOf: ["مثال ثابت", "المثال ليس من هذا العالم", "نموذج ثابت يقاس عليه"],
      },
      {
        ideaAr: "وهو أعمق من الرأي",
        anyOf: ["أعمق من الرأي", "ثابت لا يتغير", "مطلق لا نسبي"],
      },
    ],
    minRequired: 2,
    forbidden: [
      { whyAr: "مجرد قول الناس ليس مقياساً.", anyOf: ["الناس يقولون", "ما يقال"], },
    ],
    resolutionAr:
      "الجمال يقاس بمثال، والمثال ليس من هذا العالم. " +
      "فلو كان الجمال ناقصاً لكان ناقصاً في شيء، ولم يكن جميلاً.",
  },
  {
    id: "plato-3",
    number: 3,
    philosopherId: "plato",
    philosopherAr: "أفلاطون",
    promptAr: "رجل يقول: لا أستطيع أن أثبت أنه يعرف. ورجل يقول: أعرف، فلا يسأل أحداً. فأيّهما أصدق؟",
    guidanceAr: "انظر إلى ما يفعله كل منهما بالآخر، لا إلى ما يقول عن نفسه.",
    required: [
      {
        ideaAr: "الجهل المعلَن أصدق",
        anyOf: ["الجهل المعترف به أصدق", "من يعترف بجهله", "الجهل المصرّح به أصدق"],
      },
      {
        ideaAr: "الواثق يجعل من حوله نظّارة له",
        anyOf: ["الواثق لا يسأل فيصير", "من لا يسأل يجعل غيره نظارة له", "يصير من حوله نظّارة له"],
      },
    ],
    minRequired: 2,
    forbidden: [
      { whyAr: "الجهل بدل المعرفة ليس فضيلة.", anyOf: ["التواضع وحده فضيلة", "الجهل بدل المعرفة"] },
    ],
    resolutionAr:
      "الواثق من نفسه لا يسأل، فيصير من حوله نظّارة له. " +
      "والذي يعلم أنه لا يعلم فيسأل، ومن يسأل يكتشف.",
  },

  /* ── Dostoevsky ──────────────────────────────────────────────────────── */
  {
    id: "dostoevsky-1",
    number: 1,
    philosopherId: "dostoevsky",
    philosopherAr: "دوستويفسكي",
    promptAr:
      "تعلم أن الظلم واقع، وأن كل إنسان مسؤول عنه. فتسأل: وماذا لو لم أستطع إيقافه؟ " +
      "ماذا يبقى لي عندئذ؟",
    guidanceAr: "اسأل عن الفرق بين أن تعجز وأن تعفى.",
    required: [
      {
        ideaAr: "العجز لا يعفي",
        anyOf: ["العجز لا يعفيك", "المعرفة لا تعفي", "العلم بالشر لا يبرر"],
      },
      {
        ideaAr: "والمسؤولية تبقى عليك",
        anyOf: ["المسؤولية تبقى عليك", "يبقى عليك ما فعلت", "الإنسان يبقى مسؤولاً"],
      },
    ],
    minRequired: 2,
    forbidden: [
      { whyAr: "فعل غيرك لا يخرج ذنبك.", anyOf: ["الذنب ليس لك", "ليس ذنبك"] },
    ],
    resolutionAr:
      "أن تعرف الشر وتريد أن توقفه، ثم تقف ساكناً، لا يعفيك علمك. " +
      "فالمسؤولية ليست أجراً تُدفع عند القدرة، بل تبقى معك حين تعجز.",
  },
  {
    id: "dostoevsky-2",
    number: 2,
    philosopherId: "dostoevsky",
    philosopherAr: "دوستويفسكي",
    promptAr: "يعرض عليك رجل أن يتولى أمرك كل وقت، ويأخذ عنك الاختيار، ويقول: لأني أحبك. فماذا تقول؟",
    guidanceAr: "اسأل من يفيد من امتلاكك.",
    required: [
      {
        ideaAr: "الحرية عبء لا رفاهية",
        anyOf: ["الحرية عبء", "الحرية ليست رفاهية", "العبء ليس مكرمة"],
      },
      {
        ideaAr: "وسلب الإرادة هبة لا خدمة",
        anyOf: ["سلب الإرادة هبة", "نزع الإرادة هبة", "الحماية التي تنزع الاختيار"],
      },
    ],
    minRequired: 2,
    forbidden: [
      { whyAr: "التحرر من الإرادة ليس تحرراً.", anyOf: ["التحرر من الإرادة تحرر", "الحبس أرحم"] },
    ],
    resolutionAr:
      "حين يُنزع عنك الاختيار، لا تصير حراً بل تصير مملوكاً. " +
      "وما يبقى منه هو اسمٌ لشيء، لا حرية.",
  },
  {
    id: "dostoevsky-3",
    number: 3,
    philosopherId: "dostoevsky",
    philosopherAr: "دوستويفسكي",
    promptAr: "إن أردت أن تكون أكثر من إنسان، فعليك أن تحمل العالم على كتفك وحدك. فهل تحمله أم تتركه لغيرك؟",
    guidanceAr: "اسأل عن الفرق بين أن تحمل وأن تُثقل.",
    required: [
      {
        ideaAr: "الحمل لا يفوّض",
        anyOf: ["الحمل لا يفوض", "لا يؤول إلى أحد", "لا يفوض أحد"],
      },
      {
        ideaAr: "والتسليم لا يعفي",
        anyOf: ["التسليم لا يعفي", "ترك العالم لأحد غيرك تسليم", "التفويض لا ينفي الحساب"],
      },
    ],
    minRequired: 2,
    forbidden: [
      { whyAr: "الحمل لا يُفرض على من لا يريده.", anyOf: ["الحمل مفروض عليك", "كُلفت به دون إرادتك"] },
    ],
    resolutionAr:
      "أن تحمل العالم اختيار لا تكلُّف. فمن لم يرده لم يُحمله، " +
      "وسُمّي حملُه ضخامةً لا عناية.",
  },

  /* ── Rumi ─────────────────────────────────────────────────────────────── */
  {
    id: "rumi-1",
    number: 1,
    philosopherId: "rumi",
    philosopherAr: "الرومي",
    promptAr: "تطلب الشيء في المكان الذي عوّدك أنه هناك، فلا تجده. ثم يقول أحدهم: هو في المكان الذي تطلب منه.",
    guidanceAr: "إن لم تجده، فقد بحثت في غير موضعه.",
    required: [
      {
        ideaAr: "هو في داخل ما تبحث عنه",
        anyOf: ["داخل الإناء نفسه", "هو في داخل المكان نفسه", "يبحث عنه في داخل ما يبحث فيه"],
      },
      {
        ideaAr: "وموضع البحث هو المخطئ",
        anyOf: ["البحث في غير موضعه", "موضع البحث هو المخطئ", "تطلب في غير موضعه"],
      },
    ],
    minRequired: 2,
    forbidden: [
      { whyAr: "الانشغال ليس سبب الفشل.", anyOf: ["الانشغال سبب الفشل", "الكسل سبب الفشل"] },
    ],
    resolutionAr: "من يطلب الشيء من غير موضعه لا يجده أبداً. والمنشغل عن المصدر أول من يظن أنه قريب.",
  },
  {
    id: "rumi-2",
    number: 2,
    philosopherId: "rumi",
    philosopherAr: "الرومي",
    promptAr: "قال الطين لصاحبه: صهرتني بيديك. فقالت: أنت الطين وأنا كذلك. أم أني وحدي من أحببتُه؟",
    guidanceAr: "اسأل: من الذي يقول؟",
    required: [
      {
        ideaAr: "الطين والعجن واحد",
        anyOf: ["الطين والعجن واحد", "الصانع والطين لا ينفصلان", "لا فرق بين الخبز والعجين"],
      },
      {
        ideaAr: "الفصل اعتقاد لا حقيقة",
        anyOf: ["الفصل اعتقاد لا حقيقة", "الافتراق وهم", "أن يفصل بينهما اعتقاد"],
      },
    ],
    minRequired: 2,
    forbidden: [
      { whyAr: "اليقين بالذات المنفصلة يقلب الأمر.", anyOf: ["يقين بالذات المنفصلة", "الذات المنفصلة يقينية"] },
    ],
    resolutionAr: "من يقول أنا وأنت هو من يبقي التكليف حياً. وحين يسكن الحبّ الطين، لا يعود يحتاج إلى تفسير.",
  },
  {
    id: "rumi-3",
    number: 3,
    philosopherId: "rumi",
    philosopherAr: "الرومي",
    promptAr: "ما قاله الناس عنك بالأمس، وما قلتَه عن نفسك أمس. أيّهما يبقى إن تغيّر كل شيء؟",
    guidanceAr: "انظر إلى أيّهما لا تنقلبه الأيام.",
    required: [
      {
        ideaAr: "قول غيرك يمر",
        anyOf: ["ما قاله غيرك يزول", "قول الناس عابر", "ما سمعته من غيرك يمر"],
      },
      {
        ideaAr: "وما لا يناقض نفسه يثبت",
        anyOf: ["ما لا يناقض نفسه", "الثابت لا تناقضه الأقوال", "الذي لا تناقضه الأيام"],
      },
    ],
    minRequired: 2,
    forbidden: [
      { whyAr: "الاعتراف بالخطأ ليس ضعفاً.", anyOf: ["الاعتراف ضعف", "الاعتراف بالخطأ نقطة ضعف"] },
    ],
    resolutionAr: "ما يقال عنك يمر، وما قلتَه عن نفسك يلتصق. فانظر أيّهما لا يقلبه حدث واحد.",
  },
];

const byKey = new Map(RIDDLES.map((r) => [`${r.philosopherId}:${r.number}`, r]));

/** A riddle by philosopher and number. `null` rather than a throw — ids come from tokens. */
export function getRiddle(philosopherId: string, number: number): Riddle | null {
  return byKey.get(`${philosopherId}:${number}`) ?? null;
}

/** How many riddles a philosopher has, so `pickRiddleIndex` is bounded correctly. */
export function riddleCount(philosopherId: string): number {
  return RIDDLES.filter((r) => r.philosopherId === philosopherId).length;
}

/**
 * Every philosopher who has at least one riddle.
 *
 * This — not a hardcoded list — is what `verifyWinToken` validates a token's
 * `philosopher` claim against. Deriving it here means the two can never disagree.
 */
export function riddlePhilosophers(): string[] {
  return [...new Set(RIDDLES.map((r) => r.philosopherId))];
}

/**
 * Distinctive phrases from the acceptance lists, for the leak scanner.
 *
 * Derived from the data rather than hand-written, so the scanner cannot drift from
 * the bank and start passing vacuously.
 */
export function answerSamples(): string[] {
  const out = new Set<string>();
  for (const r of RIDDLES) {
    for (const req of r.required) for (const w of req.anyOf) out.add(w);
    for (const f of r.forbidden) for (const w of f.anyOf) out.add(w);
  }
  return [...out];
}

/** Distinctive slices of the resolutions, which must also never ship. */
export function resolutionSamples(): string[] {
  return RIDDLES.map((r) => r.resolutionAr.slice(0, 24));
}
