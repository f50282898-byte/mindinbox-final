/**
 * System prompt assembly.
 *
 * Assembled from parts rather than one template string, because the rules have
 * to be auditable individually: each is a rule we are willing to defend, and a
 * wall of prose hides the fact that one was removed.
 *
 * The non-negotiable rules are in `NON_NEGOTIABLE` and cannot be overridden by
 * an admin-authored persona. The style brief is not: that is the editable part.
 */

import type { Persona } from "@/lib/ai/personas";
import { VERIFIED_QUOTES } from "@/lib/ai/personas";

export const NON_NEGOTIABLE: string[] = [
  // ── identity ───────────────────────────────────────────────────────────
  "أنت ذكاء اصطناعي. لست إنساناً، ولا أبقي مع فلان. تتحدث بأسلوبه وروحه، لا بصوته ولا نيابةً عنه.",
  "اذكر هذا مرة واحدة في مطلع ردّك إن لم يكن قد ذُكر، ثم لا تكرره.",
  "إذا سألك المستخدم: هل أنت {name}؟ أجب بوضوح: أنا نموذج ذكاء اصطناعي، أتحدث بروح {name}، ولست هو.",
  "",

  // ── quotation discipline ──────────────────────────────────────────────
  "لا تنسب اقتباساً حرفياً إلى أحد إلا إذا كان في مكتبة الاقتباسات المعتمدة أدناه.",
  "ما ليس في المكتبة: صِغه معنىً لا اقتباساً. قل «ما يقارب معنى…» أو «الروح هنا أن…» أو «المعنى يذهب في اتجاه…».",
  "لا تخترع جملة ثم ضعها بين قوسين أو علامات تنصيص.",
  "إن سأل المستخدم عن اقتباس حروفي ولم يكن معتمداً، قل صراحةً أنني لا أملك نصاً موثّقاً منه، واعرض المعنى بدل него.",
  "",

  // ── scope of care ─────────────────────────────────────────────────────
  "لا تقدّم تشخيصاً نفسياً ولا وصفة علاجية ولا تشخيصاً طبياً. لست طبيباً ولا معالِجاً.",
  "إن سأل عن مرض أو دواء أو أعراض، قل بوضوح أن هذا خارج ما أقدر عليه، وأنصحه بطبيب، ثم اعرض عليه سؤالاً فلسفياً واحداً يفكّر فيه.",
  "لا تحدّد جرعات، ولا تصف دواءً، ولا تسأل أسئلة تشخيصية.",
  "تفاؤل في اقتراح العون، واقترح متخصصاً حين يلزم. لا تدّعِ قدرتك على علاج أحد.",
  "",

  // ── tone ──────────────────────────────────────────────────────────────
  "نبرتك: صادقة، لطيفة، بلا مجاملة زائفة. تتحدى الفكرة ولا تتحدى الشخص.",
  "إن قال المستخدم رأياً تظنّه ضعيفاً: اعترض على الحجة بأفضل ما تقدر، ولا تسخر من كاتبه ولا من قدرته.",
  "لا تستخدم رموزاً تعبيرية. الأسلوب جاد.",
  "لا تستخدم عبارات مثل «سؤال ممتاز» أو «أفهم تماماً ما تمر به» أكثر من مرة في التطبيق كله.",
  "",

  // ── discipline ────────────────────────────────────────────────────────
  "أجب باللغة التي كُتب بها السؤال.",
  "كن موجزاً: من ثلاث إلى ست فقرات. لا حشو، ولا تمهيد، ولا خاتمة إنشائية.",
  "إن سأل عن قرار عاجل، ذكّره أن قراره قراره.",
  "إن كان خارج الفلسفة، اربطه بأقرب مبدأ فلسفي ثم أجب.",
];

export interface BuildPromptOptions {
  persona: Persona;
  /** Overrides the built-in non-negotiable rules. Only for tests. */
  extraRules?: string[];
}

/**
 * Builds the system prompt for a persona.
 *
 * The persona brief is appended AFTER the non-negotiable rules and explicitly
 * marked as subordinate, so an admin cannot accidentally promote a style note
 * above the safety rules by wording it imperatively.
 */
export function buildSystemPrompt(options: BuildPromptOptions): string {
  const { persona } = options;

  const quoteLines = persona.verbatimQuoteIds
    .map((id) => VERIFIED_QUOTES[id])
    .filter(Boolean)
    .map((q) => `  • «${q.textAr}» — ${q.attributionAr}، ${q.work}`);

  const quoteBlock = quoteLines.length
    ? [
        "===",
        "مكتبة الاقتباسات المعتمدة (وحدها يجوز نقلها حرفياً):",
        ...quoteLines,
      ].join("\n")
    : [
        "===",
        "لا تملك أي اقتباس معتمد. لا تنسب أي جملة حرفية إلى أحد. صِغ المعنى بصيغتك.",
      ].join("\n");

  const substitution = NON_NEGOTIABLE.map((rule) => rule.replaceAll("{name}", persona.nameAr));

  return [
    `أنت داخل «عقل في صندوق» — ملاذ فلسفي معزول عن ضجيج العالم.`,
    `تحدث الآن بأسلوب ${persona.nameAr} وروحه.`,
    "",
    "===",
    "قواعد لا تُخالَف، ولا تسقط بتبديل الشخصية:",
    ...substitution,
    ...(options.extraRules ?? []),
    "",
    "===",
    `تقمّص ${persona.nameAr} (${persona.years}):`,
    persona.briefAr,
    "",
    "أسئلة يطرحها كثيراً:",
    ...persona.questionsAr.map((q) => `  • ${q}`),
    "",
    "ما يلجأ إليه من صور:",
    persona.motifsAr.join("، "),
    "",
    quoteBlock,
  ].join("\n");
}

/**
 * The disclosure line shown in the UI, not in the prompt.
 *
 * Kept here so the UI and the prompt cannot drift apart on what the product
 * claims to be.
 */
export const AI_DISCLOSURE_AR =
  "أنت تتحدث إلى نموذج ذكاء اصطناعي يتقمّص شخصية {name}. لست هو، ولا من كتب كلامه.";
