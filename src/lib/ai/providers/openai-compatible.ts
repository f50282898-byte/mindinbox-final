import { iterateSseData, safeJson } from "@/lib/ai/sse";
import type { ProviderAdapter, ProviderCall, ProviderStream, Usage } from "@/lib/ai/types";

/**
 * OpenAI-compatible chat completions, streaming.
 *
 * Shared by Groq, NVIDIA and Bytez — all three expose
 * `POST {base}/chat/completions` with `stream: true` and the same
 * `choices[0].delta.content` shape. One adapter, three configurations.
 *
 * Handles two quirks seen in the wild:
 *  - some reasoning models emit `delta.reasoning_content` before any `content`;
 *  - some send an empty keep-alive `data:` frame.
 *
 * An adapter deliberately contains no model id: it receives one per call.
 */

export interface OpenAiCompatibleOptions {
  id: string;
  label: string;
  defaultBaseUrl: string;
  /** Reads the API key. Returns null when unset, i.e. not configured. */
  apiKey: () => string | null;
  /** Overrides the base URL, e.g. for Bytez which has no stable host. */
  baseUrl?: () => string | undefined;
}

interface OpenAiStreamChunk {
  choices?: Array<{
    delta?: { content?: string | null; reasoning_content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export function createOpenAiCompatibleAdapter(opts: OpenAiCompatibleOptions): ProviderAdapter {
  return {
    id: opts.id,
    label: opts.label,
    configured: () => Boolean(opts.apiKey()),

    async stream(call: ProviderCall): Promise<ProviderStream> {
      const key = opts.apiKey();
      if (!key) throw new Error(`${opts.id} is not configured`);

      const base = (opts.baseUrl?.() ?? opts.defaultBaseUrl).replace(/\/+$/, "");

      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
          accept: "text/event-stream",
        },
        body: JSON.stringify({
          model: call.model,
          messages: call.messages,
          max_tokens: call.maxOutputTokens,
          temperature: call.temperature,
          stream: true,
          // Ask for usage in the final frame; some providers ignore it, which is
          // why `usage()` is allowed to resolve null.
          stream_options: { include_usage: true },
        }),
        signal: call.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`${opts.id} responded ${res.status}`);
      }

      let captured: Usage | null = null;

      const chunks = (async function* () {
        for await (const payload of iterateSseData(res.body!)) {
          const data = safeJson<OpenAiStreamChunk>(payload);
          if (!data) continue;

          if (data.usage) {
            captured = {
              promptTokens: data.usage.prompt_tokens ?? null,
              completionTokens: data.usage.completion_tokens ?? null,
            };
          }

          const delta = data.choices?.[0]?.delta;
          const text = delta?.content ?? delta?.reasoning_content ?? "";
          if (text) yield text;
        }
      })();

      return {
        chunks,
        usage: async () => captured,
      };
    },
  };
}
