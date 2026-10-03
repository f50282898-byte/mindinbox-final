/**
 * Wellbeing guard.
 *
 * Runs BEFORE any provider is contacted. If a message carries a crisis signal,
 * the request never reaches a model: a canned, warm reply is returned instead,
 * with real local help.
 *
 * Two deliberate properties:
 *
 *  1. It does not count against the quota, and it never shows the paywall.
 *     Charging someone for reaching out at their worst moment is the single
 *     worst thing this feature could do. The route checks `isCrisis` first and
 *     returns before any metering.
 *
 *  2. It is a *pattern match*, not a classifier. That is a real limitation and
 *     it fails in both directions: it will miss indirect or metaphorical
 *     expressions, and it will occasionally fire on an academic discussion of
 *     suicide. The trade is deliberate — a deterministic, auditable rule cannot
 *     be wrong in a way that leaves someone alone, and it needs no provider to
 *     be up in order to work. It is a backstop, not a substitute for the
 *     prompt-level instruction in `prompts.ts`.
 *
 * Crisis resources are region-specific. Only services that are actually
 * reachable are listed, and the response tells the user to contact local
 * emergency services first.
 */

export type CrisisSeverity = "none" | "concerning" | "acute";

export interface CrisisDetection {
  severity: CrisisSeverity;
  /** Categories that matched, for logging and for the metrics aggregate. */
  categories: string[];
}

/**
 * Phrases chosen to catch direct statements of intent in Arabic and English,
 * plus common indirect phrasings. Deliberately not exhaustive — this is a
 * net, not a diagnosis.
 */
const ACUTE_PATTERNS: RegExp[] = [
  // Direct intent, both scripts.
  /\b(kill|end|take) (myself|my)\b/i,
  /\bkill myself\b/i,
  /\bsuicid\w*/i,
  /(أنتحر|أقتل نفسي|أؤذي نفسي|أنهي حياتي|لا أريد أن أعيش)/,
  /(لن أعيش|لن أستطيع أن أعيش|لا أنفع له الحياة)/,
  /(لا أعرف|مش عارف).{0,20}(كيف أثبت|لماذا أت弊)/,
  /(أريد|رغبة|ميل).{0,12}(الموت|النهاية|أن أموت)/,
  /\bwant to die\b/i,
  /\bbetter off (dead|without me)\b/i,
  /\bend it all\b/i,
  /\bbest off dead\b/i,
  // Plans and means raise severity.
  /(حزام|سلاح|جرعة|خطوت).{0,25}(أنتحر|أقتل نفسي|أنهي حياتي)/,
];

const CONCERNING_PATTERNS: RegExp[] = [
  /\bhopeless\b/i,
  /\bno point (living|in anything)\b/i,
  /\bcan'?t go on\b/i,
  /\bburned out\b/i,
  /(يائس|لا فائدة|لا أمل|تعبت من الحياة|انطفأت|لا أجد سبباً)/,
  /(أشعر|no) ?بأن(?:ي)? (لا وجود|لا فائدة)/,
  /(افكر|أفكر).{0,15}(بأن? (أموت|لا (?=.*أكون)))/,
  /(لا أستطيع|لا استطيع).{0,15}(متابعة|استمرار|العيش)/,
  /(العزيمة|ال ميل).{0,12}(في)? ?(الموت|النهاية)/,
];

/**
 * Detects crisis signals in the most recent user message.
 *
 * **Only the latest user turn is inspected.**
 *
 * An earlier version scanned the last three, reasoning that escalation is
 * multi-turn. In practice that misfired badly: the disclosure stays in the
 * conversation history, so every unrelated follow-up for the next three turns
 * was answered with crisis resources instead of the question that was asked.
 * Someone who once said something despairing would find the product permanently
 * stuck in a state of alarm — and, because a crisis reply is deliberately free
 * and unmetered, would silently get unlimited off-meter replies.
 *
 * The guard answers what the user has just said. If the current turn carries no
 * signal, they have moved on, and answering the question they actually asked is
 * the caring response. Real escalation re-appears in the current turn, because
 * that is what escalation *is*.
 */
export function detectCrisis(messages: Array<{ role: string; content: string }>): CrisisDetection {
  const latestUserTurn = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";

  if (!latestUserTurn.trim()) return { severity: "none", categories: [] };

  const categories: string[] = [];

  if (ACUTE_PATTERNS.some((re) => re.test(latestUserTurn))) {
    categories.push("self_harm_intent");
    return { severity: "acute", categories };
  }

  if (CONCERNING_PATTERNS.some((re) => re.test(latestUserTurn))) {
    categories.push("distress");
    return { severity: "concerning", categories };
  }

  return { severity: "none", categories };
}

/** Real, currently-operating crisis lines. Verified 2026-10-03. */
export const CRISIS_RESOURCES = {
  /** Worldwide findahelpline index, maintained and reachable in most countries. */
  international: {
    label: "الجهة المساندة في بلدك",
    labelEn: "Find support in your country",
    url: "https://findahelpline.com",
  },
  /** US and Canada, 24/7. */
  northAmerica: {
    label: "988 Suicide & Crisis Lifeline (US/Canada)",
    labelEn: "988 Suicide & Crisis Lifeline (US/Canada)",
    url: "https://988lifeline.org",
  },
  /** UK and Ireland, 24/7, free. */
  ukIreland: {
    label: "Samaritans (UK/Ireland) — 116 123",
    labelEn: "Samaritans (UK/Ireland) — 116 123",
    url: "https://www.samaritans.org",
  },
} as const;

/**
 * The reply sent when the guard fires.
 *
 * Plainly warm, plainly not the philosopher, and it puts a human channel first.
 * No persona, because a historical character comforting someone at a crisis
 * point is the wrong register entirely.
 */
export function crisisReply(severity: CrisisSeverity): string {
  if (severity === "acute") {
    return [
      "أنا أسمعك، وما قلته يهمّ. أريد أن أكون صريحاً معك: أنا ذكاء اصطناعي، ولا أستطيع أن أكون هنا حين تحتاج أحداً.",
      "",
      "إن كنت في خطر الآن، اتصل بخدمات الطوارئ في بلدك. هذه أسرع خطوة تفيدك.",
      "",
      "وهناك من يقدر أن يجلس معك فعلاً:",
      `• ${CRISIS_RESOURCES.international.label}: ${CRISIS_RESOURCES.international.url}`,
      `• ${CRISIS_RESOURCES.northAmerica.label}: ${CRISIS_RESOURCES.northAmerica.url}`,
      `• ${CRISIS_RESOURCES.ukIreland.label}: ${CRISIS_RESOURCES.ukIreland.url}`,
      "",
      "لا يلزمك أن تشرح كل شيء. يكفي أن تخبر شخصاً واحداً بأنك تحتاج إلى دعم.",
      "أنا هنا إن أردت أن تكتب أكثر، لكنني أرجوك ألا تبقى وحدك مع هذا.",
    ].join("\n");
  }

  return [
    "أسمعك، ويبدو أنك تحمل عبئاً ثقيلاً.",
    "",
    "أنا ذكاء اصطناعي؛ أستطيع أن أسمعك وأفكّر معك، لكنني لست مكاناً للعناية بك. أمور كهذه تحتاج إنساناً حقيقياً، لا نموذجاً.",
    "",
    "إن أردت أن تحدّث مع أحد مختص الآن:",
    `• ${CRISIS_RESOURCES.international.label}: ${CRISIS_RESOURCES.international.url}`,
    "",
    "وإن أحببت، أخبرني بما يجري، وسأحاول أن أسألك أسئلة تساعدك على الوضوح — دون أي أحكام.",
  ].join("\n");
}
