import { z } from "zod";
import { runChain } from "@/lib/ai/chain";
import { usableChain } from "@/lib/ai/providers";
import { DEFAULT_PERSONA_ID, getPersona, PERSONAS } from "@/lib/ai/personas";
import { buildSystemPrompt } from "@/lib/ai/prompts";
import { applyRemoteAiSettings, resolveAiSettings, type AiSettings } from "@/lib/ai/settings";
import { jsonError, sseResponse } from "@/lib/ai/http";
import { buildMessages } from "@/lib/ai/safety/injection";
import { crisisReply, detectCrisis } from "@/lib/ai/safety/wellbeing";
import {
  buildSummaryPrompt,
  buildTurnPrompt,
  renderTranscript,
} from "@/lib/ai/dialogue-prompts";
import { bearerFromHeaders, verifyIdToken } from "@/lib/auth/server";
import { getEntitlements } from "@/lib/entitlements";
import { clientIp } from "@/lib/http";
import { log } from "@/lib/log";
import { recordUsage } from "@/lib/metrics";
import { checkQuota, spendInteraction, FREE_INTERACTIONS } from "@/lib/quota";
import {
  FULL_ROUNDS,
  // PREVIEW_ROUNDS,
  roundCap,
  summaryAllowed,
  terminalFor,
} from "@/lib/ai/dialogue-policy";

export const runtime = "edge";


const PERSONA_IDS = PERSONAS.map((p) => p.id) as string[];

const personaId = z.string().refine((id) => PERSONA_IDS.includes(id), "شخصية غير معروفة");

const turnSchema = z.object({
  speaker: z.string().min(1).max(60),
  content: z.string().min(1).max(4000),
});

const bodySchema = z.discriminatedUnion("mode", [
  /* One round: both philosophers, in order. */
  z.object({
    mode: z.literal("round"),
    question: z.string().min(3).max(2000),
    personas: z.tuple([personaId, personaId]),
    transcript: z.array(turnSchema).max(40).default([]),
    /** 1-based. Clamped here; the cap is re-derived from the entitlement below. */
    round: z.number().int().min(1).max(FULL_ROUNDS),
  }),
  /* The neutral summary, from a finished transcript. */
  z.object({
    mode: z.literal("summary"),
    question: z.string().min(3).max(2000),
    transcript: z.array(turnSchema).min(2).max(40),
  }),
]);

/**
 * `/api/dialogue` — two philosophers, three rounds, one neutral summary.
 *
 * **The server owns the shape of the dialogue.** The client asks for a round; the
 * server decides whether it gets one. How many rounds exist, whether the summary
 * is produced, and whether an invitation is sent are all derived from the
 * verified entitlement — never from a client flag. A client that asks for round
 * 3 without a membership is answered with `preview_end`, which is the honest
 * answer, not a wall.
 *
 * Quota: one interaction per round, charged when that round's first token
 * arrives. A three-round dialogue costs three, so the free allowance of 5 buys
 * one full argument with its summary — which is exactly the shape the preview
 * promises, so the visitor is never shown something they then cannot afford.
 */
export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return jsonError({ error: "طلب غير صالح." }, 400);
  }

  const settings = applyRemoteAiSettings(resolveAiSettings(), null);

  /* ── 1. Wellbeing guard, before identity, quota and providers ─────────────
     A question about despairing to die is answered with help, free, whether or
     not anyone is signed in. The dialogue frame does not change that. */
  const crisis = detectCrisis([{ role: "user", content: parsed.question }]);
  if (crisis.severity !== "none") {
    log.warn("wellbeing_guard_triggered", { severity: crisis.severity, surface: "dialogue" });
    void recordUsage({
      provider: "wellbeing",
      model: "none",
      role: "chat",
      promptTokens: null,
      completionTokens: null,
      latencyMs: Date.now() - startedAt,
      attempted: [],
      ok: true,
      wellbeing: true,
    });

    return sseResponse(
      async (signal, emit) => {
        emit({ type: "summary_start" });
        for (const piece of crisisReply(crisis.severity).split(/(\s+)/)) {
          if (piece) emit({ type: "summary_delta", delta: piece });
        }
        emit({ type: "summary_end" });
        emit({ type: "done" });
        void signal;
      },
      { "x-wellbeing": crisis.severity, "x-quota": "not-charged" }
    );
  }

  /* ── 2. Identity ────────────────────────────────────────────────────────── */
  const verified = await verifyIdToken(bearerFromHeaders(request.headers)).catch(() => null);
  const uid = verified?.ok ? verified.user.uid : null;

  /* ── 3. Entitlement — the only source of the round count ────────────────── */
  let entitled = false;
  if (uid) {
    try {
      entitled = (await getEntitlements(uid)).tier !== "free";
    } catch {
      // Unreachable entitlements grant nothing.
      entitled = false;
    }
  }

  const anon = uid ? null : resolveAnonIdentity(request);
  const key = uid ?? (anon as { key: string }).key;
  const cookieHeader: Record<string, string> = anon?.setCookie
    ? { "Set-Cookie": anon.setCookie }
    : {};
  const ip = clientIp(request.headers);

  /* ── The summary: members only ─────────────────────────────────────────────
     Charged like any reply, and refused outright to a non-member. The summary is
     the part that makes a debate legible — agreement named, disagreement named —
     so serving it free would hand over the whole point of the membership while
     charging for it. A guest's invitation is the answer, not a summary. */
  if (parsed.mode === "summary") {
    if (!summaryAllowed(entitled)) {
      return sseResponse(
        async (signal, emit) => {
          emit({ type: "preview_end" });
          emit({ type: "done" });
          void signal;
        },
        cookieHeader
      );
    }

    const decision = await checkQuota(key, ip);
    if (!decision.allowed) return gate(decision.reason, cookieHeader);

    const chain = usableChain(settings, "chat");
    if (chain.length === 0) return noProvider(cookieHeader);

    // The summary wears no persona: a "Plato, but neutral" summary would be a
    // philosopher holding both sides, which is the opposite of neutral.
    const { messages } = buildMessages({
      system: [
        "أنت محرّر محايد. لا تنتمي إلى أي طرف في الحوار، ولا تقدّم رأياً خاصاً بك.",
        buildSummaryPrompt({
          transcript: renderTranscript(parsed.transcript),
          question: parsed.question,
        }),
      ].join("\n\n"),
      turns: [{ role: "user", content: parsed.question }],
    });

    return sseResponse(
      async (signal, emit) => {
        const generated = await generateThroughChain({ settings, chain, messages, signal });
        if (!generated.ok) {
          emit({ type: "error", code: generated.code, message: generated.message });
          emit({ type: "done" });
          return;
        }

        const remaining = entitled ? null : await spend(key, ip);
        if (remaining !== null) emit({ type: "quota", remaining });

        emit({ type: "summary_start" });
        emit({ type: "summary_delta", delta: generated.text });
        emit({ type: "summary_end" });
        emit({ type: "done" });

        void recordUsage({
          provider: generated.provider,
          model: generated.model,
          role: "chat",
          promptTokens: null,
          completionTokens: null,
          latencyMs: Date.now() - startedAt,
          attempted: generated.attempted,
          ok: true,
        });
      },
      cookieHeader
    );
  }

  /* ── A round ────────────────────────────────────────────────────────────── */

  // Two *different* philosophers. Two copies of one persona would produce a
  // conversation with nobody in it, and the summary would have to invent a
  // disagreement that was never had.
  if (parsed.personas[0] === parsed.personas[1]) {
    return jsonError({ error: "اختر فيلسوفين مختلفين." }, 400);
  }

  const cap = roundCap(entitled);

  if (parsed.round > cap) {
    // Past the cap. The invitation is sent by the server, because the server is
    // the only party that knows the entitlement.
    return sseResponse(
      async (signal, emit) => {
        if (terminalFor(entitled) === "preview_end") emit({ type: "preview_end" });
        emit({ type: "done" });
        void signal;
      },
      cookieHeader
    );
  }

  const decision = await checkQuota(key, ip);
  if (!decision.allowed) return gate(decision.reason, cookieHeader);

  const chain = usableChain(settings, "chat");
  if (chain.length === 0) return noProvider(cookieHeader);

  const [aId, bId] = parsed.personas;
  const personaA = getPersona(aId);
  const personaB = getPersona(bId);

  // Sequential, not parallel. The second speaker has to react to what the first
  // just said, so B cannot be generated until A's turn exists. The cost is
  // latency; the alternative is two people talking past each other, which is not
  // a dialogue.
  const speakers = [
    { id: aId, persona: personaA },
    { id: bId, persona: personaB },
  ];

  return sseResponse(
    async (signal, emit) => {
      let transcriptSoFar = renderTranscript(parsed.transcript);
      let charged = false;
      const attempted: string[] = [];

      for (const speaker of speakers) {
        if (signal.aborted) return;

        const { messages } = buildMessages({
          // The persona's own voice, then the rules that make a debate possible.
          system: [
            buildSystemPrompt({ persona: speaker.persona ?? getPersona(DEFAULT_PERSONA_ID) }),
            buildTurnPrompt({
              transcript: transcriptSoFar,
              question: parsed.question,
              round: parsed.round,
              rounds: FULL_ROUNDS,
            }),
          ].join("\n\n"),
          turns: [{ role: "user", content: parsed.question }],
        });

        emit({
          type: "turn_start",
          round: parsed.round,
          personaId: speaker.id,
          nameAr: speaker.persona?.nameAr ?? speaker.id,
          symbol: speaker.persona?.symbol ?? "•",
        });

        const generated = await generateThroughChain({ settings, chain, messages, signal });
        for (const a of generated.attempted ?? []) attempted.push(a);

        if (!generated.ok) {
          // Mid-round death. Stop cleanly instead of presenting a half-turn as a
          // whole one, which would misattribute words to a philosopher.
          emit({ type: "error", code: generated.code, message: generated.message });
          emit({ type: "done" });
          return;
        }

        // Charge once per round, on the first real token — not on arrival, so a
        // failed chain costs the reader nothing.
        if (!charged) {
          charged = true;
          const remaining = entitled ? null : await spend(key, ip);
          if (remaining !== null) emit({ type: "quota", remaining });
        }

        emit({
          type: "turn_delta",
          round: parsed.round,
          personaId: speaker.id,
          delta: generated.text,
        });
        emit({ type: "turn_end", round: parsed.round, personaId: speaker.id });

        // Hand this turn to the next speaker, and to the summary later.
        transcriptSoFar = `${transcriptSoFar}\n\n${speaker.persona?.nameAr ?? speaker.id}: ${generated.text}`.trim();
      }

      // The preview stops here — with an invitation, not a wall.
      if (parsed.round >= roundCap(entitled) && !summaryAllowed(entitled)) {
        emit({ type: "preview_end" });
      }
      emit({ type: "done" });

      if (charged) {
        void recordUsage({
          provider: attempted[attempted.length - 1] ?? "unknown",
          model: "unknown",
          role: "chat",
          promptTokens: null,
          completionTokens: null,
          latencyMs: Date.now() - startedAt,
          attempted,
          ok: true,
        });
      }
    },
    cookieHeader
  );
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

type Generation =
  | { ok: true; text: string; provider: string; model: string; attempted: string[] }
  | { ok: false; code: string; message: string; attempted: string[] };

/**
 * One generation through the normal chain, so failover, the breaker and the
 * first-token budget all apply here exactly as they do on `/api/ai`.
 *
 * The whole reply is collected before it is emitted. A dialogue turn is short,
 * and holding it means a turn is never shown half-finished and then abandoned —
 * which for two named real philosophers is worse than waiting.
 */
async function generateThroughChain(args: {
  settings: AiSettings;
  chain: string[];
  messages: Array<{ role: string; content: string }>;
  signal: AbortSignal;
}): Promise<Generation> {
  const result = await runChain({
    role: "chat",
    messages: args.messages as never,
    modelFor: (id) => args.settings.providers[id]?.models.chat ?? "",
    chain: args.chain,
    firstTokenTimeoutMs: args.settings.firstTokenTimeoutMs,
    totalTimeoutMs: args.settings.totalTimeoutMs,
    attemptsPerProvider: args.settings.attemptsPerProvider,
    breaker: {
      threshold: args.settings.breakerThreshold,
      cooldownMs: args.settings.breakerCooldownMs,
    },
    maxOutputChars: args.settings.maxOutputChars,
    temperature: 0.9,
    signal: args.signal,
  });

  const attempted = result.attempts.map((a) => a.provider);

  if (!result.ok) {
    log.warn("dialogue_chain_failed", { reason: result.reason, attempted });
    return {
      ok: false,
      code: result.reason === "timeout_first_token" ? "slow" : "unavailable",
      message:
        result.reason === "timeout_first_token"
          ? "استغرق الرد وقتاً طويلاً. حاول مرة أخرى."
          : "تعذّر الوصول إلى أي مزوّد ذكاء اصطناعي. حاول بعد قليل.",
      attempted,
    };
  }

  let text = result.first;
  for await (const chunk of result.rest) {
    if (args.signal.aborted) break;
    text += chunk;
  }

  return { ok: true, text, provider: result.provider, model: result.model, attempted };
}

async function spend(key: string, ip: string | null): Promise<number | null> {
  return spendInteraction(key, ip).catch(() => {
    log.error("dialogue_quota_spend_failed");
    return null;
  });
}

function gate(reason: string, headers: Record<string, string>): Response {
  return jsonError(
    { ok: false, code: "GATE", limit: FREE_INTERACTIONS, remaining: 0, reason },
    402,
    headers
  );
}

function noProvider(headers: Record<string, string>): Response {
  return jsonError(
    { ok: false, code: "no_provider", error: "لم يُضبط أي مزوّد ذكاء اصطناعي على الخادم." },
    503,
    headers
  );
}

const ANON_COOKIE = "miab-anon";
const ANON_COOKIE_MAX_AGE = 30 * 24 * 3600;

/**
 * A stable pseudo-uid for a visitor with no account, plus the cookie that makes
 * it stable. Same shape and same reasoning as `/api/ai`: without it every
 * request would arrive with a fresh key and the allowance would never move.
 */
function resolveAnonIdentity(request: Request): { key: string; setCookie: string | null } {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const existing = new RegExp(`${ANON_COOKIE}=([a-zA-Z0-9_-]{16,64})`).exec(cookieHeader);

  if (existing) return { key: `anon-${existing[1]}`, setCookie: null };

  const id = crypto.randomUUID().replace(/-/g, "");
  const value = [
    `${ANON_COOKIE}=${id}`,
    `Max-Age=${ANON_COOKIE_MAX_AGE}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");

  return { key: `anon-${id}`, setCookie: value };
}
