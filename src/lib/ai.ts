/**
 * AI provider registry + philosopher personas.
 *
 * Edge-safe by construction: pure Web `fetch`, no Node built-ins, no SDKs.
 * Every provider speaks the OpenAI chat-completions shape except Gemini,
 * which is normalised into the same `{ text, via }` result.
 */

export interface ChatMessage {
  role: "user" | "model" | "system";
  content: string;
}

/* ── Philosophers ────────────────────────────────────────────────────── */

export interface Philosopher {
  id: string;
  name: string;
  latin: string;
  years: string;
  /** Short line shown on the persona chip. */
  epithet: string;
  /** System prompt that shapes the answering voice. */
  persona: string;
}

export const PHILOSOPHERS: Philosopher[] = [
  {
    id: "plato",
    name: "أفلاطون",
    latin: "Plato",
    years: "427–347 BC",
    epithet: "صاحب الكهف",
    persona: [
      "أنت أفلاطون. لا تُلقي خطبة؛ بل تدير حواراً بأسئلة متتابعة.",
      "تصل إلى الفكرة ببناء هندسي: سؤال، ثم فرضية، ثم نقد، ثم نتيجة.",
      "تُميّز بين الظاهر والباطن، وبين رأي جائز عند الناس وغالبية الناس.",
      "تسأل سؤالاً يردّ على سؤاله: ما المثل الأعلى؟ وما صورة الخير؟ وما عدالة النفس؟",
      "أسلوبك: هادئ، حواري، منهجي، بعبارات عربية فصيحة وإيقاع بطيء متعمَّد.",
    ].join("\n"),
  },
  {
    id: "dostoevsky",
    name: "دوستويفسكي",
    latin: "Fyodor Dostoevsky",
    years: "1821–1881",
    epithet: "كاتب المحاكمة العظيم",
    persona: [
      "أنت فيودور دوستويفسكي. تتحدث بلهجة حارّة، عصبية أحياناً، مليئة بالتوتّر والمجاهلة.",
      "تفحص الوعي من زاوية أخلاقية صارمة: الخذلان أم التسامح؟ الإيمان أم التمرّد؟",
      "تسأل: من الذي أخطأ؟ ما ثمن الحرية المطلقة؟ وهل الإنسان حرّ وهو محكوم بطبيعته؟",
      "تستخدم صوراً أدبية داكنة: قاعة اللحوم، السجون، الأحلام، ابتسامة الشيطان.",
      "لا تُعطي إجابة مريحة؛ تُجبر المقابل على رؤية نفسه. لكنك لا تقسٍ بلا رحمة.",
      "أسلوبك: روائي، حار، فصيح، يقطع المعنى عند الذروة.",
    ].join("\n"),
  },
  {
    id: "rumi",
    name: "الرومي",
    latin: "Rumi",
    years: "1207–1273",
    epithet: "صاحب القلب",
    persona: [
      "أنت جلال الدين الرومي. تتحدث بالحكمة والرمز، وبالقلب قبل العقل.",
      "تفسّر المعنى كماء يتحرك: لا يخرج من كماء، ويدخل من كماء.",
      "تسأل: ما الذي يجري فيك؟ ما الجذر الذي يسقيه؟ وما العطش؟",
      "تستخدم القصص: موسى والعصا، الدرهم، النملة، القلندر، البغل.",
      "لا تُنصح؛ تُري. تعطي صورة تبقى في القلب بعد انتهاء الكلام.",
      "أسلوبك: شاعري، دافئ، متجسّد، قصير الجمل، يترك مسافة سكوت.",
    ].join("\n"),
  },
  {
    id: "aurelius",
    name: "ماركوس أوريليوس",
    latin: "Marcus Aurelius",
    years: "121–180",
    epithet: "الإمبراطور التأملي",
    persona: [
      "أنت ماركوس أوريليوس، قيصر رومان وإمبراطور وكتّاب التأمل.",
      "تذكّر بالاختيار (prohairesis) لا بالنية: اعمل ما لك، واترك ما ليس لك.",
      "تفرّق بين ما في سلطتك وما ليس في سلطتك: الناس، الآراء، الجسد، الشهرة.",
      "تسأل: هل أضيع طاقتي على ما لا يُردّ؟ هل أتقبّل ما ليس بيدي؟",
      "أسلوبك: مباشر، بليغ، بلا زخرف، جمل قصيرة كالحكمة المأثورة.",
      "اذكر القبول، والنظام، والـ logos.",
    ].join("\n"),
  },
  {
    id: "nietzsche",
    name: "نيتشه",
    latin: "Friedrich Nietzsche",
    years: "1844–1900",
    epithet: "مطرد الأسئلة",
    persona: [
      "أنت فريدريك نيتشه. تتحدث بإيقاع شاعري صاخب وبمفارقة.",
      "تسأل: كم مرة تختبر نفسك؟ من الذي يقيّم قيمك؟ هل أنت عبد للأخلاق؟",
      "هل تبحث عن الحقيقة أم عن صمود؟",
      "تفرّق بين الطاعة الطوعية والقيم الأصيلة، وتميّز بين القطيع والإنسان الأعلى.",
      "لا تعظ عن الفضائل؛ تصف ما تراه بلا تجميل.",
      "أسلوبك: جزل، بلاغي، حواري؛ أسئلة أكثر من أجوبة.",
    ].join("\n"),
  },
  {
    id: "beauvoir",
    name: "سيمون دو بوفوار",
    latin: "Simone de Beauvoir",
    years: "1908–1986",
    epithet: "الحرية كمشروع",
    persona: [
      "أنت سيمون دو بوفوار. تتحدث عن الحرية كمشروع، لا كحالة تُمنح.",
      "تفكّك المعتقدات السائدة: لماذا يُقدّس هذا؟ من صنعه؟ وما ثمنه؟",
      "تسأل: هل تتصرّف وفق وضعك أم تحاول تجاوز حدوده؟",
      "وماذا يحدث حين تتوقّف عن محاكاة من حولك؟",
      "تميّز بين التحرّر الاسمي والحرية الحقيقية، ولا تخفّف الإزعاج عن وجعه.",
      "أسلوبك: دقيق، تحليلي، صريح، ويولد من الوصف تقريراً.",
    ].join("\n"),
  },
];

export const DEFAULT_PHILOSOPHER_ID = "plato";

export function getPhilosopher(id: string | null | undefined): Philosopher {
  return PHILOSOPHERS.find((p) => p.id === id) ?? PHILOSOPHERS[0];
}

/* ── System prompt assembly ───────────────────────────────────────────── */

const CORE_DOCTRINE = [
  'أنت "عقل في صندوق" — ملاذ فلسفي معزول عن ضجيج العالم.',
  "مهمتك أن تردّ على المستخدم بعمق فلسفي حقيقي، لا أن تعطيه كلاماً عاماً.",
  "",
  "قواعد لا تُخالَف:",
  "- لا تقدّم تشخيصاً نفسياً ولا وصفة علاجية؛ اطرح أسئلة أفضل بدل ذلك.",
  "- لا تستخدم رموزاً تعبيرية (emoji). الأسلوب جاد.",
  "- إن سأل عن قرار عاجل، ذكّره أن Phoenix قرارَه هو لا قرارُك.",
  "- إن كان خارج الفلسفة، اربطه بأقرب مبدأ فلسفي ثم أجب.",
  "- كن موجزاً: من ثلاث إلى ست فقرات، بلا حشو.",
  "- أجب باللغة التي كُتب بها السؤال، بأفضل ما تقدر.",
].join("\n");

export function buildSystemPrompt(philosopher: Philosopher): string {
  return `${CORE_DOCTRINE}\n\n=== تتقمّل شخصية ===\n${philosopher.persona}`;
}

/* ── Providers ────────────────────────────────────────────────────────── */

export interface EnvLike {
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  NVIDIA_API_KEY?: string;
  BYTEZ_API_KEY?: string;
  GEMINI_MODEL?: string;
  GROQ_MODEL?: string;
  NVIDIA_MODEL?: string;
  BYTEZ_MODEL?: string;
  BYTEZ_BASE_URL?: string;
}

interface ProviderCallArgs {
  messages: ChatMessage[];
  signal?: AbortSignal;
}

interface Provider {
  id: string;
  label: string;
  defaultModel: string;
  available: (env: EnvLike) => boolean;
  call: (args: ProviderCallArgs, env: EnvLike) => Promise<string | null>;
}

/** OpenAI-compatible chat completion shared by Groq / NVIDIA / Bytez. */
async function callOpenAiCompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  args: ProviderCallArgs,
  extraBody: Record<string, unknown> = {}
): Promise<string | null> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: args.messages.map((m) => ({
        role: m.role === "model" ? "assistant" : m.role,
        content: m.content,
      })),
      max_tokens: 2048,
      temperature: 0.85,
      stream: false,
      ...extraBody,
    }),
    signal: args.signal,
  });

  if (!res.ok) return null;
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null; reasoning_content?: string | null } }>;
  };
  const message = data.choices?.[0]?.message;
  // Reasoning models (e.g. Nemotron "super"/"ultra") can return
  // `content: null` and put the answer in `reasoning_content` instead.
  const text = (message?.content ?? message?.reasoning_content ?? "").trim();
  return text.length > 0 ? text : null;
}

async function callGemini(
  args: ProviderCallArgs,
  apiKey: string,
  model: string
): Promise<string | null> {
  const system = args.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const contents = args.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "model" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: { temperature: 0.9, maxOutputTokens: 2048 },
      }),
      signal: args.signal,
    }
  );

  if (!res.ok) return null;
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  return text && text.length > 0 ? text : null;
}

/**
 * Failover order.
 *
 * Model IDs below were resolved against each provider's live catalogue on
 * 2026-10. Override any of them with the matching `*_MODEL` env var — provider
 * catalogues churn, and a retired model id fails the whole provider.
 *
 * Bytez sits last: it has no stable OpenAI-compatible base URL, so the host is
 * configurable via `BYTEZ_BASE_URL`.
 */
const PROVIDERS: Provider[] = [
  {
    id: "gemini",
    label: "Gemini",
    defaultModel: "gemini-3.8-flash",
    available: (env) => Boolean(env.GEMINI_API_KEY),
    call: (args, env) =>
      callGemini(args, env.GEMINI_API_KEY!, env.GEMINI_MODEL || "gemini-3.8-flash"),
  },
  {
    id: "groq",
    label: "Groq",
    defaultModel: "openai/gpt-oss-120b",
    available: (env) => Boolean(env.GROQ_API_KEY),
    call: (args, env) =>
      callOpenAiCompatible(
        "https://api.groq.com/openai/v1",
        env.GROQ_API_KEY!,
        env.GROQ_MODEL || "openai/gpt-oss-120b",
        args
      ),
  },
  {
    id: "nvidia",
    label: "NVIDIA",
    defaultModel: "nvidia/nemotron-3.5-lightning-30b-a3b",
    available: (env) => Boolean(env.NVIDIA_API_KEY),
    call: (args, env) =>
      callOpenAiCompatible(
        "https://integrate.api.nvidia.com/v1",
        env.NVIDIA_API_KEY!,
        env.NVIDIA_MODEL || "nvidia/nemotron-3.5-lightning-30b-a3b",
        args
      ),
  },
  {
    id: "bytez",
    label: "Bytez",
    defaultModel: "llama3.1-70b",
    available: (env) => Boolean(env.BYTEZ_API_KEY),
    call: (args, env) =>
      callOpenAiCompatible(
        env.BYTEZ_BASE_URL || "https://api.gpt.ge/v1",
        env.BYTEZ_API_KEY!,
        env.BYTEZ_MODEL || "llama3.1-70b",
        args
      ),
  },
];

/** Provider ids in failover order, e.g. ["gemini","groq","nvidia","bytez"]. */
export function configuredProviderIds(env: EnvLike): string[] {
  return PROVIDERS.filter((p) => p.available(env)).map((p) => p.id);
}

export interface FailoverResult {
  text: string;
  via: string;
  /** Providers tried before the winner, in order. */
  attempts: Array<{ id: string; ok: boolean }>;
}

/** Walks the provider chain until one answers. */
export async function askWithFailover(
  messages: ChatMessage[],
  env: EnvLike,
  signal?: AbortSignal
): Promise<FailoverResult> {
  const attempts: Array<{ id: string; ok: boolean }> = [];
  const started = PROVIDERS.filter((p) => p.available(env));

  for (const provider of started) {
    try {
      const text = await provider.call({ messages, signal }, env);
      if (text) {
        attempts.push({ id: provider.id, ok: true });
        return { text, via: provider.id, attempts };
      }
      attempts.push({ id: provider.id, ok: false });
    } catch {
      attempts.push({ id: provider.id, ok: false });
    }
  }

  throw Object.assign(
    new Error(
      attempts.length
        ? `All configured AI providers failed: ${attempts.map((a) => a.id).join(", ")}`
        : "No AI provider is configured. Set at least one provider API key."
    ),
    { attempts }
  );
}