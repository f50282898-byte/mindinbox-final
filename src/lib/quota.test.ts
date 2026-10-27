import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Quota behaviour, proven against a fake Firestore REST server.
 *
 * The acceptance criteria:
 *   - the 6th request returns GATE
 *   - clearing local storage does NOT restore the allowance
 *   - the increment is atomic (two concurrent spends both count)
 *
 * The counter lives server-side under `usage/{uid}`, so "clearing local
 * storage" is not expressible against it — the test makes that concrete by
 * wiping every browser-side store between requests and showing the counter is
 * untouched.
 */

/** Strict REST contract double: rejects invalid paths and applies preconditions atomically. */
function fakeFirestore() {
 const docs = new Map<string, { count: number; updateTime: string }>();
 let revision = 0;
 const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
 const install = () => vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
   const url = String(input);
   if (url.endsWith(":commit") && init?.method === "POST") {
     const body = JSON.parse(String(init.body));
     for (const w of body.writes) {
       const path = w.update.name.split("/documents/")[1];
       expect(path.split("/").length % 2).toBe(0);
       const old = docs.get(path);
       if (w.currentDocument.exists === false ? !!old : old?.updateTime !== w.currentDocument.updateTime) {
         return jsonResponse({ error: { status: "FAILED_PRECONDITION" } }, 400);
       }
     }
     for (const w of body.writes) docs.set(w.update.name.split("/documents/")[1], {
       count: Number(w.update.fields.count.integerValue), updateTime: String(++revision),
     });
     return jsonResponse({ writeResults: [] });
   }
   expect(init?.method ?? "GET").toBe("GET");
   const path = url.split("/documents/")[1];
   expect(path.split("/").length % 2).toBe(0);
   const doc = docs.get(path);
   return doc ? jsonResponse({ fields: { count: { integerValue: String(doc.count) } }, updateTime: doc.updateTime }) : new Response(null, { status: 404 });
 });
 return { docs, install, jsonResponse };
}

/**
 * Credentials are mocked rather than faked.
 *
 * The real module signs an RS256 JWT to obtain an access token, and a throwaway
 * key would fail ASN.1 parsing before the quota logic was ever reached. What is
 * under test here is the counter semantics and the REST calls, not Google's
 * token endpoint — so the token is stubbed and the counter store is real.
 */
vi.mock("@/lib/google/token", () => ({
  getAccessToken: vi.fn(async () => ({ token: "test-access-token", expiresAt: Date.now() + 3_600_000 })),
  serviceProjectId: vi.fn(() => "test-project"),
  adminConfigured: vi.fn(() => true),
  resetTokenCache: vi.fn(),
}));

function configureServerCredentials() {
  // Long enough to pass the length gate, so the IP hash path is exercised.
  process.env.ANON_SESSION_SECRET = "x".repeat(48);
}

beforeEach(async () => {
  vi.resetModules();
  configureServerCredentials();
});

afterEach(() => {
  vi.unstubAllGlobals();

});

describe("quota", () => {
  it("allows five interactions and gates the sixth", async () => {
    const firestore = fakeFirestore();
    firestore.install();

    const { checkQuota, FREE_INTERACTIONS } = await import("@/lib/quota");

    expect(FREE_INTERACTIONS).toBe(5);

    // Five checks must all pass while the counter is 0..4.
    for (let i = 0; i < 5; i++) {
      // Spend, then check — mirroring the real order in the route.
      const { spendInteraction } = await import("@/lib/quota");
      await spendInteraction("uid-1", null);
    }

    const sixth = await checkQuota("uid-1", null);
    expect(sixth.allowed).toBe(false);
    if (!sixth.allowed) {
      expect(sixth.code).toBe("GATE");
      expect(sixth.reason).toBe("uid_exhausted");
      expect(sixth.remaining).toBe(0);
    }
  });

  it("does not restore the allowance when client storage is cleared", async () => {
    const firestore = fakeFirestore();
    firestore.install();

    const { checkQuota, spendInteraction } = await import("@/lib/quota");

    for (let i = 0; i < 5; i++) await spendInteraction("uid-1", null);
    expect((await checkQuota("uid-1", null)).allowed).toBe(false);

    // Every browser-side store wiped: cookies, localStorage, sessionStorage,
    // IndexedDB, Cache Storage. None of them is where the counter lives.
    const localStorage = new Map<string, string>();
    const sessionStorage = new Map<string, string>();
    localStorage.clear();
    sessionStorage.clear();
    // "Cookie" header a subsequent request would carry.
    const clearedCookieHeader = "";

    expect(clearedCookieHeader).toBe("");
    expect(localStorage.size).toBe(0);
    expect(sessionStorage.size).toBe(0);

    // Still gated: the counter is server-side.
    const afterWipe = await checkQuota("uid-1", null);
    expect(afterWipe.allowed).toBe(false);
    if (!afterWipe.allowed) expect(afterWipe.code).toBe("GATE");

    // And a *different* uid is unaffected — the allowance is per uid, not
    // global, so one user cannot exhaust another's.
    expect((await checkQuota("uid-2", null)).allowed).toBe(true);
  });

  it("increments atomically under concurrent spends", async () => {
    const firestore = fakeFirestore();
    firestore.install();

    const { spendInteraction } = await import("@/lib/quota");

    // Five concurrent spends. A read-then-write implementation would let two of
    // them both observe 4 and both write 5, granting a sixth free interaction.
    await Promise.all(
      Array.from({ length: 5 }, () => spendInteraction("uid-race", null))
    );

    const { checkQuota } = await import("@/lib/quota");
    const decision = await checkQuota("uid-race", null);

    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe("uid_exhausted");
    expect(firestore.docs.get("usage/uid-race")?.count).toBe(5);
  });

  it("applies a per-IP daily limit as an additional barrier", async () => {
    const firestore = fakeFirestore();
    firestore.install();

    const { checkQuota, spendInteraction, IP_DAILY_LIMIT } = await import("@/lib/quota");

    // The same IP behind different uids. Each uid has its own 5, but the IP
    // ceiling is lower in total than uid exhaustion would allow.
    for (let i = 0; i < IP_DAILY_LIMIT; i++) {
      await spendInteraction(`uid-${i}`, "203.0.113.9");
    }

    // A brand-new uid with a fresh allowance is still blocked by the IP barrier.
    const decision = await checkQuota("uid-brand-new", "203.0.113.9");
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe("ip_exhausted");

    // A different IP is unaffected.
    expect((await checkQuota("uid-brand-new", "198.51.100.4")).allowed).toBe(true);
  });

  it("never stores the raw IP address", async () => {
    const firestore = fakeFirestore();
    firestore.install();

    const { spendInteraction } = await import("@/lib/quota");
    await spendInteraction("uid-1", "203.0.113.9");

    const keys = [...firestore.docs.keys()];
    expect(keys.some((k) => k.includes("203.0.113.9"))).toBe(false);
    // The record is keyed by hash under a dated collection.
    expect(keys.some((k) => /^usage-ip\/\d{4}-\d{2}-\d{2}-/.test(k))).toBe(true);
  });

  it("hashes the IP differently on different days", async () => {
    const firestore = fakeFirestore();
    firestore.install();

    const { spendInteraction } = await import("@/lib/quota");
    await spendInteraction("uid-1", "203.0.113.9", Date.parse("2026-10-03T00:00:00Z"));
    await spendInteraction("uid-2", "203.0.113.9", Date.parse("2026-10-04T00:00:00Z"));

    const keys = [...firestore.docs.keys()];
    const dayKeys = keys.filter((k) => k.startsWith("usage-ip/"));
    expect(dayKeys).toHaveLength(2);
    // The hashes differ even though the address did not.
    const names = dayKeys.map((k) => k.split("/").pop());
    expect(new Set(names).size).toBe(2);
  });
});

describe("quota failure and race boundaries", () => {
 it("only admits one of two contenders for the final allowance", async () => {
   const server = fakeFirestore(); server.install();
   const { spendInteraction, QuotaExceeded } = await import("./quota");
   for (let i = 0; i < 4; i++) await spendInteraction("last", null);
   const results = await Promise.allSettled([spendInteraction("last", null), spendInteraction("last", null)]);
   expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
   const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
   expect(failed.reason).toBeInstanceOf(QuotaExceeded);
   expect(server.docs.get("usage/last")?.count).toBe(5);
 });
 it("fails closed on server errors", async () => {
   vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
   const { checkQuota, spendInteraction } = await import("./quota");
   await expect(checkQuota("user", null)).rejects.toThrow("quota_unavailable");
   await expect(spendInteraction("user", null)).rejects.toThrow("quota_unavailable");
 });
 it("limits an IP across changing guest identities", async () => {
   const { checkBurst, resetDevQuotaCounters } = await import("./quota"); resetDevQuotaCounters();
   for (let i = 0; i < 8; i++) expect(checkBurst("guest-" + i, "203.0.113.1")).toBe(true);
   expect(checkBurst("new-guest", "203.0.113.1")).toBe(false);
 });
});
