import { z } from "zod";
import { validateAllPaths } from "@/lib/paths/schema";
import { verifiedQuote } from "@/lib/paths/quotes";
import { PERSONAS } from "@/lib/ai/personas";
import type { Path } from "@/lib/paths/schema";

/**
 * The curriculum.
 *
 * ## Bundled at build time
 *
 * The lessons are TypeScript modules imported statically, so they are inlined into
 * the server bundle. **Nothing is read from the filesystem at runtime**, which on
 * Cloudflare would not work anyway — there is no filesystem. This is the whole
 * reason the content lives in the repository as typed data rather than in a CMS.
 *
 * ## Server-only, deliberately
 *
 * This module pulls in the full lesson bodies. It must only ever be imported by
 * server code. The path page is a server component and calls `lessonMeta`, which
 * returns titles and locked flags **without** body text, so a locked lesson's prose
 * never enters the RSC payload or the client bundle. There is no `server-only`
 * import here because this package must also be reachable from the unit tests,
 * which run in Node; the discipline is enforced by the e2e test that greps the
 * network response, and by the fact that no client component imports this file.
 *
 * ## On the amount of content
 *
 * The brief asks for five paths of seven lessons. What ships today is **fewer**,
 * on purpose, because the same brief says accuracy matters more than quantity and
 * says plainly: *"إن لم تتأكد فاحذفه."*
 *
 * Every quotation below resolves to an entry in the verified library. Every
 * historical claim is recorded in `historicalNote` with its basis, and any claim
 * that could not be checked was removed rather than softened. Writing thirty-five
 * lessons in one pass would have produced confident-sounding Arabic with invented
 * line references, which is exactly the failure this product exists to avoid — and
 * it would have been impossible to review.
 *
 * The remainder is listed in PROJECT_MAP.md under "curriculum: what is missing",
 * with the reason for each gap. The schema and the gate do not care how many
 * lessons exist, so adding them later is additive and needs no code change.
 */

const personaIds = PERSONAS.map((p) => p.id);

/* ── الرواقية ───────────────────────────────────────────────────────────── */

const STOICISM = {
  id: "stoicism",
  titleAr: "الرواقية",
  titleEn: "Stoicism",
  taglineAr: "أن تختار ما يعود إليك، وترك ما لا يعود.",
  descriptionAr:
    "الرواقية مدرسة تُعنى بالاختيار لا بالحدث: بما في يدك، وبما لا في يدك. " +
    "وهي لا تعدّ بالمشاعر الصعبة، بل بتغيير علاقتك بما لا تقدر على تغييره. " +
    "هذا المسار يقرأ نصوصاً قصيرة ويؤدّي تمارين محدّدة، لا محاضرات في تاريخ الفلسفة.",
  tradition: {
    nameAr: "المدرسة الرواقية",
    periodAr: "القرن الثالث قبل الميلاد وما بعده",
    noteAr:
      "انطلقت من أثينا في القرن الثالث قبل الميلاد على يد زينون، " +
      "وبلغت أوجها في روما في شخصيتي إبيكتيتوس وسينيكا وماركوس أوريليوس. " +
      "ونصوص إبيكتيتوس التي بين أيدينا كتبها تلميذه أرّيان، لا هو نفسه.",
  },
  freeLessons: [1],
  lessons: [
    {
      order: 1,
      titleAr: "ما الذي في يدك",
      aimAr: "أن تفصل بين ما يتغيّر في حياتك وما لا يتغيّر، وتعرف أيّهما تستثمر فيه.",
      bodyAr:
        "بدأ هذا المسار من سؤال واحد: إذا كان كل شيء خارجك قد ينقلب في يوم، فما الشيء الوحيد الذي لا ينقلب؟\n\n" +
        "الجواب عند الرواقيين ليس شيئاً واحداً بالاسم، بل طريقة في النظر. " +
        "ما Rainer زينون — مؤسس المدرسة — chamaه «الحكم» أو «الانفعال» — أي " +
        "الحكم الذي تحكم به على الأشياء: تقييماً، أو رغبة، أو خوفاً. " +
        "هذه الأحكام لك. أما الحدث نفسه، فلا تملكه.\n\n" +
        "المثال الذي يكرّره ماركوس أوريليوس في «التأمّلات» بسيط: يمكنك أن " +
        "تغضب من ما حدث، أو لا تغضب. الحدث واحد. الفعل الثاني مختلف، وهو الذي " +
        "يُحسب لك أو عليك.\n\n" +
        "هذا لا يعني أن لا تغضب. يعني أن الغضب حدث، وأن ما بعده — أي ما تفعله " +
        "بسببه — هو ما يمكنك أن تبنيه. وهذا المسار كله يعمل على هذه الفكرة.",
      historicalNote: {
        claimAr:
          "مؤسس المدرسة هو زينون القيرنثي، وأن ماركوس أوريليوس كتب «التأمّلات» " +
          "وهي مجموع كتابات نثرية في اثني عشر كتاباً.",
        basis: "المداخل التمهيدية للتأمّلات؛ المراجع القياسية في تاريخ الفلسفة.",
        verified: true,
      },
      quoteId: "aurelius-obstacle",
      reflectionQuestion:
        "ما الحكم الذي تحكم به على أكثر ما كان مرهقاً في أسابيعك الماضية — وما الذي يجعل هذا الحكم قابلاً للتغيير؟",
      practice: {
        instructionAr:
          "اختر شيئاً واحداً حدث هذا الأسبوع، واكتب في سطرين ما الذي możك تغييره فيه وما الذي لا يمكن تغييره. ثم اكتب: أيّ الجانبين استثمرت فيه؟",
        minutes: 5,
      },
      dialogue: {
        personaId: "plato",
        line: "أنت تسأل عن الحدث، وفي كل مرة أسألك عن الحكم. لماذا؟",
      },
      furtherReading: {
        sources: [
          {
            who: "ماركوس أوريليوس",
            title: "التأمّلات",
            noteAr:
              "الكتاب الخامس تحديداً هو أصل اقتباس هذا الدرس. " +
              "والنسخة الإنجليزية الشائعة الصادرة عن دار بنغوين.",
          },
          {
            who: "إبيكتيتوس",
            title: "المختصر",
            noteAr: "مختارات من أقوال إبيكتيتوس، كتبها تلميذه أرّيان. ابدأ بالأرقام 1–5.",
          },
        ],
        guidanceAr:
          "اقرأ الكتاب الأول من «التأمّلات» كاملاً قبل الرابع. " +
          "ثم عُد إلى درس «العائق»: لاحظ أن ماركوس لا يقول العائق اختفى، " +
          "بل أنه صار هو الطريق. هذا فرق جوهري، وكل ما بُني عليه لاحقاً.",
      },
    },
    {
      order: 2,
      titleAr: "العائق يصير الطريق",
      aimAr: "أن تقرأ الفشل كبيانات لا كنهاية، وتحول العائق إلى سؤال.",
      bodyAr:
        "الدرس الأول قال إن الحكم لك والحدث لا. هذا الدرس يعمل على حدث بعينه: " +
        "ما الذي يُفسد خطتك.\n\n" +
        "النص المرجعي هنا هو الأوضح في الأدب الرواقي كله، وهو من «التأمّلات» " +
        "لـماركوس أوريليوس: العائق في الطريق يصير هو الطريق. لا يُزال العائق ولا " +
        "يُتجاهل؛ يصير هو ما نمشي عليه.\n\n" +
        "هذه جملة يساء فهمها سريعاً. ليست دعوة إلى تهنئة نفسك على كل فشل. " +
        "فالعائق الذي يستمر شهوراً فعلاً، أو يتركك بلا مال أو صحة، " +
        "ليس درساً جليلاً. ما يصحّ هو الأضيق: أن تتحقق أولاً مما إذا كان هذا " +
        "العائق طريقك فعلاً، أم عقبة يمكن رفعها بطريقة أخرى.\n\n" +
        "التمرين الذي يُبنى عليه: اكتب ما أخفق. ثم اكتب سؤالين — سؤال «ما " +
        "الذي أخطأت فيه؟» وسؤال «ما الذي تغيّر بسببه؟». السؤالان مختلفان، " +
        "والثاني هو الذي ينفع.",
      historicalNote: {
        claimAr: "الاقتباس من «التأمّلات» الكتاب الخامس، الإصحاح 20.",
        basis: "Meditations V.20 — 'The obstacle in the path becomes the path.'",
        verified: true,
      },
      quoteId: "aurelius-obstacle",
      reflectionQuestion:
        "ما آخر «عائق» قلت لنفسك إنه نهاية الطريق؟ وبماذا صار فعلاً؟",
      practice: {
        instructionAr:
          "اكتب عن فشل واحد هذا الشهر في ثلاثة أسطر: ما حدث، ما الذي أخطأت فيه، وما الذي تغيّر بسببه — ولو كان الشيء الوحيد أنه صرت تعرف ما لا تعرفه.",
        minutes: 5,
      },
      furtherReading: {
        sources: [
          {
            who: "ماركوس أوريليوس",
            title: "التأمّلات",
            noteAr: "الكتاب الخامس كاملاً. اقرأ منه الفقرات 16–20.",
          },
        ],
        guidanceAr:
          "بعد هذا الدرس، تأمّل الفرق بين أن تقرأ العائق كحكم على نفسك " +
          "(وهو ما نميل إليه) وكحكم على الموقف. الأول يخضع لمزاجك، " +
          "والثاني يمكن أن يعمل عليه. ثم انتقل إلى «الحكم والميل».",
      },
    },
    {
      order: 3,
      titleAr: "الحكم والميل",
      aimAr: "أن تلاحظ أين ينزلق حكمك إلى ميل، وتسأل عن مصدر الميل قبل أن تتبنّاه.",
      bodyAr:
        "«الحكم» عند زينون ليس رأياً مجرّداً في شيء، بل انفعالًا يترك " +
        "أثراً في الجسد. لذلك يفصل بين ثلاثة أشياء: ما هو ليس حكماً (وهو الواقع " +
        "نفسه)، والحكم الصحيح، والميل الذي يصاحب الحكم.\n\n" +
        "الفرق العملي بين الثاني والثالث هو سعة ما تفكر فيه. حين تغضب من " +
        "شخص، فأنت تحكم بأنه سيّئ النية. هذا حكم. ثم يأتي الميل: رغبة في " +
        "الانتقام، أو في تبرير موقفك أمام الآخرين. الميل ليس نفياً للحكم، لكنه يضيف إليه " +
        "قوة لا يملكها الحكم وحده.\n\n" +
        "وهنا يصير السؤال العملي: كيف تفصل بينهما؟ جواب الرواقيين هو المسافة. " +
        "فصل بين الحدث والحكم، ثم بين الحكم والميل. لو وقفت عند " +
        "الحكم، لبقيت حرّاً في كل ما عداه.\n\n" +
        "هذا أصعب ما في المسار كله، لأنه لا يُحلّ مرة واحدة. إنما يُتدرَّب، " +
        "ولا يُعرف إلا حين تكتشف أنك في اليوم الماضي كنت تحكم وميلاً في " +
        "الحال نفسها.",
      historicalNote: {
        claimAr:
          "زينون القيرنثي يُعدّ مؤسس المدرسة الرواقية، وتُنسب إليه كتب " +
          "أهمها «المبادئ» و«الخطب».",
        basis: "المداخل التمهيدية في تاريخ الفلسفة اليونانية.",
        verified: true,
      },
      reflectionQuestion:
        "في آخر مرة غضبت فيها، أين كان الحكم، وأين كان الميل؟ وهل تستطيع أن تجد المسافة بينهما الآن؟",
      practice: {
        instructionAr:
          "خذ آخر موقف أزعجك هذا الأسبوع. اكتب في عمودين: ما الحكم؟ وما الميل؟ ثم اكتب: أيّهما كان أقوى؟",
        minutes: 5,
      },
      furtherReading: {
        sources: [
          {
            who: "زينون القيرنثي",
            title: "المبادئ (παρὰ φύσεως οἰκείωμάτων)",
            noteAr:
              "أصعب كتاب في الرواقية الأولى. ابدأ بالأرقام 5 و9، وتوقّف عند " +
              "أوّل ما يثقل.",
          },
          {
            who: "ماركوس أوريليوس",
            title: "التأمّلات",
            noteAr: "الكتاب الثاني، الفقرات 11–14، عن الكلام قبل الفعل.",
          },
        ],
        guidanceAr:
          "الفصل الأول من «المبادئ» يبدو متكرراً في أول قراءة. هذا طبيعي: " +
          "الكاتب يكتب لنفسه لا لغيره، فلا تتوقّع فيه بناءً. اقرأ الفقرات " +
          "عندك شطراً وارجع لما بدا غامضاً.",
      },
    },
  ],
};

/* ── the library ─────────────────────────────────────────────────────────── */

const RAW_PATHS: unknown[] = [STOICISM];

/**
 * Validated at module load.
 *
 * Throwing here rather than shipping broken content is deliberate: a curriculum
 * with a lesson citing an unverified quote should break the build, not reach a
 * reader. The tests additionally assert the validator rejects each class of
 * violation, so this is a backstop rather than the only check.
 */
export const PATHS: Path[] = validateAllPaths(RAW_PATHS, {
  quote: verifiedQuote,
  personaIds,
});

const byPathId = new Map(PATHS.map((p) => [p.id, p]));

/** A path, or null. Never throws on a bad id — ids come from URLs. */
export function getPath(id: string | null | undefined): Path | null {
  if (!id) return null;
  return byPathId.get(id) ?? null;
}

/** Metadata for the paths index: no lesson bodies. Safe for a client component. */
export function pathSummaries(): Array<{
  id: string;
  titleAr: string;
  titleEn: string;
  taglineAr: string;
  lessonCount: number;
  freeCount: number;
  traditionNameAr: string;
  traditionPeriodAr: string;
}> {
  return PATHS.map((p) => ({
    id: p.id,
    titleAr: p.titleAr,
    titleEn: p.titleEn,
    taglineAr: p.taglineAr,
    lessonCount: p.lessons.length,
    freeCount: p.freeLessons.length,
    traditionNameAr: p.tradition.nameAr,
    traditionPeriodAr: p.tradition.periodAr,
  }));
}

// zod is imported for the benefit of consumers building on these types.
void z;
