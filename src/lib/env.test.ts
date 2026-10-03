import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { getEnv, env, envLike, type Env } from "@/lib/env";

const originalEnv = { ...process.env };

describe("env validation", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function setRequired() {
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "test-key";
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = "test.firebaseapp.com";
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "test-project";
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = "test-project.appspot.com";
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = "123456789";
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID = "1:123456789:web:abcdef";
    process.env.ANON_SESSION_SECRET = "a".repeat(32);
  }

  it("throws when required vars are missing", () => {
    process.env = { NODE_ENV: "test", NEXT_PUBLIC_FIREBASE_API_KEY: undefined } as NodeJS.ProcessEnv;
    expect(() => getEnv()).toThrow("Environment validation failed");
    expect(() => getEnv()).toThrow("NEXT_PUBLIC_FIREBASE_API_KEY");
  });

  it("throws when ANON_SESSION_SECRET is too short", () => {
    setRequired();
    process.env.ANON_SESSION_SECRET = "short";
    expect(() => getEnv()).toThrow("ANON_SESSION_SECRET");
  });

  it("parses valid env successfully", () => {
    setRequired();
    const e = getEnv();
    expect(e.NEXT_PUBLIC_FIREBASE_PROJECT_ID).toBe("test-project");
    expect(e.ANON_SESSION_SECRET).toHaveLength(32);
  });

  it("uses default models when not provided", () => {
    setRequired();
    const e = getEnv();
    expect(e.GEMINI_MODEL).toBe("gemini-3.8-flash");
    expect(e.GROQ_MODEL).toBe("openai/gpt-oss-120b");
    expect(e.NVIDIA_MODEL).toBe("nvidia/nemotron-3.5-lightning-30b-a3b");
    expect(e.BYTEZ_MODEL).toBe("llama3.1-70b");
    expect(e.BYTEZ_BASE_URL).toBe("https://api.gpt.ge/v1");
  });

  it("uses custom models when provided", async () => {
    setRequired();
    process.env.GEMINI_MODEL = "custom-model";
    process.env.BYTEZ_BASE_URL = "https://custom.bytez.com/v1";
    vi.resetModules();
    const { getEnv: getEnvFresh } = await import("@/lib/env");
    const e = getEnvFresh();
    expect(e.GEMINI_MODEL).toBe("custom-model");
    expect(e.BYTEZ_BASE_URL).toBe("https://custom.bytez.com/v1");
  });

  it("envLike helper exposes provider config", () => {
    setRequired();
    expect(envLike.GEMINI_API_KEY).toBeUndefined();
    expect(envLike.GEMINI_MODEL).toBe("gemini-3.8-flash");
  });

  it("env() returns cached value on second call", () => {
    setRequired();
    const e1 = env();
    const e2 = env();
    expect(e1).toBe(e2);
  });
});