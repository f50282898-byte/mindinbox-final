/**
 * Server-Sent Events framing.
 *
 * One wire format for every provider, so the client has a single parser and the
 * route has a single place that decides what the browser sees.
 *
 * Wire shape (one JSON object per `data:` line):
 *   data: {"type":"delta","delta":"…"}
 *   data: {"type":"done","usage":{…}}
 *   data: {"type":"error","code":"…","message":"…"}
 *
 * Deliberately JSON rather than Anthropic's raw event protocol: a uniform
 * shape is what makes failover invisible to the browser, and it survives a
 * mid-stream error where a provider-native stream would have to be torn down.
 */

import type { StreamEvent } from "@/lib/ai/types";

const encoder = new TextEncoder();

export function frameEvent(event: StreamEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

/** A terminating frame for the case where the Response object is already gone. */
export function frameComment(note = "keepalive"): Uint8Array {
  // Comments are valid SSE and ignored by parsers, so they are a safe heartbeat.
  return encoder.encode(`: ${note}\n\n`);
}

export function frameDone(): Uint8Array {
  return encoder.encode("data: [DONE]\n\n");
}

/**
 * Reads a byte stream as UTF-8 text lines.
 *
 * Uses `TextDecoder` in streaming mode so a multi-byte Arabic character split
 * across two network chunks is not corrupted — decoding per chunk would emit
 * replacement characters mid-word.
 */
export async function* iterateLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // `stream: true` keeps partial multi-byte sequences buffered internally.
      buffer += decoder.decode(value, { stream: true });

      let index = buffer.indexOf("\n");
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);
        if (line) yield line;
        index = buffer.indexOf("\n");
      }
    }

    const tail = buffer + decoder.decode();
    if (tail.trim()) yield tail.replace(/\r$/, "");
  } finally {
    // Releasing lets the runtime cancel the upstream fetch promptly when the
    // client has gone away.
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}

/**
 * Yields the `data:` payloads of an SSE stream.
 *
 * Handles the `data: [DONE]` sentinel used by the OpenAI-compatible providers
 * and tolerates `event:`/`id:`/`retry:` lines, which Anthropic emits.
 */
export async function* iterateSseData(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  for await (const line of iterateLines(body)) {
    if (line.startsWith(":")) continue; // comment / heartbeat
    if (!line.startsWith("data:")) continue; // event:, id:, retry:, or noise
    const payload = line.slice(5).trim();
    if (!payload) continue;
    if (payload === "[DONE]") return;
    yield payload;
  }
}

/** Minimal JSON parse that never throws into the stream. */
export function safeJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
