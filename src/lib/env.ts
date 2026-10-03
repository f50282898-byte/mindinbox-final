/**
 * Environment validation with zod.
 * Throws on startup with a clear message if any required variable is missing or invalid.
 */

import { z } from "zod";

const envSchema = z.object({
  // Firebase (public, safe to expose to browser)
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: z.string().optional(),

  // AI providers (SECRETS — server/edge only)
  GEMINI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  NVIDIA_API_KEY: z.string().optional(),
  BYTEZ_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
  GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),
  NVIDIA_MODEL: z.string().default("nvidia/nemotron-3.5-lightning-30b-a3b"),
  BYTEZ_MODEL: z.string().default("llama3.1-70b"),
  BYTEZ_BASE_URL: z.string().url().default("https://api.gpt.ge/v1"),

  // Anonymous usage signing (SECRET)
  ANON_SESSION_SECRET: z.string().min(32),

  // Cloudflare Turnstile. The SECRET key is server-only: never NEXT_PUBLIC_.
  TURNSTILE_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),

  // Admin (SECRET)
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  ADMIN_UID: z.string().optional(),

  /** Canonical origin, used for canonical URLs and the sitemap. */
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
});

/** Parsed and validated environment. */
export type Env = z.infer<typeof envSchema>;

/** Validates `process.env` once at startup. Throws with a clear message on failure. */
export function getEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    // Zod v4 uses `issues`, v3 uses `errors` - handle both
    const issues = (result.error as any).issues ?? (result.error as any).errors ?? [];
    const missing = issues
      .filter((e: any) => e.code === "invalid_type" && e.received === "undefined")
      .map((e: any) => e.path.join("."));
    const invalid = issues
      .filter((e: any) => e.code !== "invalid_type" || e.received !== "undefined")
      .map((e: any) => `${e.path.join(".")}: ${e.message}`);
    const parts: string[] = [];
    if (missing.length) parts.push(`Missing required env vars: ${missing.join(", ")}`);
    if (invalid.length) parts.push(`Invalid env vars: ${invalid.join("; ")}`);
    throw new Error(`Environment validation failed:\n${parts.join("\n")}`);
  }
  return result.data;
}

/** Lazily-initialized singleton. */
let cachedEnv: Env | null = null;

export function env(): Env {
  if (!cachedEnv) {
    cachedEnv = getEnv();
  }
  return cachedEnv;
}

/** Helper for edge routes that need the raw env object. */
export const envLike = {
  get GEMINI_API_KEY() { return env().GEMINI_API_KEY; },
  get GROQ_API_KEY() { return env().GROQ_API_KEY; },
  get NVIDIA_API_KEY() { return env().NVIDIA_API_KEY; },
  get BYTEZ_API_KEY() { return env().BYTEZ_API_KEY; },
  get GEMINI_MODEL() { return env().GEMINI_MODEL; },
  get GROQ_MODEL() { return env().GROQ_MODEL; },
  get NVIDIA_MODEL() { return env().NVIDIA_MODEL; },
  get BYTEZ_MODEL() { return env().BYTEZ_MODEL; },
  get BYTEZ_BASE_URL() { return env().BYTEZ_BASE_URL; },
};