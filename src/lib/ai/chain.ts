/**
 * Failover chain.
 *
 * The rule that shapes this whole file: **failover is only allowed before the
 * first byte reaches the client.** Once a byte is out, the user is reading; we
 * cannot switch providers underneath them without producing two half-answers
 * stitched together. So the chain pulls the first chunk, and only then commits.
 *
 * Per attempt:
 *  - the circuit breaker is consulted first
 *  - the time-to-first-token budget applies to opening the stream AND to
 *    receiving the first chunk, so a provider that accepts the request and then
 *    stalls is caught too
 *  - one retry, then the next provider
 *
 * Budget is wall-clock for the whole chain, not per provider, so a long chain of
 * slow providers cannot exceed the request deadline.
 */

import {
  canAttempt,
  recordFailure,
  recordSuccess,
  type BreakerConfig,
} from "@/lib/ai/breaker";
import { getAdapters } from "@/lib/ai/providers";
import type {
  AiRole,
  AttemptFailure,
  ChatMessage,
  ProviderAdapter,
  Usage,
} from "@/lib/ai/types";

export interface ChainOptions {
  role: AiRole;
  messages: ChatMessage[];
  modelFor: (providerId: string) => string;
  chain: string[];
  firstTokenTimeoutMs: number;
  totalTimeoutMs: number;
  attemptsPerProvider: number;
  breaker: BreakerConfig;
  maxOutputChars: number;
  temperature: number;
  /** Caller disconnect. Aborts in-flight upstream requests. */
  signal: AbortSignal;
  /** Monotonic clock, injectable so tests do not depend on wall time. */
  now?: () => number;
}

export interface AttemptRecord {
  provider: string;
  ok: boolean;
  reason?: AttemptFailure;
  ms: number;
}

export interface ChainSuccess {
  ok: true;
  provider: string;
  model: string;
  /** First chunk. The caller must write this before consuming the rest. */
  first: string;
  /** Remaining chunks. Never includes `first`. */
  rest: AsyncIterable<string>;
  usage: () => Promise<Usage | null>;
  attempts: AttemptRecord[];
}

export interface ChainFailure {
  ok: false;
  attempts: AttemptRecord[];
  reason: AttemptFailure | "no_provider";
}

export type ChainResult = ChainSuccess | ChainFailure;

/**
 * Why the chain gave up.
 *
 * If every provider was skipped because it is not configured, that is a
 * different condition from "we tried and they all failed" — the route shows a
 * different message for each, so it must be distinguishable.
 */
function terminalReason(attempts: AttemptRecord[]): AttemptFailure | "no_provider" {
  if (attempts.length === 0) return "no_provider";
  if (attempts.every((a) => a.reason === "not_configured")) return "no_provider";
  const last = attempts[attempts.length - 1];
  return last.reason ?? "upstream_status";
}

/**
 * Opens one provider's stream and pulls its first chunk, enforcing the
 * time-to-first-token budget across both the request and the first read.
 */
async function openWithFirstChunk(
  adapter: ProviderAdapter,
  args: {
    model: string;
    messages: ChatMessage[];
    signal: AbortSignal;
    firstTokenTimeoutMs: number;
    maxOutputChars: number;
    temperature: number;
  }
): Promise<{ first: string; rest: AsyncIterable<string>; usage: () => Promise<Usage | null> }> {
  // One controller per attempt, so a timeout only kills this provider and not
  // the whole request.
  const attempt = new AbortController();
  // Distinguishes "our clock ran out" from "the caller went away". Without this
  // a timeout looks like an empty stream, and the user is told the wrong thing.
  let timedOut = false;
  const onCallerAbort = () => attempt.abort();
  args.signal.addEventListener("abort", onCallerAbort, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    attempt.abort();
  }, args.firstTokenTimeoutMs);

  try {
    const providerStream = await adapter.stream({
      messages: args.messages,
      model: args.model,
      maxOutputTokens: args.maxOutputChars,
      temperature: args.temperature,
      signal: attempt.signal,
    });

    const iterator = providerStream.chunks[Symbol.asyncIterator]();

    // The first `next()` is what the timeout is really protecting: a provider
    // that returns headers instantly and then stalls forever.
    const firstResult = await iterator.next();

    clearTimeout(timer);

    if (firstResult.done || !firstResult.value) {
      await iterator.return?.(undefined).catch(() => undefined);
      throw Object.assign(
        new Error(timedOut ? "provider timed out before first token" : "provider returned no tokens"),
        { cause: timedOut ? "timeout" : "empty_first_chunk" }
      );
    }

    const first = firstResult.value;

    // Yield everything after the first chunk with no further timeouts — the
    // budget was for reaching the user, and we have.
    async function* rest(): AsyncGenerator<string> {
      try {
        for (;;) {
          const next = await iterator.next();
          if (next.done) return;
          if (next.value) yield next.value;
        }
      } finally {
        // Cancels the upstream fetch on early return, e.g. the client leaving.
        await iterator.return?.(undefined).catch(() => undefined);
        attempt.abort();
        args.signal.removeEventListener("abort", onCallerAbort);
      }
    }

    return {
      first,
      rest: rest(),
      usage: async () => {
        try {
          return await providerStream.usage();
        } catch {
          return null;
        }
      },
    };
  } catch (err) {
    clearTimeout(timer);
    attempt.abort();
    args.signal.removeEventListener("abort", onCallerAbort);
    throw err;
  }
}

function failureOf(err: unknown, callerAborted: boolean): AttemptFailure {
  if (callerAborted) return "cancelled";
  const cause = (err as { cause?: unknown } | null)?.cause;
  if (cause === "timeout") return "timeout_first_token";
  if (cause === "empty_first_chunk") return "empty_first_chunk";
  const name = (err as { name?: string } | null)?.name ?? "";
  const message = err instanceof Error ? err.message : String(err);
  if (name === "AbortError" || message.includes("aborted")) return "timeout_first_token";
  if (message.includes("responded")) return "upstream_status";
  return "network";
}

/**
 * Walks the chain and returns the first provider that produces a token.
 *
 * Never throws: every failure mode is reported through the result, because the
 * caller has to decide between a clean SSE error and a JSON error.
 */
export async function runChain(options: ChainOptions): Promise<ChainResult> {
  const now = options.now ?? Date.now;
  const adapters = getAdapters();
  const startedAt = now();
  const attempts: AttemptRecord[] = [];

  for (const providerId of options.chain) {
    const adapter = adapters.get(providerId);
    const model = options.modelFor(providerId);

    if (!adapter || !model) {
      attempts.push({ provider: providerId, ok: false, reason: "not_configured", ms: 0 });
      continue;
    }

    for (let attemptNo = 0; attemptNo < Math.max(1, options.attemptsPerProvider); attemptNo++) {
      // Caller gone: stop immediately rather than burning a provider attempt.
      if (options.signal.aborted) {
        attempts.push({ provider: providerId, ok: false, reason: "cancelled", ms: 0 });
        return { ok: false, attempts, reason: terminalReason(attempts) };
      }

      if (!canAttempt(providerId, options.breaker, now())) {
        attempts.push({ provider: providerId, ok: false, reason: "circuit_open", ms: 0 });
        break; // try the next provider, do not retry this one
      }

      // Wall-clock budget for the whole chain.
      const elapsed = now() - startedAt;
      if (elapsed >= options.totalTimeoutMs) {
        attempts.push({ provider: providerId, ok: false, reason: "timeout_first_token", ms: elapsed });
        return { ok: false, attempts, reason: terminalReason(attempts) };
      }

      const attemptStarted = now();
      try {
        const opened = await openWithFirstChunk(adapter, {
          model,
          messages: options.messages,
          signal: options.signal,
          // Never spend more than the chain's remaining budget on one attempt.
          firstTokenTimeoutMs: Math.min(
            options.firstTokenTimeoutMs,
            options.totalTimeoutMs - elapsed
          ),
          maxOutputChars: options.maxOutputChars,
          temperature: options.temperature,
        });

        recordSuccess(providerId);
        attempts.push({ provider: providerId, ok: true, ms: now() - attemptStarted });

        return {
          ok: true,
          provider: providerId,
          model,
          first: opened.first,
          rest: opened.rest,
          usage: opened.usage,
          attempts,
        };
      } catch (err) {
        const reason = failureOf(err, options.signal.aborted);
        recordFailure(providerId, options.breaker, now());
        attempts.push({ provider: providerId, ok: false, reason, ms: now() - attemptStarted });

        // A cancelled request must not keep trying other providers.
        if (reason === "cancelled") {
          return { ok: false, attempts, reason: "cancelled" };
        }
      }
    }
  }

  return { ok: false, attempts, reason: terminalReason(attempts) };
}
