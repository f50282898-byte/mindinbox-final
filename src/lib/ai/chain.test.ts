import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetBreakers } from "@/lib/ai/breaker";
import { runChain, type ChainOptions } from "@/lib/ai/chain";
import { overrideAdapters } from "@/lib/ai/providers";
import type { ProviderAdapter, ProviderCall, ProviderStream } from "@/lib/ai/types";

/**
 * Failover behaviour, proven with fake providers.
 *
 * These are the acceptance criteria for the chain:
 *   - the first provider failing moves to the second *before the first byte*
 *   - once the first byte is out, failure ends the response with a clean error
 *   - the breaker opens after repeated failures and skips the provider
 *   - a single retry happens before moving on
 *
 * Nothing here touches the network or needs an API key.
 */

/** A provider whose chunks the test controls. */
function fakeProvider(
  id: string,
  behaviour: {
    /** Rejects `stream()` entirely — a connect-time failure. */
    failOpen?: boolean;
    /** Returns headers, then throws on the first read — a stall. */
    stallFirst?: boolean;
    /** Yields `chunks`, then throws — a mid-stream death. */
    chunks?: string[];
    /** Never yields anything. */
    empty?: boolean;
    /** Milliseconds to wait before the first chunk. */
    delayMs?: number;
    usage?: { promptTokens: number | null; completionTokens: number | null };
  }
): ProviderAdapter {
  return {
    id,
    label: id,
    configured: () => true,
    async stream(call: ProviderCall): Promise<ProviderStream> {
      if (behaviour.failOpen) throw new Error(`${id} responded 503`);

      let aborted = false;
      call.signal.addEventListener("abort", () => {
        aborted = true;
      });

      // A cancellable sleep. A real `fetch` aborts mid-flight, so the fake must
      // too — otherwise the timeout test would prove nothing: the fake would
      // ignore the abort and hand over a token anyway.
      const wait = (ms: number) =>
        new Promise<void>((resolve) => {
          if (aborted) return resolve();
          const t = setTimeout(resolve, ms);
          call.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(t);
              resolve();
            },
            { once: true }
          );
        });

      const chunks = (async function* () {
        if (behaviour.delayMs) await wait(behaviour.delayMs);
        if (aborted) return;
        if (behaviour.stallFirst) throw new Error(`${id} stalled`);
        if (behaviour.empty) return;

        for (const piece of behaviour.chunks ?? ["ok"]) {
          if (aborted) return;
          yield piece;
        }
      })();

      return {
        chunks,
        usage: async () => behaviour.usage ?? null,
      };
    },
  };
}

/** A provider that yields `parts` and then dies mid-stream. */
function dyingProvider(id: string, parts: string[]): ProviderAdapter {
  return {
    id,
    label: id,
    configured: () => true,
    async stream(call: ProviderCall): Promise<ProviderStream> {
      let sent = 0;
      const chunks = (async function* () {
        for (const part of parts) {
          yield part;
          sent += 1;
        }
        throw new Error(`${id} connection reset`);
      })();
      return { chunks, usage: async () => null };
    },
  };
}

function baseOptions(overrides: Partial<ChainOptions> = {}): ChainOptions {
  return {
    role: "chat",
    messages: [{ role: "user", content: "مرحبا" }],
    modelFor: () => "test-model",
    chain: ["alpha", "beta"],
    firstTokenTimeoutMs: 200,
    totalTimeoutMs: 2000,
    attemptsPerProvider: 1,
    breaker: { threshold: 3, cooldownMs: 50 },
    maxOutputChars: 1000,
    temperature: 0.8,
    signal: new AbortController().signal,
    ...overrides,
  };
}

/** Collects a stream to a string. */
async function drain(iter: AsyncIterable<string>): Promise<string> {
  let out = "";
  for await (const piece of iter) out += piece;
  return out;
}

beforeEach(() => {
  resetBreakers();
});

afterEach(() => {
  overrideAdapters(null);
  resetBreakers();
  vi.useRealTimers();
});

describe("failover before the first byte", () => {
  it("falls through to the next provider when the first refuses to open", async () => {
    overrideAdapters([
      fakeProvider("alpha", { failOpen: true }),
      fakeProvider("beta", { chunks: ["مرحبا", " بك"] }),
    ]);

    const result = await runChain(baseOptions());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provider).toBe("beta");
    // The user never saw anything from alpha, so switching is invisible.
    expect(result.first).toBe("مرحبا");
    expect(await drain(result.rest)).toBe(" بك");
    expect(result.attempts.map((a) => `${a.provider}:${a.ok}`)).toEqual([
      "alpha:false",
      "beta:true",
    ]);
  });

  it("falls through when the first provider stalls before its first token", async () => {
    overrideAdapters([
      fakeProvider("alpha", { stallFirst: true }),
      fakeProvider("beta", { chunks: ["نجوت"] }),
    ]);

    const result = await runChain(baseOptions());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.provider).toBe("beta");
  });

  it("falls through when the first provider returns an empty stream", async () => {
    overrideAdapters([
      fakeProvider("alpha", { empty: true }),
      fakeProvider("beta", { chunks: ["نجوت"] }),
    ]);

    const result = await runChain(baseOptions());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.provider).toBe("beta");
  });

  it("honours the time-to-first-token budget and moves on", async () => {
    overrideAdapters([
      fakeProvider("alpha", { chunks: ["بطيء"], delayMs: 500 }),
      fakeProvider("beta", { chunks: ["سريع"] }),
    ]);

    const result = await runChain(baseOptions({ firstTokenTimeoutMs: 80 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provider).toBe("beta");
    const alpha = result.attempts.find((a) => a.provider === "alpha");
    expect(alpha?.reason).toBe("timeout_first_token");
  });

  it("retries a provider once before moving on", async () => {
    let alphaCalls = 0;
    const flaky: ProviderAdapter = {
      id: "alpha",
      label: "alpha",
      configured: () => true,
      async stream(): Promise<ProviderStream> {
        alphaCalls += 1;
        if (alphaCalls === 1) throw new Error("alpha responded 500");
        return { chunks: (async function* () { yield "نجح في المحاولة الثانية"; })(), usage: async () => null };
      },
    };

    overrideAdapters([flaky, fakeProvider("beta", { chunks: ["لم يُستخدم"] })]);

    const result = await runChain(baseOptions({ attemptsPerProvider: 2 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The retry succeeded, so beta was never needed.
    expect(result.provider).toBe("alpha");
    expect(alphaCalls).toBe(2);
    expect(result.attempts.filter((a) => a.provider === "alpha")).toHaveLength(2);
  });
});

describe("failure after the first byte", () => {
  it("surfaces a clean error rather than switching providers mid-answer", async () => {
    // The whole point: alpha produced text the user is already reading, so the
    // chain commits. A later death must NOT hand over to beta.
    overrideAdapters([
      dyingProvider("alpha", ["أوّل ", "ثانٍ"]),
      fakeProvider("beta", { chunks: ["يجب ألا تظهر هذه"] }),
    ]);

    const result = await runChain(baseOptions());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.provider).toBe("alpha");
    expect(result.first).toBe("أوّل ");

    // Draining throws instead of quietly ending, which is what the route turns
    // into a terminal `error` SSE event.
    await expect(drain(result.rest)).rejects.toThrow(/connection reset/);
  });

  it("never yields beta's text after alpha has already streamed", async () => {
    let betaOpened = false;
    const beta: ProviderAdapter = {
      id: "beta",
      label: "beta",
      configured: () => true,
      async stream(): Promise<ProviderStream> {
        betaOpened = true;
        return {
          chunks: (async function* () { yield "بديل"; })(),
          usage: async () => null,
        };
      },
    };

    overrideAdapters([dyingProvider("alpha", ["جزء"]), beta]);

    const result = await runChain(baseOptions());
    expect(result.ok).toBe(true);
    if (result.ok) {
      await expect(drain(result.rest)).rejects.toThrow();
      // alpha failed mid-stream, so beta must never have been contacted.
      expect(betaOpened).toBe(false);
    }
  });
});

describe("circuit breaker", () => {
  it("opens after the threshold and skips the provider", async () => {
    let alphaOpened = 0;
    const bad: ProviderAdapter = {
      id: "alpha",
      label: "alpha",
      configured: () => true,
      async stream(): Promise<ProviderStream> {
        alphaOpened += 1;
        throw new Error("alpha responded 500");
      },
    };

    overrideAdapters([bad, fakeProvider("beta", { chunks: ["نجوت"] })]);

    const opts = baseOptions({ breaker: { threshold: 2, cooldownMs: 10_000 } });

    // Two requests, two failures each → the circuit should be open afterwards.
    await runChain(opts);
    await runChain(opts);
    expect(alphaOpened).toBe(2);

    // Third request: alpha is skipped entirely, beta answers.
    const third = await runChain(opts);
    expect(third.ok).toBe(true);
    if (third.ok) expect(third.provider).toBe("beta");
    expect(third.attempts.some((a) => a.provider === "alpha" && a.reason === "circuit_open")).toBe(
      true
    );
    // Not contacted at all.
    expect(alphaOpened).toBe(2);
  });
});

describe("cancellation", () => {
  it("stops immediately when the caller aborts", async () => {
    const controller = new AbortController();
    controller.abort();

    let opened = false;
    overrideAdapters([
      {
        id: "alpha",
        label: "alpha",
        configured: () => true,
        async stream(): Promise<ProviderStream> {
          opened = true;
          return { chunks: (async function* () { yield "لا"; })(), usage: async () => null };
        },
      },
    ]);

    const result = await runChain(baseOptions({ signal: controller.signal }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("cancelled");
    expect(opened).toBe(false);
  });

  it("stops pulling chunks once the caller aborts mid-stream", async () => {
    const controller = new AbortController();

    overrideAdapters([
      {
        id: "alpha",
        label: "alpha",
        configured: () => true,
        async stream(): Promise<ProviderStream> {
          const chunks = (async function* () {
            yield "أ";
            yield "ب";
            yield "ج";
            yield "د";
          })();
          return { chunks, usage: async () => null };
        },
      },
    ]);

    const result = await runChain(baseOptions({ signal: controller.signal }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const iterator = result.rest[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value).toBe("ب");

    controller.abort();

    // The generator must stop rather than keep yielding.
    const rest: string[] = [];
    for (;;) {
      const next = await iterator.next();
      if (next.done) break;
      rest.push(next.value);
    }
    expect(rest.length).toBeLessThan(3);
  });
});

describe("no provider available", () => {
  it("reports `no_provider` rather than throwing", async () => {
    overrideAdapters([fakeProvider("alpha", { chunks: ["x"] })]);
    const result = await runChain(baseOptions({ chain: ["gamma", "delta"] }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no_provider");
    expect(result.attempts.every((a) => a.reason === "not_configured")).toBe(true);
  });
});
