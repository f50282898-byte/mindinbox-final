"use client";

/**
 * Reads a `/dialogue` SSE body.
 *
 * Separate from the chat reader in `stream-client.ts` because the events are
 * different: here a delta is only meaningful *between* a `turn_start` and its
 * `turn_end`, and the reader has to track which speaker is open. Sharing one
 * parser would have meant optional fields and a branch on every frame.
 */

import type { DialogueEvent } from "@/lib/ai/dialogue-types";

export interface DialogueHandlers {
  onTurnStart?: (e: Extract<DialogueEvent, { type: "turn_start" }>) => void;
  onTurnDelta?: (delta: string, personaId: string) => void;
  onTurnEnd?: (personaId: string) => void;
  onSummaryStart?: () => void;
  onSummaryDelta?: (delta: string) => void;
  onSummaryEnd?: () => void;
  onQuota?: (remaining: number) => void;
  onPreviewEnd?: () => void;
  onError?: (message: string) => void;
}

export interface DialogueOutcome {
  completed: boolean;
  error?: string;
  /** Set when the server ended the dialogue at the preview limit. */
  previewEnded: boolean;
}

export async function consumeDialogue(
  body: ReadableStream<Uint8Array> | null,
  handlers: DialogueHandlers,
  signal?: AbortSignal
): Promise<DialogueOutcome> {
  const outcome: DialogueOutcome = { completed: false, previewEnded: false };
  if (!body) {
    outcome.error = "انقطع الاتصال.";
    handlers.onError?.(outcome.error);
    return outcome;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawDone = false;
  /** The speaker currently streaming, so a delta is attributed correctly. */
  let openSpeaker: string | null = null;
  let summaryOpen = false;

  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
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

          let event: DialogueEvent;
          try {
            event = JSON.parse(payload) as DialogueEvent;
          } catch {
            // One bad frame is skipped, not fatal: the reader is mid-answer.
            continue;
          }

          switch (event.type) {
            case "turn_start":
              openSpeaker = event.personaId;
              handlers.onTurnStart?.(event);
              break;
            case "turn_delta":
              // Attribute by the speaker the server declared, never by guesswork:
              // a delta arriving with no open turn is dropped rather than shown
              // under the wrong philosopher's name.
              if (openSpeaker === event.personaId) handlers.onTurnDelta?.(event.delta, event.personaId);
              break;
            case "turn_end":
              openSpeaker = null;
              handlers.onTurnEnd?.(event.personaId);
              break;
            case "summary_start":
              summaryOpen = true;
              handlers.onSummaryStart?.();
              break;
            case "summary_delta":
              if (summaryOpen) handlers.onSummaryDelta?.(event.delta);
              break;
            case "summary_end":
              summaryOpen = false;
              handlers.onSummaryEnd?.();
              break;
            case "quota":
              handlers.onQuota?.(event.remaining);
              break;
            case "preview_end":
              outcome.previewEnded = true;
              handlers.onPreviewEnd?.();
              break;
            case "error":
              outcome.error = event.message;
              handlers.onError?.(event.message);
              break;
            case "done":
              sawDone = true;
              break;
          }
        }
      }
    }

    outcome.completed = sawDone;
    return outcome;
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return outcome;
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

export async function readDialogueError(res: Response): Promise<{
  code?: string;
  error?: string;
} | null> {
  try {
    return (await res.json()) as { code?: string; error?: string };
  } catch {
    return null;
  }
}
