import { describe, expect, it } from "vitest";
import { consumeDialogue, type DialogueHandlers } from "@/lib/dialogue-client";
import type { DialogueEvent } from "@/lib/ai/dialogue-types";

/**
 * The `/dialogue` SSE reader.
 *
 * The property that matters: **a delta is only ever attributed to the speaker the
 * server declared.** Two named real philosophers are on screen, and a token shown
 * under the wrong name is a false attribution of words to a historical person —
 * not a rendering nit.
 */

/** Builds a stream from raw text, so frame boundaries can be controlled exactly. */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(ctrl) {
      for (const chunk of chunks) ctrl.enqueue(encoder.encode(chunk));
      ctrl.close();
    },
  });
}

/** The wire framing the server uses. */
function frame(event: DialogueEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function collector() {
  const seen: string[] = [];
  const turns: Array<{ personaId: string; text: string }> = [];
  let current: { personaId: string; text: string } | null = null;
  let summary = "";
  let summaryOpen = false;
  let quota: number | null = null;
  let previewEnded = false;
  let done = false;
  let error: string | undefined;

  const handlers: DialogueHandlers = {
    onTurnStart: (e) => {
      current = { personaId: e.personaId, text: "" };
      turns.push(current);
      seen.push(`start:${e.personaId}`);
    },
    onTurnDelta: (delta, personaId) => {
      if (current && current.personaId === personaId) current.text += delta;
      seen.push(`delta:${personaId}`);
    },
    onTurnEnd: (personaId) => {
      current = null;
      seen.push(`end:${personaId}`);
    },
    onSummaryStart: () => {
      summaryOpen = true;
      seen.push("summary:start");
    },
    onSummaryDelta: (delta) => {
      if (summaryOpen) summary += delta;
    },
    onSummaryEnd: () => {
      summaryOpen = false;
      seen.push("summary:end");
    },
    onQuota: (r) => {
      quota = r;
    },
    onPreviewEnd: () => {
      previewEnded = true;
    },
    onError: (m) => {
      error = m;
    },
  };

  return {
    handlers,
    seen,
    turns,
    result: () => ({ turns, summary, quota, previewEnded, done, error }),
    markDone: () => {
      done = true;
    },
  };
}

describe("consumeDialogue", () => {
  it("attributes each turn to the speaker the server declared", async () => {
    const c = collector();
    const stream = streamOf([
      frame({ type: "turn_start", round: 1, personaId: "plato", nameAr: "أفلاطون", symbol: "△" }),
      frame({ type: "turn_delta", round: 1, personaId: "plato", delta: "سؤال " }),
      frame({ type: "turn_delta", round: 1, personaId: "plato", delta: "الفكرة" }),
      frame({ type: "turn_end", round: 1, personaId: "plato" }),
      frame({ type: "turn_start", round: 1, personaId: "rumi", nameAr: "الرومي", symbol: "◈" }),
      frame({ type: "turn_delta", round: 1, personaId: "rumi", delta: "ورد" }),
      frame({ type: "turn_end", round: 1, personaId: "rumi" }),
      frame({ type: "done" }),
    ]);

    await consumeDialogue(stream, c.handlers);

    const { turns } = c.result();
    expect(turns).toHaveLength(2);
    expect(turns[0]).toEqual({ personaId: "plato", text: "سؤال الفكرة" });
    expect(turns[1]).toEqual({ personaId: "rumi", text: "ورد" });
  });

  it("drops a delta that arrives with no speaker open", async () => {
    // Better to lose a token than to print it under the previous philosopher.
    const c = collector();
    const stream = streamOf([
      frame({ type: "turn_delta", round: 1, personaId: "plato", delta: "تائه" }),
      frame({ type: "done" }),
    ]);

    await consumeDialogue(stream, c.handlers);
    expect(c.result().turns).toHaveLength(0);
  });

  it("does not mix a delta from one speaker into another's turn", async () => {
    // A misrouted frame must not extend the turn already on screen.
    const c = collector();
    const stream = streamOf([
      frame({ type: "turn_start", round: 1, personaId: "plato", nameAr: "أفلاطون", symbol: "△" }),
      frame({ type: "turn_delta", round: 1, personaId: "plato", delta: "أ" }),
      // Wrong speaker, mid-turn.
      frame({ type: "turn_delta", round: 1, personaId: "rumi", delta: "ب" }),
      frame({ type: "turn_end", round: 1, personaId: "plato" }),
      frame({ type: "done" }),
    ]);

    await consumeDialogue(stream, c.handlers);
    expect(c.result().turns[0]?.text).toBe("أ");
  });

  it("reassembles a frame split across two network reads", async () => {
    // Common on a slow mobile connection. Losing half a sentence reads to the
    // user as the philosopher trailing off.
    const c = collector();
    const full = frame({
      type: "turn_delta",
      round: 1,
      personaId: "plato",
      delta: "جملة كاملة",
    });
    const cut = Math.floor(full.length / 2);

    const stream = streamOf([
      frame({ type: "turn_start", round: 1, personaId: "plato", nameAr: "أفلاطون", symbol: "△" }),
      full.slice(0, cut),
      full.slice(cut),
      frame({ type: "done" }),
    ]);

    await consumeDialogue(stream, c.handlers);
    expect(c.result().turns[0]?.text).toBe("جملة كاملة");
  });

  it("separates the summary from the turns", async () => {
    const c = collector();
    const stream = streamOf([
      frame({ type: "summary_start" }),
      frame({ type: "summary_delta", delta: "اتفقا على " }),
      frame({ type: "summary_delta", delta: "الفرق." }),
      frame({ type: "summary_end" }),
      frame({ type: "done" }),
    ]);

    const outcome = await consumeDialogue(stream, c.handlers);
    expect(c.result().summary).toBe("اتفقا على الفرق.");
    expect(outcome.completed).toBe(true);
  });

  it("ignores a summary delta arriving before summary_start", async () => {
    const c = collector();
    const stream = streamOf([
      frame({ type: "summary_delta", delta: "تائه" }),
      frame({ type: "done" }),
    ]);
    await consumeDialogue(stream, c.handlers);
    expect(c.result().summary).toBe("");
  });

  it("surfaces the preview end", async () => {
    const c = collector();
    const stream = streamOf([frame({ type: "preview_end" }), frame({ type: "done" })]);
    const outcome = await consumeDialogue(stream, c.handlers);

    expect(outcome.previewEnded).toBe(true);
    expect(c.result().previewEnded).toBe(true);
  });

  it("reports the remaining allowance", async () => {
    const c = collector();
    const stream = streamOf([frame({ type: "quota", remaining: 4 }), frame({ type: "done" })]);
    await consumeDialogue(stream, c.handlers);
    expect(c.result().quota).toBe(4);
  });

  it("is not completed when the stream ends without a done frame", async () => {
    // A truncated stream must never be presented as a finished dialogue.
    const c = collector();
    const stream = streamOf([
      frame({ type: "turn_start", round: 1, personaId: "plato", nameAr: "أفلاطون", symbol: "△" }),
      frame({ type: "turn_delta", round: 1, personaId: "plato", delta: "ب" }),
    ]);

    const outcome = await consumeDialogue(stream, c.handlers);
    expect(outcome.completed).toBe(false);
  });

  it("skips a malformed frame instead of discarding the reply", async () => {
    const c = collector();
    const stream = streamOf([
      frame({ type: "turn_start", round: 1, personaId: "plato", nameAr: "أفلاطون", symbol: "△" }),
      "data: {not json\n\n",
      frame({ type: "turn_delta", round: 1, personaId: "plato", delta: "نص" }),
      frame({ type: "done" }),
    ]);

    const outcome = await consumeDialogue(stream, c.handlers);
    expect(c.result().turns[0]?.text).toBe("نص");
    expect(outcome.completed).toBe(true);
  });

  it("reports a terminal error message", async () => {
    const c = collector();
    const stream = streamOf([
      frame({ type: "error", code: "unavailable", message: "تعذّر الوصول." }),
      frame({ type: "done" }),
    ]);

    const outcome = await consumeDialogue(stream, c.handlers);
    expect(outcome.error).toBe("تعذّر الوصول.");
    expect(c.result().error).toBe("تعذّر الوصول.");
  });

  it("handles a null body as a disconnection rather than throwing", async () => {
    const c = collector();
    const outcome = await consumeDialogue(null, c.handlers);
    expect(outcome.completed).toBe(false);
    expect(outcome.error).toBeTruthy();
  });

  it("stops on abort without reporting it as a failure", async () => {
    // A cancelled request is the user's own doing, not an error to shout about.
    const c = collector();
    const controller = new AbortController();
    controller.abort();

    const stream = streamOf([frame({ type: "done" })]);
    const outcome = await consumeDialogue(stream, c.handlers, controller.signal);
    expect(outcome.error).toBeUndefined();
  });
});
