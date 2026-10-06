import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = process.env.AUDIT_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * E2E config.
 *
 * Tests target a *production* build served by `next start`, not `next dev`.
 * React strict-mode double-rendering, the dev overlay and unminified chunks
 * all change behaviour and timings, so a green dev run says little about what
 * users get. The build is part of `webServer` so the suite is self-contained.
 *
 * `shell.spec.ts` sets its own viewport per describe (360px mobile, 1280px
 * desktop), so it runs in the `desktop` project only. Running it in both would
 * have `isMobile`/touch emulation fight the explicit viewport and produce
 * results that match neither device.
 */
export default defineConfig({
  testDir: "./e2e",
  testIgnore: /firebase-live\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { outputFolder: "test-results/html-report", open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    locale: "ar-SA",
    // Honour the app's own dark default rather than the OS preference, so a
    // run on a light-mode machine still exercises the shipped theme.
    colorScheme: "dark",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    // Desktop browsers
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    {
      name: "firefox-desktop",
      use: { ...devices["Desktop Firefox"], viewport: { width: 1280, height: 900 } },
    },
    {
      name: "webkit-desktop",
      use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 900 } },
    },

    // Tablet
    {
      name: "tablet-chrome",
      use: { ...devices["iPad Pro"], viewport: { width: 1024, height: 1366 }, locale: "ar-SA" },
    },
    {
      name: "tablet-firefox",
      use: { ...devices["iPad Pro"], viewport: { width: 1024, height: 1366 }, locale: "ar-SA", browserName: "firefox" },
    },

    // Mobile
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 }, locale: "ar-SA" },
    },
    {
      name: "mobile-chrome-360",
      use: { ...devices["Galaxy S9+"], viewport: { width: 360, height: 740 }, locale: "ar-SA" },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 14"], viewport: { width: 390, height: 844 }, locale: "ar-SA" },
    },
    {
      name: "mobile-firefox",
      use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 }, locale: "ar-SA", browserName: "firefox" },
    },

    // Light theme variants
    {
      name: "chromium-desktop-light",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 }, colorScheme: "light" },
    },
    {
      name: "mobile-chrome-light",
      use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 }, locale: "ar-SA", colorScheme: "light" },
    },
  ],

  webServer: [
    {
      /*
       * The providers are called server-side from the edge route, and Playwright
       * cannot intercept a server-side fetch. So a deterministic fake upstream
       * runs alongside the app and the providers are pointed at it. The real
       * gateway — quota, SSE framing, wellbeing guard, GATE — is exercised for
       * real; only the model call is simulated.
       */
      command: "node scripts/fake-upstream.mjs --port 4010",
      url: "http://127.0.0.1:4010/__health",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      stdout: "ignore",
    },
    {
      command: `npm run build && npx next start -p ${PORT}`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      stdout: "ignore",
      env: {
        // Placeholders, so the chain resolves an adapter. No key ever leaves
        // the machine: the base URLs point at the local fake.
        GEMINI_API_KEY: "e2e-placeholder",
        GROQ_API_KEY: "e2e-placeholder",
        AI_BASE_URL_GEMINI: "http://127.0.0.1:4010",
        AI_BASE_URL_GROQ: "http://127.0.0.1:4010",
        /*
         * No FIREBASE_SERVICE_ACCOUNT_JSON, so the quota's in-memory fallback
         * engages — which is what makes a per-isolate counter testable at all.
         * Without it there is no counter store, no decrement, and no gate.
         *
         * ANON_SESSION_SECRET is deliberately unset so the per-IP ceiling is
         * skipped: every test shares one IP, so the ceiling would otherwise be a
         * single shared counter and the quota assertions would depend on the
         * order tests happened to run in.
         */
      },
    },
  ],

  // Global setup and teardown
  globalSetup: require.resolve("./e2e/global-setup.ts"),
  globalTeardown: require.resolve("./e2e/global-teardown.ts"),
});