import type { AiRole } from "@/lib/ai/types";

/**
 * AI settings — the single place model ids and failover order live.
 *
 * This is CONFIGURATION, not logic. Provider adapters never contain a model id;
 * they receive one from here. That is deliberate: provider catalogues churn
 * (a retired id 404s the whole provider), and a catalogue change should not
 * require editing and shipping adapter code.
 *
 * Precedence: `env` > `siteConfig.ai` > the shipped defaults below.
 *
 * ── Model ids verified against official documentation on 2026-10-03 ──────────
 *
 *  provider   model                        role(s)      source
 *  ---------  ---------------------------  -----------  ---------------------------
 *  anthropic  claude-sonnet-5-5            chat         platform.claude.com/docs
 *  anthropic  claude-opus-5-5              analysis     platform.claude.com/docs
 *  anthropic  claude-haiku-4-5              admin        platform.claude.com/docs
 *  gemini     gemini-3.8-flash              chat/anal.   ai.google.dev/gemini-api/docs
 *  gemini     gemini-3.5-flash-lite         admin        ai.google.dev/gemini-api/docs
 *  groq       openai/gpt-oss-120b           chat/anal.   console.groq.com/docs/models
 *  groq       openai/gpt-oss-20b            admin        console.groq.com/docs/models
 *  nvidia     nvidia/nemotron-3.5-lightning-30b-a3b  analysis  build.nvidia.com/models
 *  nvidia     nvidia/nemotron-3-super-120b-a12b      chat      build.nvidia.com/models
 *  bytez      (unset — provider unreachable)  —         see ORPHANS
 *
 * Groq's `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` were rejected:
 * both are Enterprise-only on the developer plan.
 *
 * Bytez ships an adapter but is NOT in any default chain: `api.gpt.ge` returned
 * 401 and `api.bytez.com` returned 404 when checked on 2026-09. Supply a key and
 * a working host via `BYTEZ_BASE_URL`, then add it to `AI_CHAIN_CHAT` etc.
 */

export interface ProviderSettings {
  /** Model id per role. A role with no model is skipped for that role. */
  models: Partial<Record<AiRole, string>>;
  /** Overrides the adapter's default base URL. */
  baseUrl?: string;
}

export interface AiSettings {
  /** Per-provider configuration, keyed by adapter id. */
  providers: Record<string, ProviderSettings>;
  /**
   * Failover order per role. The first entry that is configured *and* whose
   * circuit breaker is closed wins. An id not present here is never used.
   */
  chains: Record<AiRole, string[]>;
  /** Hard ceiling on generated characters. */
  maxOutputChars: number;
  /** Time budget for the first token, per provider attempt. */
  firstTokenTimeoutMs: number;
  /** Wall-clock budget for the whole chain. */
  totalTimeoutMs: number;
  /** Retries per provider, *before* the first byte reaches the client. */
  attemptsPerProvider: number;
  /** Failures before a provider's breaker opens. */
  breakerThreshold: number;
  /** How long a breaker stays open. */
  breakerCooldownMs: number;
}

/**
 * Shipped defaults. Every value here is overridable by environment or by
 * `siteConfig.ai`, so this file is a starting point rather than a decision.
 */
export const DEFAULT_AI_SETTINGS: AiSettings = {
  providers: {
    anthropic: {
      models: { chat: "claude-sonnet-5-5", analysis: "claude-opus-5-5", admin: "claude-haiku-4-5" },
    },
    gemini: {
      models: { chat: "gemini-3.8-flash", analysis: "gemini-3.8-flash", admin: "gemini-3.5-flash-lite" },
    },
    groq: {
      models: { chat: "openai/gpt-oss-120b", analysis: "openai/gpt-oss-120b", admin: "openai/gpt-oss-20b" },
    },
    nvidia: {
      models: {
        chat: "nvidia/nemotron-3-super-120b-a12b",
        analysis: "nvidia/nemotron-3.5-lightning-30b-a3b",
        admin: "nvidia/nemotron-3.5-lightning-30b-a3b",
      },
    },
    // Bytez: adapter exists, key and host come from configuration.
    bytez: { models: {} },
  },

  chains: {
    // Chat is the hot path: fastest credible models first, cheapest last.
    chat: ["anthropic", "gemini", "groq", "nvidia"],
    // Analysis reads longer, so the strongest models lead.
    analysis: ["anthropic", "nvidia", "gemini", "groq"],
    // Admin work is rare and mechanical: cheap models lead.
    admin: ["gemini", "groq", "anthropic"],
  },

  maxOutputChars: 6000,
  firstTokenTimeoutMs: 12_000,
  totalTimeoutMs: 90_000,
  attemptsPerProvider: 2, // one try + one retry
  breakerThreshold: 3,
  breakerCooldownMs: 60_000,
};

type Env = Record<string, string | undefined>;

function envModel(env: Env, provider: string, role: AiRole): string | undefined {
  const raw = env[`${provider.toUpperCase()}_MODEL_${role.toUpperCase()}`];
  return raw && raw.trim() ? raw.trim() : undefined;
}

/**
 * Resolves settings from defaults + environment.
 *
 * `siteConfig.ai` is layered on top by the caller (`resolveAiSettings`), so the
 * admin-managed document wins over env, which wins over these defaults.
 */
export function resolveAiSettings(env: Env = process.env): AiSettings {
  const providers: Record<string, ProviderSettings> = {};

  for (const [id, base] of Object.entries(DEFAULT_AI_SETTINGS.providers)) {
    const models = { ...base.models };
    for (const role of ["chat", "analysis", "admin"] as const) {
      const override = envModel(env, id, role) ?? env[`${id.toUpperCase()}_MODEL`];
      if (override) models[role] = override;
    }
    providers[id] = { ...base, models };
  }

  // Bytez base URL is configurable because it has no stable public host.
  const bytezUrl = env.BYTEZ_BASE_URL?.trim();
  if (bytezUrl) providers.bytez = { ...providers.bytez, baseUrl: bytezUrl };

  const chains: Record<AiRole, string[]> = { ...DEFAULT_AI_SETTINGS.chains };
  for (const role of ["chat", "analysis", "admin"] as const) {
    const raw = env[`AI_CHAIN_${role.toUpperCase()}`];
    const parsed = raw
      ?.split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    chains[role] = parsed && parsed.length ? parsed : DEFAULT_AI_SETTINGS.chains[role];
  }

  const num = (raw: string | undefined, fallback: number): number => {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  return {
    providers,
    chains,
    maxOutputChars: num(env.AI_MAX_OUTPUT_CHARS, DEFAULT_AI_SETTINGS.maxOutputChars),
    firstTokenTimeoutMs: num(
      env.AI_FIRST_TOKEN_TIMEOUT_MS,
      DEFAULT_AI_SETTINGS.firstTokenTimeoutMs
    ),
    totalTimeoutMs: num(env.AI_TOTAL_TIMEOUT_MS, DEFAULT_AI_SETTINGS.totalTimeoutMs),
    attemptsPerProvider: num(env.AI_ATTEMPTS_PER_PROVIDER, DEFAULT_AI_SETTINGS.attemptsPerProvider),
    breakerThreshold: num(env.AI_BREAKER_THRESHOLD, DEFAULT_AI_SETTINGS.breakerThreshold),
    breakerCooldownMs: num(env.AI_BREAKER_COOLDOWN_MS, DEFAULT_AI_SETTINGS.breakerCooldownMs),
  };
}

/** Layers an admin-authored `siteConfig.ai` document over the resolved settings. */
export function applyRemoteAiSettings(
  resolved: AiSettings,
  remote: unknown
): AiSettings {
  if (!remote || typeof remote !== "object") return resolved;
  const r = remote as Record<string, unknown>;

  const providers = { ...resolved.providers };
  const remoteProviders = r.providers;
  if (remoteProviders && typeof remoteProviders === "object") {
    for (const [id, value] of Object.entries(remoteProviders as Record<string, unknown>)) {
      if (!providers[id] || !value || typeof value !== "object") continue;
      const p = value as { models?: unknown; baseUrl?: unknown };
      const models = { ...providers[id].models };
      if (p.models && typeof p.models === "object") {
        for (const [role, model] of Object.entries(p.models as Record<string, unknown>)) {
          if ((role === "chat" || role === "analysis" || role === "admin") && typeof model === "string") {
            models[role] = model;
          }
        }
      }
      const baseUrl =
        typeof p.baseUrl === "string" && p.baseUrl.startsWith("https://") ? p.baseUrl : providers[id].baseUrl;
      providers[id] = { models, baseUrl };
    }
  }

  const chains = { ...resolved.chains };
  const remoteChains = r.chains;
  if (remoteChains && typeof remoteChains === "object") {
    for (const [role, list] of Object.entries(remoteChains as Record<string, unknown>)) {
      if (role !== "chat" && role !== "analysis" && role !== "admin") continue;
      if (!Array.isArray(list)) continue;
      const cleaned = list
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().toLowerCase())
        .filter((x) => x in providers);
      if (cleaned.length) chains[role] = cleaned;
    }
  }

  return {
    ...resolved,
    providers,
    chains,
    maxOutputChars:
      typeof r.maxOutputChars === "number" && r.maxOutputChars > 0
        ? Math.min(r.maxOutputChars, 20_000)
        : resolved.maxOutputChars,
    firstTokenTimeoutMs:
      typeof r.firstTokenTimeoutMs === "number" && r.firstTokenTimeoutMs > 0
        ? Math.min(r.firstTokenTimeoutMs, 60_000)
        : resolved.firstTokenTimeoutMs,
  };
}
