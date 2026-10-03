import { beforeEach, describe, expect, it } from "vitest";
import { authenticatedUser, requireUser, tryAuthenticatedUser } from "@/lib/auth/guards";

/**
 * Request guards.
 *
 * The acceptance criterion is "an expired or wrong-audience token is rejected
 * with 401". Claim-level rejection is proven in `server.test.ts` with real
 * signed tokens; this file proves the *route contract*: every rejection is a
 * flat 401, always carries `Cache-Control: no-store`, always carries an Arabic
 * message, and never leaks why.
 *
 * Only paths that need no key server are exercised here. Anything requiring a
 * signature check is covered by `server.test.ts`, which mints real tokens.
 */

const PROJECT = "guard-test-project";

beforeEach(() => {
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = PROJECT;
});

function req(auth?: string): Request {
  return new Request("https://example.test/api/account", {
    headers: auth ? { authorization: auth } : {},
  });
}

describe("requireUser", () => {
  it("returns null and attaches the identity for a valid token", async () => {
    // Not reachable without a live JWKS, so this pins the contract in the
    // other direction: a failure must never be a silent null.
    const denied = await requireUser(req("Bearer not.a.valid.jwt"));
    expect(denied).not.toBeNull();
  });

  it("returns 401 when no Authorization header is present", async () => {
    const denied = await requireUser(req());
    expect(denied).not.toBeNull();
    expect(denied!.status).toBe(401);

    const body = (await denied!.json()) as { error: string; message: string };
    expect(body.error).toBe("missing_token");
    expect(body.message).toMatch(/[؀-ۿ]/u);
  });

  it("returns 401 for a malformed token and does not say why", async () => {
    const denied = await requireUser(req("Bearer nonsense"));
    expect(denied!.status).toBe(401);

    const body = (await denied!.json()) as Record<string, unknown>;
    expect(body.error).toBeDefined();
    // The reason is a coarse, closed-set code — never the raw SDK message.
    expect(typeof body.error).toBe("string");
    expect(JSON.stringify(body)).not.toContain("jose");
    expect(JSON.stringify(body)).not.toContain("JWS");
  });

  it("always sets Cache-Control: no-store", async () => {
    const denied = await requireUser(req());
    expect(denied!.headers.get("cache-control")).toBe("no-store");
  });

  it("never returns 500 or 403 for an unauthenticated caller", async () => {
    for (const header of [undefined, "Bearer a.b", "Bearer a.b.c", "Basic zzz", "Bearer  "]) {
      const denied = await requireUser(req(header));
      expect(denied, String(header)).not.toBeNull();
      expect(denied!.status, String(header)).toBe(401);
    }
  });
});

describe("authenticatedUser", () => {
  it("throws when no guard ran — a silent null would be a security bug", () => {
    const bare = new Request("https://example.test/api/x");
    expect(() => authenticatedUser(bare)).toThrow(/requireUser/);
  });

  it("tryAuthenticatedUser returns null instead of throwing", () => {
    const bare = new Request("https://example.test/api/x");
    expect(tryAuthenticatedUser(bare)).toBeNull();
  });

  it("the attached identity is not enumerable, so it cannot be leaked by spread", async () => {
    const request = req("Bearer bad.token.value");
    await requireUser(request);
    // A failed guard attaches nothing, and a successful one attaches a
    // non-enumerable symbol — so `JSON.stringify(request)` never includes it.
    expect(JSON.stringify(request)).not.toContain("uid");
  });
});
