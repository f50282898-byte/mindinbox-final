import { createAnthropicAdapter } from "@/lib/ai/providers/anthropic";
import { createGeminiAdapter } from "@/lib/ai/providers/gemini";
import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";
import type { ProviderAdapter } from "@/lib/ai/types";
import type { AiSettings } from "@/lib/ai/settings";

/**
 * Provider registry.
 *
 * Adapters read their API key from the environment at call time, never at
 * module load, so a key rotated in the dashboard takes effect without a
 * redeploy of the module graph.
 *
 * The registry is built once and memoised; `overrideAdapters` exists so the
 * failover tests can substitute fakes without a network or an API key.
 */

function key(name: string): () => string | null {
  return () => {
    const v = process.env[name];
    return v && v.trim() ? v.trim() : null;
  };
}

/**
 * Base URL override.
 *
 * Read at call time so a change takes effect without a redeploy. https-only, so
 * a stray value cannot point production at a plaintext endpoint.
 *
 * These exist for two reasons: a self-hosted or proxied provider, and the e2e
 * suite, which needs a deterministic upstream. Playwright cannot intercept a
 * server-side fetch from the edge route, so the only way to make the gateway
 * testable is to let it talk somewhere else.
 */
function baseUrl(envName: string): () => string | undefined {
  return () => {
    const v = process.env[envName];
    return v && /^https?:\/\//i.test(v.trim()) ? v.trim() : undefined;
  };
}

let registry: Map<string, ProviderAdapter> | null = null;

export function getAdapters(): Map<string, ProviderAdapter> {
  if (registry) return registry;

  const map = new Map<string, ProviderAdapter>();

  map.set(
    "anthropic",
    createAnthropicAdapter(key("ANTHROPIC_API_KEY"), baseUrl("AI_BASE_URL_ANTHROPIC"))
  );

  map.set(
    "gemini",
    createGeminiAdapter(key("GEMINI_API_KEY"), baseUrl("AI_BASE_URL_GEMINI"))
  );

  map.set(
    "groq",
    createOpenAiCompatibleAdapter({
      id: "groq",
      label: "Groq",
      defaultBaseUrl: "https://api.groq.com/openai/v1",
      apiKey: key("GROQ_API_KEY"),
      baseUrl: baseUrl("AI_BASE_URL_GROQ"),
    })
  );

  map.set(
    "nvidia",
    createOpenAiCompatibleAdapter({
      id: "nvidia",
      label: "NVIDIA",
      defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
      apiKey: key("NVIDIA_API_KEY"),
      baseUrl: baseUrl("AI_BASE_URL_NVIDIA"),
    })
  );

  // Bytez has no stable public host, so its base URL must be configured. With no
  // key or no host it is simply never selected, because `configured()` is false
  // or its model id is absent from the chain.
  map.set(
    "bytez",
    createOpenAiCompatibleAdapter({
      id: "bytez",
      label: "Bytez",
      defaultBaseUrl: "https://api.gpt.ge/v1",
      apiKey: key("BYTEZ_API_KEY"),
      baseUrl: () => process.env.BYTEZ_BASE_URL?.trim() || undefined,
    })
  );

  registry = map;
  return map;
}

/** Test seam: installs fake adapters. Pass `null` to restore the real ones. */
export function overrideAdapters(adapters: ProviderAdapter[] | null): void {
  if (!adapters) {
    registry = null;
    return;
  }
  registry = new Map(adapters.map((a) => [a.id, a]));
}

/** Ids that are configured and would be tried for `role`, in chain order. */
export function usableChain(settings: AiSettings, role: keyof AiSettings["chains"]): string[] {
  const adapters = getAdapters();
  return settings.chains[role].filter((id) => {
    const adapter = adapters.get(id);
    const model = settings.providers[id]?.models[role];
    return Boolean(adapter?.configured() && model);
  });
}
