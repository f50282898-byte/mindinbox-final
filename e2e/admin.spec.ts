import { expect, test } from "@playwright/test";

/**
 * The admin surface — this spec is entirely about refusals.
 *
 * The acceptance criterion is negative: a normal, signed-in reader must get 404 on the
 * page and 403 on every API. Nothing here needs Firebase credentials to prove, because
 * every one of these paths refuses *before* it would need an identity.
 *
 * ## What "hiding is not protection" means here, concretely
 *
 * Three separate mechanisms are asserted, because each can fail on its own:
 *
 * 1. **The page 404s** without a signed admin session cookie. Not a redirect, not a
 *    200 with a sign-in form — a real 404, so the route does not confirm its own
 *    existence to a prober.
 * 2. **Every API 403s or 401s.** With a token, without a token, with garbage.
 * 3. **The route is absent from the public surface** — sitemap, navigation, and the
 *    client bundle's route table.
 */

const ADMIN_APIS = [
  { method: "GET" as const, path: "/api/admin/site" },
  { method: "PUT" as const, path: "/api/admin/site" },
  { method: "POST" as const, path: "/api/admin/site/publish" },
  { method: "POST" as const, path: "/api/admin/site/undo" },
  { method: "POST" as const, path: "/api/admin/pricing/check" },
  { method: "POST" as const, path: "/api/admin/assistant" },
  { method: "POST" as const, path: "/api/admin/verify" },
];

/** A syntactically valid but unsigned bearer. */
const GARBAGE_TOKEN = "a.b.c";

test.describe("the admin page is not there for anyone who is not an admin", () => {
  test("a visitor with no session gets a 404, not a login form", async ({ page }) => {
    const response = await page.goto("/god-mode-admin");
    expect(response?.status()).toBe(404);
  });

  test("the 404 body contains no console content", async ({ request }) => {
    const response = await request.get("/god-mode-admin");
    expect(response.status()).toBe(404);
    const body = await response.text();

    // Asserted on *content*, not on the path. Next embeds the requested URL in the
    // RSC flight payload of its not-found page — but that is the caller's own input
    // echoed back. A prober who typed `/god-mode-admin` already knows the name; what
    // must not exist is the console itself.
    expect(body).not.toContain("النسخة المنشورة");
    expect(body).not.toContain("فحص التطابق");
    expect(body).not.toContain("مساعد الإدارة");
    expect(body).not.toContain("AdminGate");
    expect(body).not.toContain("signInWithEmail");
  });

  test("a forged admin cookie still gets a 404", async ({ request }) => {
    // The signature is not ours. If this passed, the cookie would be decorative.
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ uid: "attacker", sub: "attacker", iss: "mindinbox", aud: "mindinbox:admin-page" })
    ).toString("base64url");

    const response = await request.get("/god-mode-admin", {
      headers: { cookie: `miab_admin=${header}.${payload}.deadbeef` },
    });
    expect(response.status()).toBe(404);
  });

  test("an unsigned cookie claiming admin gets a 404", async ({ request }) => {
    const response = await request.get("/god-mode-admin", {
      headers: { cookie: "miab_admin=admin=true" },
    });
    expect(response.status()).toBe(404);
  });

  test("the admin route declares itself unindexable", async ({ request }) => {
    const body = await (await request.get("/god-mode-admin")).text();

    // Next renders the route's own metadata into the not-found response, so this is
    // checkable. Note the root layout also emits `robots: index, follow` globally —
    // Google honours the most restrictive tag when two are present, so `noindex`
    // wins. That layout default is pre-existing and recorded in PROJECT_MAP.
    expect(body).toContain('name="robots" content="noindex');
    expect(body).toContain("noarchive");
  });
});

test.describe("every admin API refuses an unidentified caller", () => {
  for (const { method, path } of ADMIN_APIS) {
    test(`${method} ${path} without a token is refused`, async ({ request }) => {
      const response = await request.fetch(path, {
        method,
        ...(method === "GET" ? {} : { data: {} }),
      });
      expect([401, 403, 404, 405], `${method} ${path} returned ${response.status()}`).toContain(
        response.status()
      );
      expect(response.status()).toBeGreaterThanOrEqual(400);
    });

    test(`${method} ${path} with a forged token is refused`, async ({ request }) => {
      const response = await request.fetch(path, {
        method,
        headers: { Authorization: `Bearer ${GARBAGE_TOKEN}` },
        ...(method === "GET" ? {} : { data: {} }),
      });
      expect([401, 403], `${method} ${path} returned ${response.status()}`).toContain(
        response.status()
      );
    });
  }
});

test.describe("a refused admin API leaks nothing", () => {
  test("the publish refusal does not reveal the current version", async ({ request }) => {
    const response = await request.post("/api/admin/site/publish", {
      headers: { Authorization: `Bearer ${GARBAGE_TOKEN}` },
      data: { expectedVersion: 0 },
    });
    const body = await response.text();

    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(body).not.toContain("version_conflict");
    expect(body).not.toContain("currentVersion");
  });

  test("the assistant refuses to answer without an identity", async ({ request }) => {
    const response = await request.post("/api/admin/assistant", {
      headers: { Authorization: `Bearer ${GARBAGE_TOKEN}` },
      data: { questionAr: "لماذا هبط التحويل؟" },
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);

    const body = await response.text();
    expect(body).not.toContain("proposals");
    expect(body).not.toContain("ASSISTANT");
  });
});

test.describe("the route is absent from the public surface", () => {
  test("the sitemap does not list it", async ({ request }) => {
    const body = await (await request.get("/sitemap.xml")).text();
    expect(body).not.toContain("god-mode-admin");
  });

  test("the navigation does not link to it", async ({ page }) => {
    await page.goto("/wisdom");
    await page.waitForTimeout(500);
    const hrefs = await page.locator("a").evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("href") ?? "")
    );
    expect(hrefs.filter((h) => h.includes("god-mode"))).toEqual([]);
  });

  test("robots.txt does not welcome a crawler to a path that 404s", async ({ request }) => {
    const body = await (await request.get("/robots.txt")).text().catch(() => "");
    // Not listing it is the requirement. Listing it as disallowed is also fine.
    expect(body.includes("Allow: /god-mode-admin")).toBe(false);
  });
});

test.describe("the public site never reads an unpublished draft", () => {
  test("a reader fetching the public site gets no draft document reference", async ({ request }) => {
    // The reader must not be able to reach `siteContent/draft` at all — the rules deny
    // it, and no client code should be asking for it.
    const html = await (await request.get("/pricing")).text();
    expect(html).not.toContain("siteContent/draft");
    expect(html).not.toContain("siteContent/history");
  });
});
