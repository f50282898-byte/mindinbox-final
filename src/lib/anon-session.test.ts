import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  readSession,
  spendAttempt,
  remainingAttempts,
  FREE_ATTEMPT_LIMIT,
  SESSION_WINDOW_MS,
  ANON_COOKIE_NAME,
} from "@/lib/anon-session";

const TEST_SECRET = "a".repeat(32);

describe("anon-session", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeRequest(cookieValue?: string): Request {
    const headers: Record<string, string> = {};
    if (cookieValue) {
      headers.cookie = ANON_COOKIE_NAME + "=" + cookieValue;
    }
    return new Request("https://example.com/api/ai", { headers });
  }

  it("returns fresh session when no cookie present", async () => {
    const session = await readSession(new Request("https://example.com/api/ai"), TEST_SECRET);
    expect(session.used).toBe(0);
    expect(session.expiresAt).toBeGreaterThan(Date.now());
  });

  it("returns fresh session when cookie is malformed", async () => {
    const session = await readSession(new Request("https://example.com/api/ai", { headers: { cookie: "miab_anon=not-a-cookie" } }), TEST_SECRET);
    expect(session.used).toBe(0);
  });

  it("returns fresh session when signature is invalid", async () => {
    const session = await readSession(new Request("https://example.com/api/ai", { headers: { cookie: "miab_anon=payload.badsignature" } }), TEST_SECRET);
    expect(session.used).toBe(0);
  });

  it("parses valid cookie and returns remaining attempts", async () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const result = await spendAttempt(
      { used: 1, expiresAt: now + SESSION_WINDOW_MS },
      TEST_SECRET
    );
    const cookie = result.cookie ?? "";
    const req = new Request("https://example.com/api/ai", { headers: { cookie: "miab_anon=" + cookie } });
    const session = await readSession(req, TEST_SECRET);
    expect(session.used).toBe(2);
    expect(remainingAttempts(session)).toBe(FREE_ATTEMPT_LIMIT - 2);
  });

  it("expired cookie returns fresh session", async () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const payload = btoa(JSON.stringify({ used: 1, expiresAt: now - 1000 }));
    const signature = "testsig";
    const expiredCookie = payload + "." + signature;
    
    const session = await readSession(
      new Request("https://example.com/api/ai", { headers: { cookie: ANON_COOKIE_NAME + "=" + expiredCookie } }),
      TEST_SECRET
    );
    expect(session.used).toBe(0);
  });

  it("parses valid cookie and returns remaining attempts", async () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const result = await spendAttempt(
      { used: 1, expiresAt: now + SESSION_WINDOW_MS },
      TEST_SECRET
    );
    const cookie = result.cookie ?? "";
    const req = new Request("https://example.com/api/ai", { headers: { cookie: "miab_anon=" + cookie } });
    const session = await readSession(req, TEST_SECRET);
    expect(session.used).toBe(2);
    expect(remainingAttempts(session)).toBe(FREE_ATTEMPT_LIMIT - 2);
  });

  it("spendAttempt increments used and returns payload.signature cookie value", async () => {
    const session = { used: 0, expiresAt: Date.now() + SESSION_WINDOW_MS };
    const result = await spendAttempt(session, TEST_SECRET);
    const cookie = result.cookie ?? "";
    expect(result.session.used).toBe(1);
    expect(cookie).toContain(".");
    expect(cookie.split(".").length).toBe(2);
  });

  it("remainingAttempts returns 0 when limit exceeded", () => {
    const session = { used: FREE_ATTEMPT_LIMIT, expiresAt: Date.now() + SESSION_WINDOW_MS };
    expect(remainingAttempts(session)).toBe(0);
  });

  it("tampered cookie (same payload, wrong signature) is rejected", async () => {
    const result = await spendAttempt(
      { used: 5, expiresAt: Date.now() + SESSION_WINDOW_MS },
      TEST_SECRET
    );
    const valid = result.cookie ?? "";
    const [payload, sig] = valid.split(".");
    const tampered = payload + "." + sig.slice(0, -4) + "xxxx";
    const session = await readSession(
      new Request("https://example.com", { headers: { cookie: ANON_COOKIE_NAME + "=" + tampered } }),
      TEST_SECRET
    );
    expect(session.used).toBe(0);
  });

  it("spliced cookie (fresh payload + exhausted signature) is rejected (HMAC mismatch)", async () => {
    const freshResult = await spendAttempt({ used: 0, expiresAt: Date.now() + SESSION_WINDOW_MS }, TEST_SECRET);
    const exhaustedResult = await spendAttempt({ used: 5, expiresAt: Date.now() + SESSION_WINDOW_MS }, TEST_SECRET);
    const fresh = freshResult.cookie ?? "";
    const exhausted = exhaustedResult.cookie ?? "";

    const freshPayload = fresh.split(".")[0];
    const exhaustedSig = exhausted.split(".")[1];
    const spliced = freshPayload + "." + exhaustedSig;

    const session = await readSession(
      new Request("https://example.com", { headers: { cookie: ANON_COOKIE_NAME + "=" + spliced } }),
      TEST_SECRET
    );
    expect(session.used).toBe(0);
  });
});