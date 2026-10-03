/**
 * SSE plumbing shared by the AI routes.
 *
 * Extracted from `/api/ai` because `/dialogue` needs exactly the same framing,
 * the same abort-on-disconnect behaviour and the same terminal `done` frame.
 * Two copies of this would drift, and a drifted framing rule is the kind of bug
 * that only shows up as a truncated reply for one surface.
 */

import type { DialogueEvent } from "./dialogue-types";
import type { StreamEvent } from "./types";

export type AiEvent = StreamEvent | DialogueEvent;

/**
 * SSE response headers.
 *
 * `x-accel-buffering: no` is not decoration. Without it an intermediary may
 * buffer the whole response, and the client receives nothing until the model has
 * finished — which looks exactly like a broken stream.
 */
export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

/** One SSE frame. The blank line is the frame delimiter, not decoration. */
export function frameEvent(event: AiEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function frameDone(): string {
  return "data: [DONE]\n\n";
}

export function jsonError(
  body: Record<string, unknown>,
  status: number,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders },
  });
}

/**
 * Builds an SSE response whose body is produced by `produce`.
 *
 * On disconnect the signal aborts, and `produce` is expected to pass it to every
 * upstream fetch. That is what stops a user closing the tab from us paying for
 * tokens nobody will read.
 *
 * `produce` reports its own failures; the `finally` here only guarantees the
 * stream always closes with a terminal frame, so the client never has to infer
 * "ended" from a socket timeout.
 */
export function sseResponse(
  produce: (signal: AbortSignal, emit: (event: AiEvent) => void) => Promise<void>,
  extraHeaders: Record<string, string> = {}
): Response {
  const controller = new AbortController();

  const body = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const emit = (event: AiEvent) => {
        try {
          ctrl.enqueue(new TextEncoder().encode(frameEvent(event)));
        } catch {
          /* client already gone */
        }
      };

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
          ctrl.enqueue(new TextEncoder().encode(frameDone()));
          ctrl.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(body, { headers: { ...SSE_HEADERS, ...extraHeaders } });
}
