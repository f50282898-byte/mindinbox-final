import { NextResponse } from "next/server";
import { z } from "zod";
import { breakerSnapshot } from "@/lib/ai/breaker";
import { runChain, type AttemptRecord } from "@/lib/ai/chain";
import { DEFAULT_PERSONA_ID, getPersona, PERSONAS } from "@/lib/ai/personas";
import { usableChain } from "@/lib/ai/providers";
import { AI_DISCLOSURE_AR, buildSystemPrompt } from "@/lib/ai/prompts";
import { applyRemoteAiSettings, resolveAiSettings, type AiSettings } from "@/lib/ai/settings";
import { frameDone, frameEvent } from "@/lib/ai/sse";
import { buildMessages } from "@/lib/ai/safety/injection";
import { crisisReply, detectCrisis, type CrisisSeverity } from "@/lib/ai/safety/wellbeing";
import type { AiRole, ChatMessage, StreamErrorCode, StreamEvent } from "@/lib/ai/types";
import { bearerFromHeaders, verifyIdToken } from "@/lib/auth/server";
import { getEntitlements } from "@/lib/entitlements";
import { log } from "@/lib/log";
import { recordUsage } from "@/lib/metrics";
import { checkQuota, spendInteraction, FREE_INTERACTIONS } from "@/lib/quota";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/* ── request shape ───────────────────────────────────────────────────────── */

const MAX_MESSAGES = 40;
const MAX_CONTENT_LENGTH = 4000;

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        // `model` is the historical spelling of the assistant role; still accepted.
        role: z.enum(["user", "model", "assistant", "system"]),
        content: z.string().min(1).max(MAX_CONTENT_LENGTH),
      })
    )
    .min(1)
    .max(MAX_MESSAGES),
  personaId: z.string().max(40).optional(),
  role: z.enum(["chat", "analysis", "admin"]).optional(),
});

const SSE_HEADERS: Record<string, string> = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-store, no-transform",
  connection: "keep-alive",
  // Nginx and Cloudflare buffer proxied responses by default, which collapses a
  // stream into one delayed blob. Required, not optional.
  "x-accel-buffering": "no",
};

/* ── helpers ─────────────────────────────────────────────────────────────── */

function clientIp(headers: Headers): string | null {
  const ip = headers.get("cf-connecting-ip") ?? headers.get("x-real-ip");
  return ip && /^[\d.:a-f]{3,45}$/i.test(ip) ? ip : null;
}

function jsonError(body: unknown, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

/** Builds an SSE response whose body is produced by `produce`. */
function sse(
  produce: (signal: AbortSignal, emit: (event: StreamEvent) => void) => Promise<void>,
  extraHeaders: Record<string, string> = {}
): Response {
  const controller = new AbortController();

  const body = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const emit = (event: StreamEvent) => {
        try {
          ctrl.enqueue(frameEvent(event));
        } catch {
          /* client already gone */
        }
      };

      // When the socket dies, abort the signal. The chain passes it to every
      // upstream fetch, so a user closing the tab stops us paying for tokens
      // nobody will read.
      controller.signal.addEventListener(
        "abort",
        () => {
          try {
            ctrl.close();
          } catch {
            /* already closed */
          }
        },
        { once: true }
      );

      try {
        await produce(controller.signal, emit);
      } catch {
        /* produce() reports its own failures */
      } finally {
        try {
          ctrl.enqueue(frameDone());
          ctrl.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(body, { headers: { ...SSE_HEADERS, ...extraHeaders } });
}

/** Emits a fixed string as a stream, so a canned reply looks like a model one. */
async function emitStatic(text: string, emit: (event: StreamEvent) => void) {
  for (const piece of text.split(/(\s+)/)) {
    if (piece) emit({ type: "delta", delta: piece });
  }
  emit({ type: "done", usage: { promptTokens: null, completionTokens: null } });
}

function terminalCode(reason: string, aborted: boolean): StreamErrorCode {
  if (aborted) return "cancelled";
  if (reason === "timeout_first_token") return "timeout_first_token";
  return "provider_unavailable";
}

const ANON_COOKIE = "miab-anon";
/** 30 days. Long enough to be useful, short enough to not be permanent. */
const ANON_COOKIE_MAX_AGE = 30 * 24 * 3600;

/**
 * A stable pseudo-uid for a visitor with no account, plus the cookie that makes
 * it stable.
 *
 * Without this the allowance is meaningless for a guest: every request would
 * arrive with a fresh key, get its own counter starting at zero, and the gate
 * would never open. The cookie is what ties one browser to one counter.
 *
 * It is deliberately *not* signed. Signing it would not help — the value is not
 * an authorisation token, it is a routing key — and the quota it points at is
 * server-side, so the counter itself is the thing that cannot be forged.
 *
 * Returns the key and, when one was minted, a `Set-Cookie` header value.
 */
function resolveAnonIdentity(request: Request): { key: string; setCookie: string | null } {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const existing = new RegExp(`${ANON_COOKIE}=([a-zA-Z0-9_-]{16,64})`).exec(cookieHeader);

  if (existing) {
    return { key: `anon-${existing[1]}`, setCookie: null };
  }

  const id = crypto.randomUUID().replace(/-/g, "");
  const value = [
    `${ANON_COOKIE}=${id}`,
    `Max-Age=${ANON_COOKIE_MAX_AGE}`,
    "Path=/",
    // Readable by the server on every request; not readable by script, so a
    // page on our origin cannot exfiltrate it to another origin.
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");

  return { key: `anon-${id}`, setCookie: value };
}

/* ── POST ────────────────────────────────────────────────────────────────── */

export async function POST(request: Request) {
  const startedAt = Date.now();

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return jsonError({ error: "طلب غير صالح." }, 400);
  }

  const settings: AiSettings = applyRemoteAiSettings(resolveAiSettings(), null);
  const role: AiRole = parsed.role ?? "chat";

  // A client-supplied `system` turn is dropped in `buildMessages`; normalise the
  // rest here so the crisis detector sees clean roles.
  const turns: ChatMessage[] = parsed.messages.map((m) => ({
    role: m.role === "user" ? ("user" as const) : ("assistant" as const),
    content: m.content,
  }));

  /* ── 1. Wellbeing guard, before identity, quota and providers ────────────
     Someone reaching out at their worst moment should get a warm reply with
     nothing in the way: no token to verify, no counter to read, no provider to
     be down. Returning here also means it is never counted, because spending
     happens further down and only on this path's absence. */
  const crisis = detectCrisis(turns);
  if (crisis.severity !== "none") {
    const severity: CrisisSeverity = crisis.severity;
    const text = crisisReply(severity);

    log.warn("wellbeing_guard_triggered", { severity, categories: crisis.categories });

    void recordUsage({
      provider: "wellbeing",
      model: "none",
      role,
      promptTokens: null,
      completionTokens: null,
      latencyMs: Date.now() - startedAt,
      attempted: [],
      ok: true,
      wellbeing: true,
    });

    return sse(
      async (signal, emit) => {
        // Report the allowance without spending any of it.
        //
        // Without this the client never learns its remaining count on a crisis
        // turn, so the quiet meter stays hidden — and the user is left guessing
        // whether the conversation that just helped them is now closed off. The
        // count is read only; nothing here increments anything.
        //
        // Sent before the reply so the meter is right when the words appear.
        try {
          const anon = resolveAnonIdentity(request);
          const decision = await checkQuota(anon.key, clientIp(request.headers));
          emit({ type: "quota", remaining: decision.remaining });
        } catch {
          // An unreachable counter store is not a reason to withhold the reply.
        }

        await emitStatic(text, emit);
      },
      {
        "x-wellbeing": severity,
        // Explicitly not metered.
        "x-quota": "not-charged",
      }
    );
  }

  /* ── 2. Identity ───────────────────────────────────────────────────────── */
  const verified = await verifyIdToken(bearerFromHeaders(request.headers)).catch(() => null);
  const uid = verified?.ok ? verified.user.uid : null;

  /* ── 3. Entitlement and the quota check (read-only) ───────────────────── */
  let entitled = false;
  if (uid) {
    try {
      entitled = (await getEntitlements(uid)).tier !== "free";
    } catch {
      // Unreachable entitlements do not grant access.
      entitled = false;
    }
  }

  // A signed-in user is metered per uid. A guest gets a cookie-backed key,
  // issued here on first contact.
  const anon = uid ? null : resolveAnonIdentity(request);
  const key = uid ?? anon!.key;
  const ip = clientIp(request.headers);
  const cookieHeader: Record<string, string> = anon?.setCookie
    ? { "Set-Cookie": anon.setCookie }
    : {};

  if (!entitled) {
    const decision = await checkQuota(key, ip);
    if (!decision.allowed) {
      return jsonError(
        {
          ok: false,
          code: "GATE",
          error: "استنفدت المحاولات المجانية.",
          limit: FREE_INTERACTIONS,
          reason: decision.reason,
        },
        402,
        cookieHeader
      );
    }
  }

  /* ── 4. Provider chain ─────────────────────────────────────────────────── */
  const chain = usableChain(settings, role);
  if (chain.length === 0) {
    return jsonError(
      { ok: false, code: "no_provider", error: "لم يُضبط أي مزوّد ذكاء اصطناعي على الخادم." },
      503,
      cookieHeader
    );
  }

  const persona = getPersona(parsed.personaId ?? DEFAULT_PERSONA_ID);
  const { messages, sanitised } = buildMessages({
    system: buildSystemPrompt({ persona }),
    turns,
  });

  return sse(async (signal, emit) => {
    // Issue the anon cookie on the successful path too, so the very first reply
    // already carries the identity the next request will be metered against.
    if (cookieHeader["Set-Cookie"]) {
      emit({ type: "quota", remaining: FREE_INTERACTIONS });
    }
    const result = await runChain({
      role,
      messages,
      modelFor: (id) => settings.providers[id]?.models[role] ?? "",
      chain,
      firstTokenTimeoutMs: settings.firstTokenTimeoutMs,
      totalTimeoutMs: settings.totalTimeoutMs,
      attemptsPerProvider: settings.attemptsPerProvider,
      breaker: {
        threshold: settings.breakerThreshold,
        cooldownMs: settings.breakerCooldownMs,
      },
      maxOutputChars: settings.maxOutputChars,
      temperature: 0.85,
      signal,
    });

    if (!result.ok) {
      const attempted: AttemptRecord[] = result.attempts;
      log.warn("ai_chain_failed", {
        role,
        reason: result.reason,
        attempted: attempted.map((a) => `${a.provider}:${a.reason ?? "ok"}`),
      });

      void recordUsage({
        provider: attempted[attempted.length - 1]?.provider ?? "none",
        model: "none",
        role,
        promptTokens: null,
        completionTokens: null,
        latencyMs: Date.now() - startedAt,
        attempted: attempted.map((a) => a.provider),
        ok: false,
        failure: result.reason,
        injectionFiltered: sanitised,
      });

      emit({
        type: "error",
        code: terminalCode(result.reason, signal.aborted),
        message:
          result.reason === "timeout_first_token"
            ? "استغرق الرد وقتاً طويلاً. حاول مرة أخرى."
            : "تعذّر الوصول إلى أي مزوّد ذكاء اصطناعي. حاول بعد قليل.",
      });
      return;
    }

    const firstTokenAt = Date.now();

    /* ── 5. Spend ───────────────────────────────────────────────────────────
       Here, not on arrival: a response has genuinely started, so a failed chain
       costs the user nothing. The result is pushed down the same stream, so the
       client does not need a second request just to learn the new count. */
    let remainingAfter: number | null = null;
    if (!entitled) {
      remainingAfter = await spendInteraction(key, ip).catch(() => {
        log.error("quota_spend_failed");
        return null;
      });
      if (remainingAfter !== null) {
        emit({ type: "quota", remaining: remainingAfter });
      }
    }

    let emitted = 0;
    let truncated = false;

    emit({ type: "delta", delta: result.first });
    emitted += result.first.length;

    try {
      for await (const chunk of result.rest) {
        if (signal.aborted) break;

        if (emitted >= settings.maxOutputChars) {
          truncated = true;
          break;
        }

        const room = settings.maxOutputChars - emitted;
        const piece = chunk.length > room ? chunk.slice(0, room) : chunk;
        if (piece) {
          emit({ type: "delta", delta: piece });
          emitted += piece.length;
        }
      }
    } catch {
      /* The upstream died after the user already had text on screen. End with a
         terminal error event rather than a silent truncation, so the client can
         tell the answer is incomplete instead of treating it as finished. */
      emit({
        type: "error",
        code: "upstream_error",
        message: "انقطع الرد قبل اكتماله.",
      });

      void recordUsage({
        provider: result.provider,
        model: result.model,
        role,
        promptTokens: null,
        completionTokens: null,
        latencyMs: firstTokenAt - startedAt,
        attempted: result.attempts.filter((a) => !a.ok).map((a) => a.provider),
        ok: false,
        failure: "mid_stream_error",
        injectionFiltered: sanitised,
      });
      return;
    }

    let usage: { promptTokens: number | null; completionTokens: number | null } | null = null;

    if (truncated) {
      emit({
        type: "error",
        code: "output_truncated",
        message: "بلغ الرد الحد الأقصى.",
      });
    } else {
      usage = await result.usage();
      emit({
        type: "done",
        usage: usage ?? { promptTokens: null, completionTokens: null },
      });
    }

    void recordUsage({
      provider: result.provider,
      model: result.model,
      role,
      promptTokens: usage?.promptTokens ?? null,
      completionTokens: usage?.completionTokens ?? null,
      latencyMs: firstTokenAt - startedAt,
      attempted: result.attempts.filter((a) => !a.ok).map((a) => a.provider),
      ok: !truncated,
      failure: truncated ? "output_truncated" : undefined,
      injectionFiltered: sanitised,
    });
  }, cookieHeader);
}

/* ── GET: configuration probe ────────────────────────────────────────────── */

export async function GET() {
  const settings = resolveAiSettings();
  const chain = usableChain(settings, "chat");
  const now = Date.now();

  return NextResponse.json(
    {
      ok: chain.length > 0,
      role: "chat",
      // Provider ids only. Model ids are configuration and are not public.
      providers: chain,
      personas: PERSONAS.map((p) => ({ id: p.id, nameAr: p.nameAr, nameEn: p.nameEn })),
      defaultPersona: DEFAULT_PERSONA_ID,
      disclosure: AI_DISCLOSURE_AR,
      limits: { maxOutputChars: settings.maxOutputChars, freeInteractions: FREE_INTERACTIONS },
      breakers: breakerSnapshot(
        { threshold: settings.breakerThreshold, cooldownMs: settings.breakerCooldownMs },
        now
      ),
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
