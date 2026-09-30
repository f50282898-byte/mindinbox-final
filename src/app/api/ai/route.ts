export const runtime = "edge";

const requestTimeoutMs = 6_500;
const maximumMessages = 24;
const maximumPromptLength = 8_000;
const anonymousLimit = 5;
const accountDailyLimit = 10;
const trialDailyLimit = 20;
const usageCookieName = "miab_usage";

type ChatMessage = { role: "user" | "assistant" | "model"; content: string };
type ProviderResult = { text: string; via: string };
type Access = { scope: string; limit: number | null; count: number; day: string; tier: string };

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function usageKey(): Promise<CryptoKey> {
  const secret = process.env.ANON_SESSION_SECRET
    ?? process.env.GEMINI_API_KEY
    ?? process.env.GROQ_API_KEY
    ?? process.env.NVIDIA_API_KEY
    ?? process.env.BYTEZ_API_KEY;
  if (!secret || secret.length < 32) throw new Error("Usage signing secret is not configured");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(`mind-inbox-anonymous-usage:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function verifyFirebaseToken(idToken: string): Promise<{ uid: string; tier: string; trialEndsAt?: string }> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId) throw new Error("Firebase server verification is not configured");
  const identity = await requestJson(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const users = identity.users as Array<{ localId?: string }> | undefined;
  const uid = users?.[0]?.localId;
  if (!uid) throw new Error("Unauthorized");
  const profile = await requestJson(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/users/${encodeURIComponent(uid)}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const fields = profile.fields as Record<string, { stringValue?: string; timestampValue?: string }> | undefined;
  const createdAt = fields?.createdAt?.timestampValue;
  const serverTrialEnd = createdAt
    ? new Date(Date.parse(createdAt) + 14 * 24 * 60 * 60 * 1000).toISOString()
    : undefined;
  return {
    uid,
    tier: fields?.subscriptionTier?.stringValue ?? "free",
    trialEndsAt: serverTrialEnd ?? fields?.trialEndsAt?.stringValue,
  };
}

async function accessFor(request: Request): Promise<Access> {
  const today = new Date().toISOString().slice(0, 10);
  const authorization = request.headers.get("authorization");
  let scope = "anonymous";
  let limit: number | null = anonymousLimit;
  let tier = "free";

  if (authorization?.startsWith("Bearer ")) {
    const identity = await verifyFirebaseToken(authorization.slice(7));
    scope = `user:${identity.uid}`;
    tier = identity.tier;
    const trialActive = identity.trialEndsAt ? Date.parse(identity.trialEndsAt) > Date.now() : false;
    limit = identity.tier === "oracle" || identity.tier === "sanctum"
      ? null
      : trialActive ? trialDailyLimit : accountDailyLimit;
  }

  if (limit !== null) await usageKey();

  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookie = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${usageCookieName}=`))?.slice(usageCookieName.length + 1);
  let count = 0;
  if (cookie && limit !== null) {
    try {
      const [encodedPayload, encodedSignature] = cookie.split(".");
      const payload = new TextDecoder().decode(base64UrlDecode(encodedPayload));
      const signature = base64UrlDecode(encodedSignature);
      const key = await usageKey();
      const signatureBuffer = new Uint8Array(signature).buffer as ArrayBuffer;
      const valid = await crypto.subtle.verify("HMAC", key, signatureBuffer, new TextEncoder().encode(payload));
      if (valid) {
        const saved = JSON.parse(payload) as { scope?: string; count?: number; day?: string };
        const expectedDay = scope === "anonymous" ? "lifetime" : today;
        if (saved.scope === scope && saved.day === expectedDay && Number.isInteger(saved.count) && saved.count! >= 0) count = saved.count!;
      }
    } catch {
      count = 0;
    }
  }
  return { scope, limit, count, day: scope === "anonymous" ? "lifetime" : today, tier };
}

async function withUsageCookie(response: Response, access: Access): Promise<Response> {
  if (access.limit === null) return response;
  const payload = JSON.stringify({ scope: access.scope, count: access.count + 1, day: access.day });
  const key = await usageKey();
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const encoded = `${base64UrlEncode(new TextEncoder().encode(payload))}.${base64UrlEncode(new Uint8Array(signature))}`;
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", `${usageCookieName}=${encoded}; Path=/; Max-Age=${access.scope === "anonymous" ? 31536000 : 86400}; HttpOnly; Secure; SameSite=Lax`);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function messagesFrom(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximumMessages) return null;
  const messages: ChatMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const candidate = item as Record<string, unknown>;
    if (!["user", "assistant", "model"].includes(String(candidate.role)) || typeof candidate.content !== "string") return null;
    if (!candidate.content.trim() || candidate.content.length > maximumPromptLength) return null;
    messages.push({ role: candidate.role as ChatMessage["role"], content: candidate.content.trim() });
  }
  return messages;
}

async function requestJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) });
  if (!response.ok) throw new Error(`Provider returned ${response.status}`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object") throw new Error("Provider returned invalid JSON");
  return payload as Record<string, unknown>;
}

function openAiText(payload: Record<string, unknown>): string | null {
  const choices = payload.choices;
  if (!Array.isArray(choices)) return null;
  const choice = choices[0] as { message?: { content?: unknown } } | undefined;
  return typeof choice?.message?.content === "string" ? choice.message.content : null;
}

async function gemini(messages: ChatMessage[]): Promise<ProviderResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini unavailable");
  const payload = await requestJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL ?? "gemini-2.0-flash"}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: messages.map((message) => ({ role: message.role === "user" ? "user" : "model", parts: [{ text: message.content }] })) }),
    },
  );
  const candidates = payload.candidates as Array<{ content?: { parts?: Array<{ text?: unknown }> } }> | undefined;
  const text = candidates?.[0]?.content?.parts?.map((part) => typeof part.text === "string" ? part.text : "").join("").trim();
  if (!text) throw new Error("Gemini returned no content");
  return { text, via: "gemini" };
}

async function openAiCompatible(name: string, url: string, key: string | undefined, model: string, messages: ChatMessage[]): Promise<ProviderResult> {
  if (!key) throw new Error(`${name} unavailable`);
  const payload = await requestJson(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: messages.map(({ role, content }) => ({ role: role === "model" ? "assistant" : role, content })),
      max_tokens: 1200,
    }),
  });
  const text = openAiText(payload)?.trim();
  if (!text) throw new Error(`${name} returned no content`);
  return { text, via: name.toLowerCase() };
}

async function bytez(messages: ChatMessage[]): Promise<ProviderResult> {
  const key = process.env.BYTEZ_API_KEY;
  if (!key) throw new Error("Bytez unavailable");
  const model = process.env.BYTEZ_MODEL ?? "openai/gpt-4o-mini";
  const payload = await requestJson(`https://api.bytez.com/models/v2/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messages: messages.map(({ role, content }) => ({ role: role === "model" ? "assistant" : role, content })) }),
  });
  const output = payload.output;
  const text = typeof output === "string"
    ? output
    : output && typeof output === "object" && "text" in output && typeof output.text === "string"
      ? output.text
      : openAiText(payload);
  if (!text?.trim()) throw new Error("Bytez returned no content");
  return { text: text.trim(), via: "bytez" };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const messages = body && typeof body === "object" ? messagesFrom((body as { messages?: unknown }).messages) : null;
  if (!messages) return Response.json({ error: "Provide 1–24 valid messages; each message must be at most 8,000 characters." }, { status: 400 });

  let access: Access;
  try {
    access = await accessFor(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not verify access";
    const status = message === "Unauthorized" ? 401 : 503;
    return Response.json({ error: status === 401 ? "Sign in again to continue." : "AI access is not configured for this environment." }, { status });
  }
  if (body && typeof body === "object" && (body as { feature?: unknown }).feature === "daily-philosopher") {
    if (!access.scope.startsWith("user:") || !["oracle", "sanctum"].includes(access.tier)) {
      return Response.json({ error: "The Daily Philosopher requires an Oracle or Sanctum membership." }, { status: 403 });
    }
  }
  if (access.limit !== null && access.count >= access.limit) {
    return Response.json({ error: "Your current AI interaction allowance has been used." }, { status: 429 });
  }

  const providers: Array<() => Promise<ProviderResult>> = [
    () => gemini(messages),
    () => openAiCompatible("Groq", "https://api.groq.com/openai/v1/chat/completions", process.env.GROQ_API_KEY, process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile", messages),
    () => openAiCompatible("NVIDIA", "https://integrate.api.nvidia.com/v1/chat/completions", process.env.NVIDIA_API_KEY, process.env.NVIDIA_MODEL ?? "meta/llama-3.1-70b-instruct", messages),
    () => bytez(messages),
  ];

  for (const provider of providers) {
    try {
      const result = await provider();
      return await withUsageCookie(Response.json({ ok: true, ...result }), access);
    } catch {
      continue;
    }
  }

  return Response.json({ error: "Reflection is temporarily unavailable. Please try again shortly." }, { status: 503 });
}
