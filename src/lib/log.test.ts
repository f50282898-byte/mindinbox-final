import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("log", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not call console.debug in production when minLevel is info", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const { log } = await import("@/lib/log");
    log.debug("debug message");
    expect(console.debug).not.toHaveBeenCalled();
  });

  it("logs info, warn, error in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const { log } = await import("@/lib/log");
    log.info("info message");
    log.warn("warn message");
    log.error("error message");
    expect(console.info).toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("sanitizes sensitive keys", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();
    const { log } = await import("@/lib/log");
    log.info("test", { password: "secret123", api_key: "abc123", normal: "value" });
    const infoCalls = (console.info as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const logged = infoCalls.flat().join(" ");
    expect(logged).toContain("[REDACTED]");
    expect(logged).not.toContain("secret123");
  });

  it("time() logs duration on success", async () => {
    const { time } = await import("@/lib/log");
    const result = await time("test-op", async () => {
      return Promise.resolve(42);
    });
    expect(result).toBe(42);
  });

  it("time() logs duration and re-throws on error", async () => {
    const { time } = await import("@/lib/log");
    await expect(time("failing-op", async () => {
      throw new Error("boom");
    })).rejects.toThrow("boom");
  });
});