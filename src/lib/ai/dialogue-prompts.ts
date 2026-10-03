/**
 * Prompts for `/dialogue`.
 *
 * The design problem a debate has and a single-philosopher chat does not: each
 * speaker must be able to *disagree*, and the summary must be neutral enough to
 * say so. Three rules follow, and they are the whole reason this is a separate
 * module rather than a flag on the chat prompts.
 *
 * 1. Each philosopher only ever sees the transcript so far, ending with their
 *    own last turn. Nobody is shown the other's next move.
 * 2. A speaker is told what the other said, and told not to agree for the sake
 *    of harmony. A debate where both sides converge is not a debate.
 * 3. The summary sees everything and wears no persona. It reports where the two
 *    actually converge and where they do not, and it does not adjudicate.
 *
 * Note the last one: "who is right" is not an available output. A neutral
 * summary that resolves the question would be doing the philosopher's job
 * without the argument behind it.
 */

/**
 * Instructions for one speaker's turn.
 *
 * `transcript` is the dialogue so far, rendered as alternating lines. Kept as a
 * plain parameter rather than reaching into message storage, so this function is
 * pure and testable.
 */
export function buildTurnPrompt(args: {
  /** Rendered transcript, oldest first. */
  transcript: string;
  /** The question the reader actually asked. */
  question: string;
  /** 1-based. */
  round: number;
  /** Total rounds this dialogue will run. */
  rounds: number;
}): string {
  return [
    `أنت تشارك في حوار فلسفي. هذه الجولة ${args.round} من ${args.rounds}.`,
    "",
    "ما سبق في الحوار:",
    args.transcript,
    "",
    "السؤال الذي طرحه القارئ:",
    args.question,
    "",
    "اكتب دورك الآن.",
    "",
    "قواعدك:",
    "- أجب بصوتك أنت، لا بصوت خصمك، ولا تحكم بينكما.",
    "- اختلافُك مطلوب. إن وافقتَ الخصم بلا سبب، فأنت لا تشارك في حوار.",
    "- إن وجدتَ في كلام الخصم ما يستحق الرد، فأجب عنه مباشرة.",
    "- لا تكرر ما قاله من سبقك، ولا تُعلن عن قصدك.",
    "- فقرة أو فقرتان قصيرتان، بلا مقدمات ولا عناوين.",
    "- اكتب بالعربية الفصحى، وبأسلوبك المعروف.",
  ].join("\n");
}

/**
 * The neutral summary.
 *
 * Asked for two specific things — agreement and disagreement — because a summary
 * that reports only consensus is the most common failure mode and the least
 * useful. Both may be short; neither may be omitted.
 */
export function buildSummaryPrompt(args: {
  transcript: string;
  question: string;
}): string {
  return [
    "لديك حوار فلسفي كامل بين فيلسوفين. لستَ طرفاً فيه.",
    "",
    "الحوار:",
    args.transcript,
    "",
    "السؤال الأصلي:",
    args.question,
    "",
    "اكتب خلاصة محايدة في فقرتين قصيرتين فقط، بلا عنوان ولا مقدمات:",
    "",
    "الفقرة الأولى: أين اتفقا فعلاً؟ اذكر نقطة اتفاق واحدة على الأقل، إن وُجدت.",
    "الفقرة الثانية: أين اختلفا فعلاً؟ اذكر اختلافاً واحداً على الأقل، إن وُجدت.",
    "",
    "قواعد صارمة:",
    "- لا تحكم أيَّهما أصحّ. هذه مهمتك الوحيدة.",
    "- لا تُضف رأياً خاصاً بك.",
    "- لا تنسب إلى أحد كلاماً لم يقله.",
    "- إن لم يتّفقا على شيء، فقل ذلك بوضوح في الفقرة الأولى.",
    "- إن لم يختلفا، فقل ذلك بوضوح في الفقرة الثانية.",
  ].join("\n");
}

/** Renders a transcript as lines the prompt can read unambiguously. */
export function renderTranscript(turns: Array<{ speaker: string; content: string }>): string {
  return turns
    // Filtered on the *content*, not the rendered line. Filtering the line let a
    // blank turn through as the bare label "أفلاطون:", which tells the model he
    // spoke and said nothing — an invitation to invent what he said.
    .filter((t) => t.content.trim().length > 0)
    .map((t) => `${t.speaker}: ${t.content.trim()}`)
    .join("\n\n");
}
