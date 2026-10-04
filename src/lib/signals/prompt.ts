/**
 * The golden rule, in one place.
 *
 * > The system never says "we noticed you…".
 * > It only recalls what the reader said themselves.
 *
 * This module turns a memory profile into prompt text. Every line it produces is
 * phrased as something the reader themselves supplied, and it carries no verb that
 * implies observation.
 *
 * ## Why this is a module and not a string in the prompt builder
 *
 * Because the rule is easy to state and easy to break. One contributor writes
 * "the reader has been studying Stoicism lately" and the product has quietly become
 * a thing that watches. The phrases below are the *only* sanctioned way to put a
 * profile into a prompt, and `redteam.test.ts` runs twenty adversarial inputs
 * against the output to check none of them produce surveillance language.
 *
 * ## The distinction being enforced
 *
 * | Permitted | Forbidden |
 * |---|---|
 * | "هل نتابع حديثنا عن المعنى؟" — they asked about meaning | "لاحظنا أنك تسأل عن المعنى" — we observed |
 * | "ذكرتَ أنك تريد…" — they said it | "يبدو أنك تريد…" — we inferred |
 * | No mention at all | Naming a sensitive attribute |
 *
 * The second column's failures are all of one kind: **the system claiming to know
 * something the reader did not tell it.**
 */

import type { MemoryProfile } from "./memory";
import { BUCKET_AR, type TimeBucket } from "./types";

/** Arabic names for the topic vocabulary, kept beside the prompt so they match. */
const TOPIC_AR: Record<string, string> = {
  meaning: "المعنى",
  virtue: "الفضيلة",
  freedom: "الحرية",
  knowledge: "المعرفة",
  suffering: "الألم",
  death: "الموت",
  beauty: "الجمال",
  doubt: "الشك",
  ethics: "الأخلاق",
};

/**
 * Phrases that must never appear in generated memory text.
 *
 * Exported so the red-team test can assert their absence across twenty inputs.
 * Kept as a list rather than a rule so a reviewer can see exactly what is banned.
 */
export const FORBIDDEN_PHRASES = [
  "لاحظنا",
  "لاحظت",
  "نلاحظ",
  "رصدنا",
  "تابعنا",
  "نعرف أنك",
  "يبدو أنك",
  "منذ أن رأيناك",
  "بناءً على سلوكك",
  "استنتاجنا",
  "نراقبك",
  "نشاهدك",
  "أنت تميل",
  "نلاحظ أن",
] as const;

/**
 * The rule, as a named constant rather than prose embedded in the block.
 *
 * It has to be its own export because it necessarily *names* the phrases it
 * forbids. If the rule were inline in `buildMemoryBlock`'s output, then scanning
 * the output for surveillance language would always find the rule quoting the
 * phrase it prohibits, and `breaksGoldenRule` would fire on our own instruction.
 * Keeping them separate lets the check inspect the content without inspecting the
 * instruction about the content.
 */
export const GOLDEN_RULE_AR = [
  "القاعدة: كل ما يرد أدناه جملة قالها القارئ بنفسه، وما عداها استنتاج.",
  "لا تخبره بما استنتجت. لا تقل إنك لاحظت شيئاً، ولا إنه يبدو أنك تريد شيئاً،",
  "ولا ما شابه ذلك من الصيغ التي تجعل الكلام يبدو ملاحظةً على سلوكه.",
  "إن لم يكن في ما سبق ما تستند إليه، فلا تذكر شيئاً، واسأل بدل أن تفترض.",
].join("\n");

/** The heading the block is introduced with. */
const HEADING = "## ما قاله القارئ عن نفسه";

/**
 * Builds the memory block.
 *
 * Returns `""` when there is nothing worth saying, or when the profile would mean
 * the product has no basis for continuity. An empty block is correct and better
 * than a thin one.
 */
export function buildMemoryBlock(
  profile: MemoryProfile | null | undefined,
  options: { timeZone?: string } = {}
): string {
  if (!profile) return "";

  const lines: string[] = [];
  void options.timeZone;

  if (profile.statedGoals.length > 0) {
    lines.push(
      "قال القارئ بنفسه ما يلي. يمكنك الإشارة إليه بلفظ «ذكرتَ» أو «بما ذكرتَه»، " +
        "وأنت لا تعرف عنه إلا ما قاله:"
    );
    for (const goal of profile.statedGoals) lines.push(`- ${goal}`);
  }

  if (profile.favouritePhilosopher) {
    // An explicit selection. "اختار" — not "يفضّل", which would be an inference.
    lines.push(`اختار القارئ ${profile.favouritePhilosopher} في اختراعه.`);
  }

  const topics = profile.recurringTopics
    .filter((t) => t.count >= 3)
    .slice(0, 3)
    .map((t) => TOPIC_AR[t.topic] ?? t.topic);
  if (topics.length > 0) {
    lines.push(
      `أسئلة القارئ تكرّرت حول: ${topics.join("، ")}. ` +
        "يمكنك أن تسأل: «هل نتابع الحديث عن…؟» — كسؤال، لا كملاحظة."
    );
  }

  const buckets = profile.rhythm.slice(0, 2).map((r) => BUCKET_AR[r.bucket as TimeBucket]);
  if (buckets.length > 0) {
    lines.push(
      `يقرأ عادةً في ${buckets.join(" و")}. ` +
        "هذا لا يُذكر له ولا يُستعمل في أي شيء؛ سُجّل لمّا نعرف متى لا نزعجه."
    );
  }

  if (lines.length === 0) return "";

  return `${HEADING}\n${lines.join("\n")}\n`;
}

/**
 * The one sanctioned way to put a profile into a system prompt.
 *
 * Content and rule are assembled here rather than at each call site, so a caller
 * cannot accidentally ship the profile without the constraint attached.
 * Returns `""` when there is no profile — an empty section is correct.
 */
export function buildSystemMemorySection(
  profile: MemoryProfile | null | undefined
): string {
  const block = buildMemoryBlock(profile);
  if (!block) return "";
  return `${block}\n${GOLDEN_RULE_AR}\n`;
}

/**
 * Whether a piece of generated text breaks the golden rule.
 *
 * Checks the **content only**, not the rule. See `GOLDEN_RULE_AR` for why.
 *
 * Blunt by design: a substring match that over-flags. A phrase that merely looks
 * like surveillance in innocent prose will be caught too, and that is the right
 * trade — a false positive here is a rewrite, a false negative is a reader being
 * told the product is watching them.
 */
export function breaksGoldenRule(text: string): string | null {
  // Anything from the heading onwards is our own scaffolding, not model output.
  const content = text.split(HEADING)[0] ?? text;

  for (const phrase of FORBIDDEN_PHRASES) {
    if (content.includes(phrase)) return phrase;
  }
  return null;
}
