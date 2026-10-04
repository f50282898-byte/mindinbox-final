import { expect, test, type Page } from "@playwright/test";

/**
 * Acceptance tests for the shell (prompt 03 route/shell brief).
 *
 * These encode the stated criteria so they cannot silently regress:
 *  - every route renders without a server or console error
 *  - no horizontal scroll at 360px
 *  - the shell is reachable and operable by keyboard alone
 *  - the landing page carries no navigation chrome
 *
 * The server is `next start` against a production build; see playwright.config.ts.
 */

const ROUTES = [
  "/",
  "/enter",
  "/wisdom",
  "/dialogue",
  "/journal",
  "/tracker",
  "/paths",
  "/quotes",
  "/pricing",
  "/account",
  "/privacy",
  "/terms",
  "/refund",
] as const;

/**
 * Navigate and wait for React to hydrate.
 *
 * `networkidle` is unusable here: AppShell opens a persistent Firebase
 * connection and an `/api/ai` probe, so the network never goes quiet. But
 * `domcontentloaded` alone is too early — before hydration React has attached
 * no listeners, so a click or a keyboard shortcut is a silent no-op and the
 * test fails for a reason unrelated to the app. `data-hydrated` is set in an
 * AppShell effect for exactly this purpose.
 *
 * `networkidle` is also not what we want to assert on: see above.
 */
async function gotoHydrated(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1", null, {
    timeout: 20_000,
  });
}

test.describe("routes", () => {
  for (const route of ROUTES) {
    test(`${route} renders without errors`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text());
      });
      page.on("pageerror", (e) => consoleErrors.push(String(e)));

      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1", null, { timeout: 20_000 });
      expect(response?.status(), `${route} status`).toBe(200);

      // Real content, not an empty shell.
      await expect(page.locator("#main")).toBeVisible();

      // Firebase is not configured locally, so a *known* setup message is
      // allowed. Anything else is a defect.
      const allowed = /Firebase|firebase|not configured|مُهيأ|مهيأ|setup/i;
      const unexpected = consoleErrors.filter((e) => !allowed.test(e));
      expect(unexpected, `console errors on ${route}`).toEqual([]);
    });
  }

  test("unknown route returns 404 with useful links", async ({ page }) => {
    const response = await page.goto("/definitely-not-a-page", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

test.describe("360px mobile", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  for (const route of ROUTES) {
    test(`${route} has no horizontal scroll at 360px`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      // Allow a 1px rounding tolerance; anything more is a real overflow.
      const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        return {
          scrollWidth: de.scrollWidth,
          clientWidth: de.clientWidth,
          delta: de.scrollWidth - de.clientWidth,
        };
      });
      expect(overflow.delta, `overflow ${JSON.stringify(overflow)}`).toBeLessThanOrEqual(1);
    });
  }

  test("bottom bar shows five items and no hamburger", async ({ page }) => {
    await gotoHydrated(page, "/pricing");
    const bar = page.locator('nav[aria-label="التنقل السريع"]');
    await expect(bar).toBeVisible();
    await expect(bar.locator("li")).toHaveCount(5);

    // The brief rules out a crowded hamburger menu.
    await expect(page.locator('button[aria-label*="قائمة"], button[aria-label*="القائمة"]')).toHaveCount(0);
  });

  test("More sheet opens, traps focus, and closes on Escape", async ({ page }) => {
    await gotoHydrated(page, "/pricing");
    const trigger = page.getByRole("button", { name: /المزيد/ });
    await trigger.click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();

    // Focus must be inside the dialog.
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')))
      .toBe(true);

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("no fixed overlay covers the bottom navigation", async ({ page }) => {
    await gotoHydrated(page, "/pricing");
    const bar = page.locator('nav[aria-label="التنقل السريع"]');
    await expect(bar).toBeVisible();

    // A full-width panel parked over the bar at bottom:0 previously made every
    // nav item unclickable at 360px. Assert on geometry, not on class names.
    const blocked = await page.evaluate(() => {
      const bar = document.querySelector('nav[aria-label="التنقل السريع"]');
      if (!bar) return { ok: false, reason: "no bar" };
      const b = bar.getBoundingClientRect();
      const offenders: string[] = [];
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        const cs = getComputedStyle(el);
        if (cs.position !== "fixed" || cs.pointerEvents === "none") continue;
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        // Ignore the bar itself and its own backdrop.
        if (el === bar || bar.contains(el) || el.contains(bar)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const overlaps =
          r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
        // Only a problem if it sits above the bar in the stacking order.
        if (overlaps && Number(cs.zIndex || 0) > Number(getComputedStyle(bar).zIndex || 0)) {
          offenders.push(
            `${el.tagName}.${el.className}`.slice(0, 120) +
              ` z=${cs.zIndex} rect=${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}x${Math.round(r.height)}`
          );
        }
      }
      return { ok: offenders.length === 0, offenders };
    });

    expect(blocked.offenders, "fixed overlays covering the bottom nav").toEqual([]);
    expect(blocked.ok).toBe(true);
  });
});

test.describe("keyboard", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("skip link is the first stop and moves focus to main", async ({ page }) => {
    await gotoHydrated(page, "/pricing");
    await page.keyboard.press("Tab");
    const first = await page.evaluate(() => document.activeElement?.className ?? "");
    expect(first).toContain("skip-link");

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });

  test("every sidebar link is reachable by Tab alone", async ({ page }) => {
    await gotoHydrated(page, "/pricing");
    const hrefs = await page
      .locator('nav[aria-label="التنقل الرئيسي"] a[href]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("href")));

    expect(hrefs.length).toBeGreaterThan(5);

    const seen = new Set<string>();
    for (let i = 0; i < 60; i += 1) {
      await page.keyboard.press("Tab");
      const href = await page.evaluate(() => document.activeElement?.getAttribute("href"));
      if (href) seen.add(href);
    }
    for (const href of hrefs) {
      expect(seen, `${href} not reachable by keyboard`).toContain(href);
    }
  });

  test("visible focus ring on nav links", async ({ page }) => {
    await gotoHydrated(page, "/pricing");
    const link = page.locator('nav[aria-label="التنقل الرئيسي"] a[href]').first();
    await link.focus();
    const outline = await link.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { width: cs.outlineWidth, style: cs.outlineStyle, shadow: cs.boxShadow };
    });
    const hasRing =
      (outline.style !== "none" && parseFloat(outline.width) > 0) ||
      (outline.shadow !== "none" && outline.shadow !== "");
    expect(hasRing, `no focus indicator: ${JSON.stringify(outline)}`).toBe(true);
  });

  test("Ctrl+Shift+L toggles language, Ctrl+Shift+T toggles theme", async ({ page }) => {
    await gotoHydrated(page, "/pricing");
    const before = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      theme: document.documentElement.dataset.theme,
    }));

    await page.keyboard.press("Control+Shift+L");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.lang))
      .not.toBe(before.lang);

    await page.keyboard.press("Control+Shift+T");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .not.toBe(before.theme);
  });
});

test.describe("landing", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("has no navigation chrome and one clear CTA", async ({ page }) => {
    await gotoHydrated(page, "/");
    await expect(page.locator("nav")).toHaveCount(0);

    const cta = page.locator('a[href="/enter"]');
    await expect(cta).toHaveCount(1);
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/enter$/);
  });

  test("title is exposed once to assistive tech despite per-letter reveal", async ({ page }) => {
    await gotoHydrated(page, "/");
    const h1 = page.locator("h1");
    await expect(h1).toHaveAttribute("aria-label", "عقل في صندوق");
    // Spans are decorative duplicates; the label is the accessible name.
    const hidden = await h1.locator('span[aria-hidden="true"]').count();
    expect(hidden).toBeGreaterThan(0);
  });

  test("emits JSON-LD without an unearned review or rating", async ({ page }) => {
    await gotoHydrated(page, "/");
    const raw = await page.locator('script[type="application/ld+json"]').innerText();
    const parsed = JSON.parse(raw);
    const text = JSON.stringify(parsed);
    expect(text).not.toContain("AggregateRating");
    expect(text).not.toContain("Review");
  });
});
