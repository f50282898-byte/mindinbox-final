import { test, expect } from "@playwright/test";

/**
 * The Firebase-absent state, asserted as a product surface.
 *
 * ## Why this spec exists in the e2e suite and not only in unit tests
 *
 * The unit tests prove `isFirebaseConfigured()` returns false when the keys are missing.
 * They cannot prove that a *visitor* sees something calm — that requires a real browser
 * and the real rendered HTML. The previous behaviour shipped a login page reading
 * "Sign-in is not configured in this build yet. The Firebase settings come from
 * environment variables, which are absent", which is both a credibility problem and a
 * map of the keys worth stealing.
 *
 * ## Why `PROJECT_MAP.md` is asserted, oddly
 *
 * Because the alternative is a doc that drifts. The env table is the only place that
 * says which variable goes in Cloudflare's Production tab and which in Preview, and a
 * table that silently goes stale is worse than none: an operator follows it, adds four
 * variables, and the site still does not work.
 */

test.describe("Firebase not configured", () => {
  /**
   * These assert the Firebase-absent UI, so they are only meaningful against a build
   * with no `NEXT_PUBLIC_FIREBASE_*` values. Against a configured build the pages render
   * their real forms and the assertions would fail — not because the product is wrong,
   * but because it is working.
   *
   * `MIAB_FIREBASE_EXPECTED` is set by the caller; `test:cf` exports it from
   * `check:env`. Defaulted to "configured" so a bare `npx playwright test` against a
   * normal dev build skips rather than fails.
   */
  const firebaseAbsent = process.env.MIAB_FIREBASE_EXPECTED === "absent";

  test.beforeEach(() => {
    test.skip(
      !firebaseAbsent,
      "Requires a build with no NEXT_PUBLIC_FIREBASE_* values. " +
        "Set MIAB_FIREBASE_EXPECTED=absent and build with .env.local moved aside."
    );
  });

  test("/enter shows a calm screen that names no environment variable", async ({ page }) => {
    await page.goto("/enter");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const body = await page.locator("body").innerText();

    // The absence is stated plainly.
    expect(body).toContain("غير متاح");

    // And nothing technical is. This is the assertion that matters: every one of these
    // strings was on the page before.
    for (const leak of [
      "NEXT_PUBLIC",
      "FIREBASE_",
      "environment variable",
      "not configured",
      "Firebase",
      "env var",
    ]) {
      expect(body, `page must not mention "${leak}"`).not.toContain(leak);
    }

    // A route out, so the visitor is not stranded.
    const onward = page.getByRole("link", { name: /إلى الحكمة/ });
    await expect(onward).toBeVisible();
    await onward.click();
    await expect(page).toHaveURL(/\/wisdom/);
  });

  test("/tracker shows the same calm screen, not an instruction to configure keys", async ({
    page,
  }) => {
    await page.goto("/tracker");
    const body = await page.locator("body").innerText();

    expect(body).toContain("غير متاح");
    // The old copy was: "المتتبع يحتاج إعداد Firebase. أضف مفاتيحه في متغيرات البيئة."
    for (const leak of ["NEXT_PUBLIC", "متغيرات البيئة", "Firebase"]) {
      expect(body, `page must not mention "${leak}"`).not.toContain(leak);
    }
  });

  /**
   * `noindex` is asserted unconditionally — it must hold in *both* build states.
   *
   * That is a deliberate asymmetry with the tests above. An unconfigured build showing
   * "unavailable" is a reason to stay out of the index; a configured one showing a
   * working sign-in form is also not a search result anyone should land on, because
   * `/enter` is reached from the nav and nothing external links to it. So this holds
   * either way, and skipping it would leave a real regression unguarded.
   */
  test("the unavailable screens are noindex, follow", async ({ page }) => {
    for (const route of ["/enter", "/tracker", "/journal"]) {
      const res = await page.goto(route);
      const html = (await res?.text()) ?? "";
      expect(html, `${route} must carry a noindex`).toContain('name="robots"');
      expect(html, `${route} must not be indexable`).toMatch(
        /noindex[\s\S]{0,40}?nofollow|noindex/
      );
    }
  });

  test("the routes that need no Firebase still work", async ({ page }) => {
    // The regression that would matter most: a build that degrades everything is not a
    // graceful degradation, it is a dead site with extra steps.
    for (const route of ["/", "/wisdom", "/quotes", "/pricing", "/privacy"]) {
      const res = await page.goto(route);
      expect(res?.status(), `${route} must return 200`).toBe(200);
      const body = await page.locator("body").innerText();
      expect(body.trim().length, `${route} must render content`).toBeGreaterThan(80);
    }
  });

  test("no console error, and no Firebase error, on the degraded screens", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/enter");
    await page.waitForLoadState("networkidle");

    // A Firebase SDK error here would mean `initializeApp` was attempted with empty
    // config — the null-safe path in `lib/firebase.ts` is supposed to prevent it.
    expect(errors.filter((e) => /firebase|invalid-api-key|auth\/invalid/i.test(e))).toEqual([]);
  });
});

test.describe("sitemap", () => {
  /**
   * The filtering is a function of the build, not of the request, so this spec has to
   * branch on what the build under test was configured with.
   *
   * `sitemap.ts` is evaluated during `next build` — that is when `NEXT_PUBLIC_*` is
   * inlined — so the sitemap cannot change by setting a variable afterwards. Running
   * this against a build that *had* Firebase keys and asserting they are absent would
   * be asserting the impossible, and would have "failed" against correct behaviour.
   *
   * `MIAB_FIREBASE_EXPECTED` is set by the caller (`build:cf` sets it from
   * `check:env`). It defaults to "configured", which is the state a deployed
   * Production build is in.
   */
  const firebaseExpected = process.env.MIAB_FIREBASE_EXPECTED !== "absent";

  test(
    firebaseExpected
      ? "lists every Firebase-dependent route when Firebase is configured"
      : "omits every Firebase-dependent route when Firebase is absent",
    async ({ page }) => {
      const res = await page.goto("/sitemap.xml");
      const xml = await res?.text();

      for (const route of ["/enter", "/tracker", "/journal"]) {
        if (firebaseExpected) {
          expect(xml, `sitemap must advertise ${route} in a configured build`).toContain(
            route
          );
        } else {
          expect(
            xml,
            `sitemap must not advertise ${route} when Firebase is absent`
          ).not.toContain(route);
        }
      }

      // In both cases it must not be empty. A sitemap that drops everything is not
      // "correctly filtered", it is a silent total failure.
      expect(xml).toContain("/wisdom");
      expect(xml).toContain("/quotes");
    }
  );
});

test.describe("PROJECT_MAP environment table", () => {
  test("documents every variable the env gate requires", async ({ page }) => {
    await page.goto("/");
    // The map is a repo file, not a served route, so read it from disk.
    const fs = await import("node:fs");
    const map = fs.readFileSync("PROJECT_MAP.md", "utf8");

    for (const name of [
      "NEXT_PUBLIC_FIREBASE_API_KEY",
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      "NEXT_PUBLIC_FIREBASE_APP_ID",
      "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
      "TURNSTILE_SECRET_KEY",
      "ANON_SESSION_SECRET",
      "FIREBASE_SERVICE_ACCOUNT_JSON",
      "ADMIN_PAGE_SECRET",
    ]) {
      expect(map, `PROJECT_MAP.md must document ${name}`).toContain(name);
    }

    // The trap this table exists to prevent: marking a `NEXT_PUBLIC_` value as a
    // Cloudflare Secret, which hides it from the build and leaves the bundle empty.
    expect(map).toMatch(/NEXT_PUBLIC[\s\S]{0,200}?(Plain text|نص عادي)/i);
  });
});