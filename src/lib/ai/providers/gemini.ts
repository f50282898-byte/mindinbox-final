import { iterateSseData, safeJson } from "@/lib/ai/sse";
import type { ProviderAdapter, ProviderCall, ProviderStream, Usage } from "@/lib/ai/types";

/**
 * Google Gemini `streamGenerateContent`, streaming.
 *
 * Differences from the OpenAI shape:
 *  - endpoint is `…/models/{model}:streamGenerateContent?alt=sse&key=…`
 *  - the API key is a query parameter, not a header (an `x-goog-api-key`
 *    header is also accepted and preferred, since a query string ends up in
 *    access logs)
 *  - roles are `user` and `model`, never `assistant`
 *  - the system prompt is `systemInstruction`
 *  - usage lands on the final candidate, not on every chunk
 *
 * No model id here — the adapter takes one per call.
 */

const DEFAULT_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Base URL override, for a self-hosted proxy or a test endpoint.
 * https-only, so production cannot be pointed at a plain-http address.
 */
function resolveBase(override: string | undefined): string {
  const value = override?.trim();
  return value && /^https:\/\//i.test(value) ? value.replace(/\/+$/, "") : DEFAULT_API_BASE;
}

interface GeminiChunk {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

export function createGeminiAdapter(
  apiKey: () => string | null,
  baseUrl?: () => string | undefined
): ProviderAdapter {
  return {
    id: "gemini",
    label: "Gemini",
    configured: () => Boolean(apiKey()),

    async stream(call: ProviderCall): Promise<ProviderStream> {
      const key = apiKey();
      if (!key) throw new Error("gemini is not configured");

      const systemInstruction = call.messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n\n");

      const contents = call.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

      // `alt=sse` is what makes Gemini emit SSE rather than a JSON array.
      const url = `${resolveBase(baseUrl?.())}/${encodeURIComponent(
        call.model
      )}:streamGenerateContent?alt=sse`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "x-goog-api-key": key,
          "content-type": "application/json",
          accept: "text/event-stream",
        },
        body: JSON.stringify({
          contents,
          ...(systemInstruction
            ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
            : {}),
          generationConfig: {
            temperature: call.temperature,
            maxOutputTokens: call.maxOutputTokens,
          },
        }),
        signal: call.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`gemini responded ${res.status}`);
      }

      let captured: Usage | null = null;

      const chunks = (async function* () {
        for await (const payload of iterateSseData(res.body!)) {
          const data = safeJson<GeminiChunk>(payload);
          if (!data) continue;

          if (data.usageMetadata) {
            captured = {
              promptTokens: data.usageMetadata.promptTokenCount ?? null,
              completionTokens: data.usageMetadata.candidatesTokenCount ?? null,
            };
          }

          const parts = data.candidates?.[0]?.content?.parts ?? [];
          for (const part of parts) {
            const text = part.text ?? "";
            if (text) yield text;
          }
        }
      })();

      return { chunks, usage: async () => captured };
    },
  };
}
