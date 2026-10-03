import { iterateSseData, safeJson } from "@/lib/ai/sse";
import type { ProviderAdapter, ProviderCall, ProviderStream, Usage } from "@/lib/ai/types";

/**
 * Anthropic Messages API, streaming.
 *
 * Differences from the OpenAI shape, all handled here so nothing upstream has
 * to know them:
 *  - endpoint is `/v1/messages`, not `/chat/completions`
 *  - auth header is `x-api-key` plus a required `anthropic-version`
 *  - the system prompt is a top-level field, not a message with role `system`
 *  - deltas arrive as typed events; text comes from
 *    `content_block_delta` with `delta.type === "text_delta"`
 *  - a top-level `error` event can arrive mid-stream
 *
 * No model id here — the adapter takes one per call.
 */

const DEFAULT_API_URL = "https://api.anthropic.com/v1/messages";

/** Pinned. Anthropic requires an explicit version and changes behaviour across versions. */
const API_VERSION = "2023-06-01";

interface AnthropicChunk {
  type?: string;
  /** Present on content_block_delta. */
  delta?: { type?: string; text?: string };
  /** Present on error events. */
  error?: { type?: string; message?: string };
  usage?: { input_tokens?: number; output_tokens?: number };
  message?: { usage?: { input_tokens?: number; output_tokens?: number } };
}

/**
 * Base URL override, for a self-hosted or test endpoint.
 *
 * The override must be an https URL, so this cannot be pointed at a plain-http
 * address in production by accident.
 */
export function createAnthropicAdapter(
  apiKey: () => string | null,
  baseUrl?: () => string | undefined
): ProviderAdapter {
  const resolveUrl = () => {
    const override = baseUrl?.()?.trim();
    return override && /^https:\/\//i.test(override)
      ? override
      : DEFAULT_API_URL;
  };

  return {
    id: "anthropic",
    label: "Anthropic",
    configured: () => Boolean(apiKey()),

    async stream(call: ProviderCall): Promise<ProviderStream> {
      const key = apiKey();
      if (!key) throw new Error("anthropic is not configured");

      // Anthropic has no `system` role inside `messages`; it is a top-level field.
      const system = call.messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n\n");
      const messages = call.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch(resolveUrl(), {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": API_VERSION,
          "content-type": "application/json",
          accept: "text/event-stream",
        },
        body: JSON.stringify({
          model: call.model,
          max_tokens: call.maxOutputTokens,
          temperature: call.temperature,
          stream: true,
          ...(system ? { system } : {}),
          messages,
        }),
        signal: call.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`anthropic responded ${res.status}`);
      }

      let captured: Usage | null = null;

      const chunks = (async function* () {
        for await (const payload of iterateSseData(res.body!)) {
          const data = safeJson<AnthropicChunk>(payload);
          if (!data) continue;

          if (data.type === "message_start" && data.message?.usage) {
            captured = {
              promptTokens: data.message.usage.input_tokens ?? null,
              completionTokens: null,
            };
          }

          if (data.type === "message_delta" && data.usage) {
            captured = {
              promptTokens: captured?.promptTokens ?? data.usage.input_tokens ?? null,
              completionTokens: data.usage.output_tokens ?? null,
            };
          }

          // A mid-stream error: surface it as a thrown error so the chain
          // reports a clean failure rather than a truncated success.
          if (data.type === "error" || data.error) {
            throw new Error(data.error?.message ?? "anthropic stream error");
          }

          if (data.type === "content_block_delta" && data.delta?.type === "text_delta") {
            const text = data.delta.text ?? "";
            if (text) yield text;
          }
        }
      })();

      return { chunks, usage: async () => captured };
    },
  };
}
