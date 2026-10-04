import { test, expect } from "@playwright/test";

/**
 * Configured-preview acceptance: guest sign-in, then a journal entry that
 * survives a reload (i.e. it reached Firestore, not just the local mirror).
 *
 * Runs ONLY against a deployed preview via `playwright.live.config.ts`:
 *
 *   MIAB_LIVE_URL=https://<preview>.mindinbox-final.pages.dev \
 *     npx playwright test --config playwright.live.config.ts
 *
 * Skipped in the default suite: it needs a real Firebase project (anonymous
 * auth enabled, this preview domain authorised) and would fail against the
 * deliberately unconfigured local build — correctly, but noisily.
 */
test.describe("Firebase configured (live preview)", () => {
  const live = (process.env.MIAB_LIVE_URL ?? "").trim();

  test.beforeEach(() => {
    test.skip(!live, "Set MIAB_LIVE_URL to a Firebase-configured preview deployment.");
  });

  test("/enter renders the real forms, not the unavailable screen", async ({ page }) => {
    await page.goto("/enter");
    // The sign-in/sign-up tabs exist only on the real form.
    await expect(page.getByRole("tablist", { name: /طريقة الدخول/ })).toBeVisible();
    // The guest path is the acceptance entry point.
    await expect(page.getByRole("button", { name: /كضيف/ })).toBeVisible();
    // And the degraded screen is gone: no "غير متاح", no variable names.
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("غير متاح");
    expect(body).not.toContain("NEXT_PUBLIC");
  });

  test("guest sign-in works, a journal entry syncs and survives reload", async ({
    page,
  }) => {
    const probe = `معاينة ${Date.now()}`;

    await page.goto("/enter");
    await page.getByRole("button", { name: /كضيف/ }).click();
    // Guest entry lands on the journal (or anywhere past the gate): the guest
    // button disappears and no error notice appears.
    await expect(page.getByRole("button", { name: /كضيف/ })).toHaveCount(0, {
      timeout: 20_000,
    });

    await page.goto("/journal");
    const box = page.locator("#journal-input");
    await expect(box).toBeVisible();
    await box.fill(probe);
    await page.getByRole("button", { name: /^احفظ$/ }).click();
    // The entry renders from the store mirror…
    await expect(page.locator("body")).toContainText(probe.slice(0, 12));

    // …and it is still there after a full reload, which only Firestore can do.
    await page.reload();
    await expect(page.locator("body")).toContainText(probe.slice(0, 12), {
      timeout: 20_000,
    });
  });
});
