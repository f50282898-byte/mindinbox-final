import { defineConfig, devices } from "@playwright/test";

/**
 * Live-preview config: runs the Firebase-configured assertions against a
 * deployed Cloudflare Pages preview, not against a local build.
 *
 * No `webServer` here on purpose: the app under test is the preview URL in
 * `MIAB_LIVE_URL`, which already has `NEXT_PUBLIC_FIREBASE_*` inlined at its
 * own build time. Booting a local build would test the wrong deployment.
 *
 * Usage (after setting the Preview variables in Cloudflare and redeploying):
 *
 *   MIAB_LIVE_URL=https://<preview>.mindinbox-final.pages.dev \
 *     npx playwright test --config playwright.live.config.ts
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /firebase-live\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.MIAB_LIVE_URL,
    locale: "ar-SA",
    colorScheme: "dark",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
  ],
});
