import { NextResponse } from "next/server";
import {
  askWithFailover,
  buildSystemPrompt,
  configuredProviderIds,
  getPhilosopher,
  PHILOSOPHERS,
  type ChatMessage,
  type EnvLike,
} from "@/lib/ai";
import {
  FREE_ATTEMPT_LIMIT,
  ANON_COOKIE_NAME,
  readSession,
  remainingAttempts,
  spendAttempt,
} from "@/lib/anon-session";
import { bearerFromHeaders, verifyIdToken } from "@/lib/edge-auth";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const MAX_MESSAGES = 40;
const MAX_CONTENT_LENGTH = 4000;

type Body = {
  messages?: unknown;
  philosopherId?: unknown;
};

function isUsableMessage(m: unknown): m is ChatMessage {
  if (!m || typeof m !== "object") return false;
  const rec = m as Record<string, unknown>;
  return (
    (rec.role === "user" || rec.role === "model" || rec.role === "system") &&
    typeof rec.content === "string" &&
    rec.content.trim().length > 0 &&
    rec.content.length <= MAX_CONTENT_LENGTH
  );
}

/**
 * AI gateway.
 *
 * Enforces the 5-attempt anonymous allowance server-side via an HMAC-signed
 * httpOnly cookie. The previous implementation counted attempts in
 * `localStorage`, so the limit could be bypassed by clearing storage or by
 * calling this endpoint directly.
 */
export async function POST(request: Request) {
  const env = process.env as unknown as EnvLike;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const anonSecret = process.env.ANON_SESSION_SECRET ?? "";

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const rawMessages = Array.isArray(body?.messages) ? body.messages : [];
  const messages = rawMessages.filter(isUsableMessage);
  if (messages.length === 0) {
    return NextResponse.json({ error: "أرسل رسالة واحدة على الأقل" }, { status: 400 });
  }
  if (messages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: "المحادثة أطول من الحد المسموح" }, { status: 413 });
  }

  /* ── Entitlement ──────────────────────────────────────────────────
     Order matters: verify the token first, then meter. An invalid token is
     treated as anonymous (it is not trusted for anything). */
  const tokenResult = await verifyIdToken(bearerFromHeaders(request.headers), projectId);
  const verified = tokenResult.ok ? tokenResult.token : null;

  const memberUid = verified?.uid ?? null;
  const tier = memberUid ? (verified?.tierClaim ?? null) : null;

  // A verified token carrying a tier claim bypasses anonymous metering.
  const isMember = tier === "oracle" || tier === "sanctum";
  let anonRemaining: number | null = null;
  let anonCookie: string | null = null;

  if (!isMember) {
    const session = await readSession(request, anonSecret);
    anonRemaining = remainingAttempts(session);
    if (anonRemaining <= 0) {
      // Deliberately does NOT touch Set-Cookie here. Clearing the cookie would
      // hand the visitor a fresh 5-attempt session on every rejection.
      return NextResponse.json(
        {
          ok: false,
          code: "gate",
          error: "استنفدت المحاولات المجانية. سجّل الدخول لفتح أربعة عشر يوماً من الحكمة.",
          limit: FREE_ATTEMPT_LIMIT,
        },
        { status: 402, headers: { "Cache-Control": "no-store" } }
      );
    }
    const spent = await spendAttempt(session, anonSecret);
    anonRemaining = remainingAttempts(spent.session);
    anonCookie = spent.cookie;
  }

  /* ── Provider chain ─────────────────────────────────────────────── */
  const configured = configuredProviderIds(env);
  if (configured.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        code: "no_provider",
        error: "لم يُضبط أي مزوّد ذكاء اصطناعي على الخادم.",
      },
      { status: 503 }
    );
  }

  const philosopher = getPhilosopher(
    typeof body?.philosopherId === "string" ? body.philosopherId : null
  );

  const outbound: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(philosopher) },
    ...messages.filter((m) => m.role !== "system").slice(-MAX_MESSAGES),
  ];

  const startedAt = Date.now();
  try {
    const result = await askWithFailover(outbound, env);

    const headers: Record<string, string> = {
      "X-AI-Provider": result.via,
      "Cache-Control": "no-store",
    };
    if (anonCookie) {
      headers["Set-Cookie"] = buildCookie(anonCookie, Date.now() + 30 * 24 * 3600 * 1000);
    }

    return NextResponse.json(
      {
        ok: true,
        text: result.text,
        via: result.via,
        philosopher: { id: philosopher.id, name: philosopher.name },
        remaining: anonRemaining,
        latencyMs: Date.now() - startedAt,
      },
      { status: 200, headers }
    );
  } catch (error) {
    // Metering is only spent on a successful answer; a total outage should not
    // burn the visitor's allowance.
    return NextResponse.json(
      {
        ok: false,
        code: "providers_unavailable",
        error:
          error instanceof Error
            ? error.message
            : "تعذّر الوصول إلى أي مزوّد ذكاء اصطناعي.",
        tried: configured,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}

/** Liveness / configuration probe. Exposes no secret values. */
export async function GET() {
  const env = process.env as unknown as EnvLike;
  const configured = configuredProviderIds(env);
  const metering = Boolean(process.env.ANON_SESSION_SECRET);

  return NextResponse.json(
    {
      runtime: "edge",
      ok: configured.length > 0,
      providers: configured,
      // `disabled` means the free-tier allowance cannot be enforced server-side.
      // This must be `signed` in production or anonymous attempts are unlimited.
      metering: metering ? "signed" : "disabled",
      hint: metering
        ? undefined
        : "Set ANON_SESSION_SECRET (>=32 chars) or the 5-attempt limit is not enforced.",
      philosophers: PHILOSOPHERS.map((p) => ({ id: p.id, name: p.name, latin: p.latin })),
      limit: FREE_ATTEMPT_LIMIT,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}

function buildCookie(value: string | null, expiresAt: number): string {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const parts = [
    `${ANON_COOKIE_NAME}=${value ?? ""}`,
    `Max-Age=${value ? maxAge : 0}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ];
  return parts.join("; ");
}