"use client";

/**
 * Reads a Server-Sent Events body into the events it carries.
 *
 * Shared by /wisdom and /dialogue so both have exactly one parser. If the wire
 * format changes, it changes here once.
 *
 * Three things this must get right, because they are what the UI hangs off:
 *  - a frame split across two network reads is reassembled, not dropped
 *  - a stream that ends with neither `done` nor `error` is reported as
 *    truncated, so the UI never presents half an answer as finished
 *  - the caller's `AbortSignal` cancels the underlying reader
 */

import type { StreamEvent } from "@/lib/ai/types";

export interface StreamHandlers {
  onDelta?: (chunk: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
  onQuota?: (remaining: number) => void;
}

export interface StreamOutcome {
  /** True when the server sent `done`. False means truncated. */
  completed: boolean;
  /** Terminal error message, if the server sent one. */
  error?: string;
  /** Every delta joined, for callers that want the final text. */
  text: string;
}

export async function consumeStream(
  body: ReadableStream<Uint8Array> | null,
  handlers: StreamHandlers,
  signal?: AbortSignal
): Promise<StreamOutcome> {
  const outcome: StreamOutcome = { completed: false, text: "" };
  if (!body) {
    outcome.error = "انقطع الاتصال.";
    handlers.onError?.(outcome.error);
    return outcome;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawDone = false;

  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // `stream: true` keeps a multi-byte Arabic character split across two
      // reads from becoming replacement characters mid-word.
      buffer += decoder.decode(value, { stream: true });

      let index = buffer.indexOf("\n\n");
      while (index !== -1) {
        const frame = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        index = buffer.indexOf("\n\n");

        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;

          let parsed: StreamEvent;
          try {
            parsed = JSON.parse(payload) as StreamEvent;
          } catch {
            // A malformed frame is skipped, not fatal: one bad byte should not
            // discard a reply the user is already reading.
            continue;
          }

          if (parsed.type === "delta") {
            outcome.text += parsed.delta;
            handlers.onDelta?.(parsed.delta);
          } else if (parsed.type === "done") {
            sawDone = true;
          } else if (parsed.type === "error") {
            outcome.error = parsed.message;
            handlers.onError?.(parsed.message);
          } else if (
            (parsed as unknown as { type: "quota"; remaining: number }).type === "quota"
          ) {
            handlers.onQuota?.(
              (parsed as unknown as { remaining: number }).remaining
            );
          }
        }
      }
    }

    outcome.completed = sawDone;
    if (sawDone) handlers.onDone?.();
    return outcome;
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      outcome.error = undefined;
      return outcome;
    }
    outcome.error = "انقطع الاتصال. تحقّق من الشبكة ثم أعد المحاولة.";
    handlers.onError?.(outcome.error);
    return outcome;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}

/**
 * Reads a JSON error body from a non-2xx response.
 *
 * The gate answers with `{ code: "GATE" }` before any stream opens, so this is
 * how the UI learns the allowance ran out.
 */
export async function readErrorBody(
  res: Response
): Promise<{ code?: string; error?: string; limit?: number; remaining?: number } | null> {
  try {
    return (await res.json()) as {
      code?: string;
      error?: string;
      limit?: number;
      remaining?: number;
    };
  } catch {
    return null;
  }
}
