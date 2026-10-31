import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST as postAi, GET as getAi } from "@/app/api/ai/route";
import { POST as postDialogue } from "@/app/api/dialogue/route";
import { overrideAdapters } from "@/lib/ai/providers";
import { resetDevQuotaCounters, spendInteraction, FREE_INTERACTIONS } from "@/lib/quota";
import { resetBreakers } from "@/lib/ai/breaker";
import { runChain } from "@/lib/ai/chain";
import { resolveAiSettings } from "@/lib/ai/settings";
import type { ProviderAdapter, ProviderCall, ProviderStream, StreamEvent } from "@/lib/ai/types";
import type { DialogueEvent } from "@/lib/ai/dialogue-types";

/* ── Test Utilities & Helpers ──────────────────────────────────────────────── */

const BASE_URL = "http://localhost:3000";

interface MockAdapterOptions {
  id: string;
  label?: string;
  chunks?: string[];
  failImmediate?: boolean;
  failMidStream?: boolean;
  onAbort?: () => void;
  latencyMs?: number;
}

function createMockAdapter(options: MockAdapterOptions): ProviderAdapter {
  const {
    id,
    label = id.toUpperCase(),
    chunks = ["تأمل ", "في ", "معنى ", "الحقيقة."],
    failImmediate = false,
    failMidStream = false,
    onAbort,
    latencyMs = 0,
  } = options;

  return {
    id,
    label,
    configured: () => true,
    stream: async (args: ProviderCall): Promise<ProviderStream> => {
      if (args.signal.aborted) {
        throw new Error("Request already aborted");
      }

      if (onAbort) {
        args.signal.addEventListener("abort", onAbort, { once: true });
      }

      if (latencyMs > 0) {
        await new Promise((r) => setTimeout(r, latencyMs));
      }

      if (failImmediate) {
        throw new Error(`Provider ${id} connection failed`);
      }

      let chunkIndex = 0;

      const chunkIterator: AsyncIterable<string> = {
        async *[Symbol.asyncIterator]() {
          for (const chunk of chunks) {
            if (args.signal.aborted) {
              throw new Error("Stream aborted by client");
            }
            if (failMidStream && chunkIndex === 1) {
              throw new Error(`Provider ${id} dropped connection mid-stream`);
            }
            chunkIndex++;
            yield chunk;
          }
        },
      };

      return {
        chunks: chunkIterator,
        usage: async () => ({
          promptTokens: 12,
          completionTokens: chunks.length * 3,
        }),
      };
    },
  };
}

function makeRequest(
  path: string,
  body?: unknown,
  customHeaders: Record<string, string> = {}
): Request {
  const headers = new Headers({
    "Content-Type": "application/json",
    Origin: BASE_URL,
    ...customHeaders,
  });

  const init: RequestInit = {
    method: "POST",
    headers,
  };

  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  return new Request(`${BASE_URL}${path}`, init);
}

interface ParsedSseResponse {
  events: (StreamEvent | DialogueEvent)[];
  deltas: string[];
  fullText: string;
  quota?: number;
  doneReceived: boolean;
  terminalEvent?: StreamEvent | DialogueEvent;
  errors: (StreamEvent | DialogueEvent)[];
}

async function parseSseStream(response: Response): Promise<ParsedSseResponse> {
  const events: (StreamEvent | DialogueEvent)[] = [];
  const deltas: string[] = [];
  const errors: (StreamEvent | DialogueEvent)[] = [];
  let quota: number | undefined;
  let doneReceived = false;
  let terminalEvent: StreamEvent | DialogueEvent | undefined;

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable");
  }

  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, "").trim();
        if (!line || line.startsWith(":")) continue;

        if (line.startsWith("data:")) {
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") {
            doneReceived = true;
            continue;
          }

          try {
            const parsed = JSON.parse(payload) as StreamEvent | DialogueEvent;
            events.push(parsed);

            if (parsed.type === "delta" && "delta" in parsed) {
              deltas.push(parsed.delta);
            } else if (parsed.type === "turn_delta" && "delta" in parsed) {
              deltas.push(parsed.delta);
            } else if (parsed.type === "summary_delta" && "delta" in parsed) {
              deltas.push(parsed.delta);
            } else if (parsed.type === "quota" && "remaining" in parsed) {
              quota = parsed.remaining;
            } else if (parsed.type === "error") {
              errors.push(parsed);
              terminalEvent = parsed;
            } else if (parsed.type === "done" || parsed.type === "preview_end") {
              terminalEvent = parsed;
            }
          } catch {
            // Tolerate non-JSON frames
          }
        }
      }
    }

    if (buffer.trim()) {
      const line = buffer.replace(/\r$/, "").trim();
      if (line.startsWith("data:")) {
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") {
          doneReceived = true;
        } else {
          try {
            const parsed = JSON.parse(payload) as StreamEvent | DialogueEvent;
            events.push(parsed);
          } catch {}
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    events,
    deltas,
    fullText: deltas.join(""),
    quota,
    doneReceived,
    terminalEvent,
    errors,
  };
}

/* ── Test Suite ───────────────────────────────────────────────────────────── */

describe("E2E AI Interactions Verification Suite (/api/ai & /api/dialogue)", () => {
  beforeEach(() => {
    resetDevQuotaCounters();
    resetBreakers();
    overrideAdapters([
      createMockAdapter({
        id: "gemini",
        label: "Google Gemini",
        chunks: ["الحكمة ", "تبدأ ", "بالسؤال ", "والتأمل."],
      }),
      createMockAdapter({
        id: "nvidia",
        label: "NVIDIA Nemotron",
        chunks: ["العقل ", "يميز ", "بين ", "الظاهر ", "والحقيقة."],
      }),
      createMockAdapter({
        id: "groq",
        label: "Groq Llama",
        chunks: ["البحث ", "عن ", "المعرفة ", "مسار ", "مستمر."],
      }),
    ]);
  });

  afterEach(() => {
    resetDevQuotaCounters();
    resetBreakers();
    overrideAdapters(null);
    vi.restoreAllMocks();
  });

  /* ═════════════════════════════════════════════════════════════════════════
     Tier 1: Feature Coverage
     - Single chat generation
     - Multi-turn conversational flow
     - Dialogue multi-round event framing & SSE stream wire protocol
     ═════════════════════════════════════════════════════════════════════════ */
  describe("Tier 1: Feature Coverage", () => {
    it("T1.1: Single chat generation (/api/ai) streams SSE with valid headers and events", async () => {
      const request = makeRequest("/api/ai", {
        messages: [{ role: "user", content: "ما هي الحكمة؟" }],
        personaId: "plato",
      });

      const response = await postAi(request);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("x-accel-buffering")).toBe("no");

      const sse = await parseSseStream(response);

      // Verify that delta chunks assembled into expected text
      expect(sse.deltas.length).toBeGreaterThan(0);
      expect(sse.fullText).toBe("الحكمة تبدأ بالسؤال والتأمل.");

      // Quota event should have been emitted
      expect(sse.quota).toBeDefined();
      expect(typeof sse.quota).toBe("number");

      // Verify terminal frames
      const doneEvent = sse.events.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();
      if (doneEvent && doneEvent.type === "done") {
        expect(doneEvent.usage).toBeDefined();
        expect(doneEvent.usage.completionTokens).toBeGreaterThan(0);
      }
      expect(sse.doneReceived).toBe(true);
    });

    it("T1.2: Multi-turn chat (/api/ai) accepts conversational history and role mappings", async () => {
      const request = makeRequest("/api/ai", {
        messages: [
          { role: "user", content: "أريد أن أسأل عن العدالة." },
          { role: "assistant", content: "العدالة إعطاء كل ذي حق حقه." },
          { role: "model", content: "وكيف ترى تطبيقها في النفس أولاً؟" },
          { role: "user", content: "كيف ننظم قوى النفس إذن؟" },
        ],
        personaId: "plato",
      });

      const response = await postAi(request);
      expect(response.status).toBe(200);

      const sse = await parseSseStream(response);
      expect(sse.deltas.length).toBeGreaterThan(0);
      expect(sse.events.some((e) => e.type === "done")).toBe(true);
      expect(sse.doneReceived).toBe(true);
    });

    it("T1.3: Dialogue multi-turn round orchestration (/api/dialogue) emits ordered turn events", async () => {
      const request = makeRequest("/api/dialogue", {
        mode: "round",
        question: "ما هو مصدر السعادة الحقيقية؟",
        personas: ["plato", "rumi"],
        round: 1,
        transcript: [],
      });

      const response = await postDialogue(request);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");

      const sse = await parseSseStream(response);

      // Verify Speaker 1 and Speaker 2 sequence
      const turns = sse.events.filter((e) => e.type === "turn_start");
      expect(turns.length).toBe(2);

      const firstTurn = turns[0];
      expect(firstTurn).toMatchObject({
        type: "turn_start",
        round: 1,
        personaId: "plato",
        nameAr: "أفلاطون",
      });

      const secondTurn = turns[1];
      expect(secondTurn).toMatchObject({
        type: "turn_start",
        round: 1,
        personaId: "rumi",
        nameAr: "الرومي",
      });

      // Verify guest preview end event (guest roundCap is 1)
      expect(sse.events.some((e) => e.type === "preview_end")).toBe(true);
      expect(sse.events.some((e) => e.type === "done")).toBe(true);
      expect(sse.doneReceived).toBe(true);
    });

    it("T1.4: Multi-byte UTF-8 Arabic text is safely preserved across stream chunks", async () => {
      const arabicPhrases = [
        "الْحَقِيقَةُ ",
        "نُورٌ ",
        "يَقْذِفُهُ ",
        "اللَّهُ فِي ",
        "قَلْبِ مَنْ يَشَاءُ.",
      ];

      overrideAdapters([
        createMockAdapter({
          id: "gemini",
          chunks: arabicPhrases,
        }),
      ]);

      const request = makeRequest("/api/ai", {
        messages: [{ role: "user", content: "صف الحقيقة" }],
      });

      const response = await postAi(request);
      const sse = await parseSseStream(response);

      expect(sse.fullText).toBe("الْحَقِيقَةُ نُورٌ يَقْذِفُهُ اللَّهُ فِي قَلْبِ مَنْ يَشَاءُ.");
      expect(sse.fullText.includes("\uFFFD")).toBe(false); // No unicode replacement chars
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════
     Tier 2: Boundary & Corner Cases
     - Empty & malformed inputs
     - Persona fallback & validation
     - Quota exhaustion (402 Payment Required)
     - Burst rate limiting (429)
     - Cross-origin CSRF guard (403)
     ═════════════════════════════════════════════════════════════════════════ */
  describe("Tier 2: Boundary & Corner Cases", () => {
    it("T2.1: Rejects empty or malformed prompts with HTTP 400 (/api/ai)", async () => {
      // Empty messages array
      const res1 = await postAi(makeRequest("/api/ai", { messages: [] }));
      expect(res1.status).toBe(400);

      // Empty content inside message
      const res2 = await postAi(
        makeRequest("/api/ai", { messages: [{ role: "user", content: "" }] })
      );
      expect(res2.status).toBe(400);

      // Missing messages field
      const res3 = await postAi(makeRequest("/api/ai", {}));
      expect(res3.status).toBe(400);

      // Malformed non-JSON body
      const res4 = await postAi(
        makeRequest("/api/ai", "NOT_JSON", { "Content-Type": "application/json" })
      );
      expect(res4.status).toBe(400);
    });

    it("T2.2: Rejects invalid dialogue parameters with HTTP 400 (/api/dialogue)", async () => {
      // Question too short (< 3 characters)
      const res1 = await postDialogue(
        makeRequest("/api/dialogue", {
          mode: "round",
          question: "هل",
          personas: ["plato", "rumi"],
          round: 1,
        })
      );
      expect(res1.status).toBe(400);

      // Duplicate personas in dialogue
      const res2 = await postDialogue(
        makeRequest("/api/dialogue", {
          mode: "round",
          question: "ما هو الخير الأسمى؟",
          personas: ["plato", "plato"],
          round: 1,
        })
      );
      expect(res2.status).toBe(400);
      const data2 = await res2.json();
      expect(data2.error).toBe("اختر فيلسوفين مختلفين.");
    });

    it("T2.3: Gracefully falls back to default persona in /api/ai on unknown personaId", async () => {
      const request = makeRequest("/api/ai", {
        messages: [{ role: "user", content: "ما رأيك؟" }],
        personaId: "unknown-persona-nonexistent",
      });

      const response = await postAi(request);
      expect(response.status).toBe(200);

      const sse = await parseSseStream(response);
      expect(sse.deltas.length).toBeGreaterThan(0);
      expect(sse.events.some((e) => e.type === "done")).toBe(true);
    });

    it("T2.4: Enforces persona registry strictly in /api/dialogue (rejects unknown persona)", async () => {
      const request = makeRequest("/api/dialogue", {
        mode: "round",
        question: "ما هي الفضيلة؟",
        personas: ["unknown-persona", "plato"],
        round: 1,
      });

      const response = await postDialogue(request);
      expect(response.status).toBe(400);
    });

    it("T2.5: Enforces quota limit returning HTTP 402 GATE on exhaustion (/api/ai)", async () => {
      const testAnonUid = "anon-0123456789abcdef0123456789abcdef";
      const cookieHeader = { Cookie: `miab-anon=0123456789abcdef0123456789abcdef` };

      // Consume all free interactions
      for (let i = 0; i < FREE_INTERACTIONS; i++) {
        await spendInteraction(testAnonUid, null);
      }

      const request = makeRequest(
        "/api/ai",
        { messages: [{ role: "user", content: "هل بقي لدي رصيد؟" }] },
        cookieHeader
      );

      const response = await postAi(request);
      expect(response.status).toBe(402);

      const data = await response.json();
      expect(data).toMatchObject({
        ok: false,
        code: "GATE",
        error: "استنفدت المحاولات المجانية.",
        limit: FREE_INTERACTIONS,
      });
    });

    it("T2.6: Enforces quota limit returning HTTP 402 GATE in /api/dialogue", async () => {
      const testAnonUid = "anon-fedcba9876543210fedcba9876543210";
      const cookieHeader = { Cookie: `miab-anon=fedcba9876543210fedcba9876543210` };

      for (let i = 0; i < FREE_INTERACTIONS; i++) {
        await spendInteraction(testAnonUid, null);
      }

      const request = makeRequest(
        "/api/dialogue",
        {
          mode: "round",
          question: "هل يمكن بدء حوار جديد الآن؟",
          personas: ["plato", "rumi"],
          round: 1,
        },
        cookieHeader
      );

      const response = await postDialogue(request);
      expect(response.status).toBe(402);

      const data = await response.json();
      expect(data.code).toBe("GATE");
      expect(data.limit).toBe(FREE_INTERACTIONS);
    });

    it("T2.7: Triggers burst rate-limiting (HTTP 429) when request threshold is exceeded", async () => {
      const cookieHeader = { Cookie: "miab-anon=11112222333344445555666677778888" };

      // Fire 8 requests (the allowed burst window limit)
      for (let i = 0; i < 8; i++) {
        const req = makeRequest(
          "/api/ai",
          { messages: [{ role: "user", content: `طلب سريع رقم ${i}` }] },
          cookieHeader
        );
        const res = await postAi(req);
        // The first 8 requests pass the burst gate (not 429)
        expect(res.status).not.toBe(429);
      }

      // The 9th request must be rate-limited by burst protection (HTTP 429)
      const burstReq = makeRequest(
        "/api/ai",
        { messages: [{ role: "user", content: "طلب زائد عن الحد" }] },
        cookieHeader
      );

      const burstRes = await postAi(burstReq);
      expect(burstRes.status).toBe(429);

      const data = await burstRes.json();
      expect(data).toMatchObject({
        ok: false,
        code: "RATE_LIMITED",
        error: "عديد الطلبات. انتظر قليلاً ثم أعد المحاولة.",
      });
    });

    it("T2.8: Blocks cross-origin requests with HTTP 403 (Same-origin CSRF guard)", async () => {
      const crossOriginReq = new Request(`${BASE_URL}/api/ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://malicious-attacker.com",
          "Sec-Fetch-Site": "cross-site",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "هجوم من موقع خارجي" }],
        }),
      });

      const res = await postAi(crossOriginReq);
      expect(res.status).toBe(403);

      const data = await res.json();
      expect(data.error).toBe("cross_origin_forbidden");
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════
     Tier 3: Cross-Feature & Failover
     - Automatic provider failover in chain
     - All providers down exhaustion
     - Client abort & cancellation handling
     - Mid-stream upstream failure reporting
     ═════════════════════════════════════════════════════════════════════════ */
  describe("Tier 3: Cross-Feature & Failover", () => {
    it("T3.1: Automatically fails over to secondary provider when primary fails", async () => {
      overrideAdapters([
        createMockAdapter({
          id: "gemini",
          failImmediate: true, // Primary fails
        }),
        createMockAdapter({
          id: "nvidia",
          chunks: ["نجاح ", "المزود ", "البديل ", "عبر ", "الفيل أوفر."],
        }),
      ]);

      const request = makeRequest("/api/ai", {
        messages: [{ role: "user", content: "اختبار الفيل أوفر" }],
      });

      const response = await postAi(request);
      expect(response.status).toBe(200);

      const sse = await parseSseStream(response);
      expect(sse.fullText).toBe("نجاح المزود البديل عبر الفيل أوفر.");
      expect(sse.events.some((e) => e.type === "done")).toBe(true);
      expect(sse.doneReceived).toBe(true);
    });

    it("T3.2: Emits terminal error event when all configured providers in chain fail", async () => {
      overrideAdapters([
        createMockAdapter({ id: "gemini", failImmediate: true }),
        createMockAdapter({ id: "nvidia", failImmediate: true }),
        createMockAdapter({ id: "groq", failImmediate: true }),
        createMockAdapter({ id: "anthropic", failImmediate: true }),
      ]);

      const request = makeRequest("/api/ai", {
        messages: [{ role: "user", content: "هل يعمل أي مزود؟" }],
      });

      const response = await postAi(request);
      expect(response.status).toBe(200); // SSE stream opens, reports error inside stream

      const sse = await parseSseStream(response);
      expect(sse.errors.length).toBeGreaterThan(0);

      const errorEvent = sse.errors[0] as { type: "error"; code: string; message: string };
      expect(errorEvent.type).toBe("error");
      expect(errorEvent.code).toBe("provider_unavailable");
      expect(errorEvent.message).toBe("تعذّر الوصول إلى أي مزوّد ذكاء اصطناعي. حاول بعد قليل.");
    });

    it("T3.3: Returns HTTP 503 no_provider when no AI providers are configured", async () => {
      overrideAdapters([]); // Empty adapter registry

      const request = makeRequest("/api/ai", {
        messages: [{ role: "user", content: "لا يوجد مزود" }],
      });

      const response = await postAi(request);
      expect(response.status).toBe(503);

      const data = await response.json();
      expect(data).toMatchObject({
        ok: false,
        code: "no_provider",
      });
    });

    it("T3.4: Propagates client cancellation and aborts upstream fetch cleanly", async () => {
      let upstreamAborted = false;

      overrideAdapters([
        createMockAdapter({
          id: "gemini",
          chunks: ["جزء 1", "جزء 2", "جزء 3", "جزء 4"],
          onAbort: () => {
            upstreamAborted = true;
          },
        }),
      ]);

      const abortController = new AbortController();
      const settings = resolveAiSettings();

      // Initiate runChain directly with client abort signal to verify upstream cancellation
      const chainPromise = runChain({
        role: "chat",
        messages: [{ role: "user", content: "سؤال سيتم إلغاؤه" }],
        modelFor: () => "gemini-2.5-flash",
        chain: ["gemini"],
        firstTokenTimeoutMs: 5000,
        totalTimeoutMs: 10000,
        attemptsPerProvider: 1,
        breaker: { threshold: 3, cooldownMs: 60000 },
        maxOutputChars: 4000,
        temperature: 0.7,
        signal: abortController.signal,
      });

      // Abort the controller immediately
      abortController.abort("client_left");
      const result = await chainPromise;

      expect(result.ok).toBe(false);
      expect(upstreamAborted).toBe(true);
    });

    it("T3.5: Emits upstream_error event when connection drops mid-stream", async () => {
      overrideAdapters([
        createMockAdapter({
          id: "gemini",
          chunks: ["البداية سليمة...", "انقطاع مفاجئ"],
          failMidStream: true,
        }),
      ]);

      const request = makeRequest("/api/ai", {
        messages: [{ role: "user", content: "اختبار انقطاع البث" }],
      });

      const response = await postAi(request);
      const sse = await parseSseStream(response);

      // Verify that initial text was received before error
      expect(sse.deltas.length).toBeGreaterThan(0);
      expect(sse.deltas[0]).toBe("البداية سليمة...");

      // And terminal error frame was emitted
      const err = sse.events.find((e) => e.type === "error") as { type: "error"; code: string };
      expect(err).toBeDefined();
      expect(err.code).toBe("upstream_error");
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════
     Tier 4: Real-World Scenarios
     - Arabic philosophical dialogue between Plato and Rumi
     - Wellbeing / Crisis safety intervention
     - Service health & configuration probe (GET /api/ai)
     ═════════════════════════════════════════════════════════════════════════ */
  describe("Tier 4: Real-World Scenarios", () => {
    it("T4.1: Executes full philosophical inquiry between Plato and Rumi in Arabic", async () => {
      overrideAdapters([
        createMockAdapter({
          id: "gemini",
          chunks: [
            "هل تظن أن المعرفة تذكّر للحقائق الثابتة، ",
            "أم هي كشفٌ يتجدد بالحب والوجدان؟",
          ],
        }),
      ]);

      const request = makeRequest("/api/dialogue", {
        mode: "round",
        question: "ما هو طريق الوصول إلى الحق؟",
        personas: ["plato", "rumi"],
        round: 1,
        transcript: [],
      });

      const response = await postDialogue(request);
      expect(response.status).toBe(200);

      const sse = await parseSseStream(response);

      // Check both philosophers are identified with valid Arabic labels
      const turnStarts = sse.events.filter((e) => e.type === "turn_start");
      expect(turnStarts.length).toBe(2);

      const platoTurn = turnStarts[0];
      const rumiTurn = turnStarts[1];

      expect(platoTurn).toMatchObject({
        round: 1,
        personaId: "plato",
        nameAr: "أفلاطون",
        symbol: "△",
      });

      expect(rumiTurn).toMatchObject({
        round: 1,
        personaId: "rumi",
        nameAr: "الرومي",
        symbol: "◈",
      });

      // Stream should conclude with preview_end and done
      expect(sse.events.some((e) => e.type === "preview_end")).toBe(true);
      expect(sse.events.some((e) => e.type === "done")).toBe(true);
    });

    it("T4.2: Wellbeing safety guard intercepts crisis message without spending quota", async () => {
      const testAnonUid = "anon-33334444555566667777888899990000";
      const cookieHeader = { Cookie: `miab-anon=33334444555566667777888899990000` };

      const crisisRequest = makeRequest(
        "/api/ai",
        {
          messages: [
            {
              role: "user",
              content: "أريد أن أنهي حياتي، تعبت من كل شيء ولا أريد أن أعيش.",
            },
          ],
        },
        cookieHeader
      );

      const response = await postAi(crisisRequest);
      expect(response.status).toBe(200);
      expect(response.headers.get("x-wellbeing")).toBe("acute");
      expect(response.headers.get("x-quota")).toBe("not-charged");

      const sse = await parseSseStream(response);

      // Must emit supportive text and terminate cleanly
      expect(sse.fullText.length).toBeGreaterThan(0);
      expect(sse.events.some((e) => e.type === "done")).toBe(true);

      // Free interactions should still be completely unspent (remaining = 5)
      expect(sse.quota).toBe(FREE_INTERACTIONS);
    });

    it("T4.3: Configuration probe (GET /api/ai) exposes healthy system capabilities", async () => {
      const response = await getAi();
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");

      const probe = await response.json();
      expect(probe.ok).toBe(true);
      expect(probe.role).toBe("chat");
      expect(Array.isArray(probe.providers)).toBe(true);
      expect(probe.providers.length).toBeGreaterThan(0);
      expect(Array.isArray(probe.personas)).toBe(true);
      expect(probe.personas.some((p: { id: string }) => p.id === "plato")).toBe(true);
      expect(probe.defaultPersona).toBe("plato");
      expect(probe.limits).toBeDefined();
      expect(probe.limits.freeInteractions).toBe(FREE_INTERACTIONS);
      expect(probe.breakers).toBeDefined();
    });
  });
});
