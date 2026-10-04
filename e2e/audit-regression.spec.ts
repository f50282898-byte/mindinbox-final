import { test, expect, type Page } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The audit regression gate.
 *
 * `scripts/audit/crawl.ts` produces `AUDIT-UI.md`. This file is the part that must never
 * fail silently: it re-checks the acceptance criteria on every run, so a defect that the
 * full audit recorded once cannot be reintroduced without turning CI red.
 *
 * ## Two very different kinds of check
 *
 * **Live browser checks.** The three criteria that can only be observed in a real page:
 * no console errors, no internal 404s, no horizontal scroll at 360px. These are the
 * acceptance criteria from the brief, and they are checked against the running app so
 * they hold even if nobody re-runs the full crawl.
 *
 * **Artifact checks.** A P0 or P1 recorded in `AUDIT-UI.md` fails the build. This is a
 * deliberate choice and it is the reason the crawl writes a machine-readable artifact:
 * an audit nobody can gate on is a document nobody acts on. When a defect is deliberately
 * accepted rather than fixed, its id goes in `ACKNOWLEDGED` below **with a reason** — so
 * the exception is visible in review instead of quietly deleted from a report.
 *
 * ## Why the artifact check is skipped rather than failing when the file is missing
 *
 * A fresh clone with no `npm run audit:ui` yet has no `AUDIT-UI.md`. Failing there would
 * mean CI is red for a reason unrelated to the code, and the fix people reach for is
 * deleting the check. Instead it reports the gate as not-yet-run, which is the truth.
 */

const AUDIT_REPORT = resolve(process.cwd(), "AUDIT-UI.md");
const AUDIT_RAW = resolve(process.cwd(), "docs/audit/raw.json");

/**
 * Findings knowingly shipped, with the reason each is acceptable.
 *
 * Empty by default. An entry here is a claim that a real user is not harmed, and it is
 * reviewed every time it is added. "Design taste" is not a reason — taste is what the
 * brief said to bring back for a decision, not what gets buried here.
 */
const ACKNOWLEDGED: Record<string, string> = {};

/**
 * Routes the audit covers, read from the same place the crawler reads them.
 *
 * Duplicating this list would be the same mistake as crawling the sitemap: the copy
 * would drift, and the check would quietly stop covering the route that just changed.
 */
function auditedRoutes(): string[] {
  const nav = readFileSync(resolve(process.cwd(), "src/lib/nav.ts"), "utf8");
  const match = /export const INDEXABLE_ROUTES = \[([\s\S]*?)\] as const;/.exec(nav);
  if (!match?.[1]) throw new Error("Could not read INDEXABLE_ROUTES from src/lib/nav.ts");
  const indexable = [...match[1].matchAll(/"(\/[^"]*)"/g)].map((m) => m[1] as string);
  return [...indexable, "/oracle", "/sanctum", "/account", "/god-mode-admin", "/membership"];
}

/** Seeds theme and locale before the app's pre-paint script reads them. */
async function seed(page: Page, theme: string, locale: string): Promise<void> {
  await page.addInitScript(
    ([t, l]) => {
      try {
        localStorage.setItem("miab-theme", t as string);
        localStorage.setItem("miab-locale", l as string);
      } catch {
        /* private mode: the app falls back to its defaults, which is still a valid test */
      }
    },
    [theme, locale] as const
  );
}

/**
 * Console errors and failed requests, collected across a visit.
 *
 * Both are attached as listeners *before* `goto`. A listener added afterwards misses
 * every error the page raised while loading — which is exactly when hydration and CSP
 * failures happen, and exactly the class of defect this gate exists to catch.
 *
 * Note there is exactly one set of listeners. This helper previously existed alongside a
 * second, identical inline registration, so every error was pushed twice — which reads as
 * two independent confirmations of one failure and is the sort of thing that teaches
 * people to ignore a red gate.
 */
function watch(page: Page): { errors: string[]; failed: string[] } {
  const errors: string[] = [];
  const failed: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/Download the React DevTools/i.test(text)) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));
  page.on("response", (res) => {
    if (res.status() >= 400) failed.push(`${res.status()} ${res.url()}`);
  });

  return { errors, failed };
}

/**
 * Wait until the page is interactive.
 *
 * Not `networkidle`. Firestore's `Listen` channel is a permanent long-poll, so a correctly
 * configured app never goes idle and `networkidle` times out — it reports every route as
 * broken, which is the same failure as reporting every route as fine. See D83.
 *
 * `html[data-hydrated="1"]` is set by `AppShell`'s mount effect, so its absence means React
 * never mounted and every assertion below would be about a blank page.
 */
async function ready(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });
  await page.waitForSelector('html[data-hydrated="1"]', { timeout: 20_000 });
  await page
    .evaluate(() =>
      Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))])
    )
    .catch(() => undefined);
}

test.describe("UI audit regression gate", () => {
  test("no recorded P0 or P1 remains in AUDIT-UI.md", () => {
    test.skip(!existsSync(AUDIT_REPORT), "No AUDIT-UI.md — run `npm run audit:ui` first");
    expect(existsSync(AUDIT_REPORT)).toBe(true);

    const raw = readFileSync(AUDIT_RAW, "utf8");
    const artifact = JSON.parse(raw) as {
      sweep: Array<{ severity: string; id: string; route: string; evidence: string }>;
      interaction: Array<{ severity: string; id: string; route: string; evidence: string }>;
    };

    const blocking = [...artifact.sweep, ...artifact.interaction].filter(
      (f) => (f.severity === "P0" || f.severity === "P1") && !ACKNOWLEDGED[f.id]
    );

    // Deduplicated and sorted so the failure message is readable: one line per defect,
    // not one line per defect per viewport per theme per locale.
    const lines = [
      ...new Set(
        blocking.map(
          (f) => `[${f.severity}] ${f.route} — ${f.id}\n    ${f.evidence.slice(0, 160)}`
        )
      ),
    ].sort();

    expect(
      lines,
      `${blocking.length} unresolved P0/P1 in the last audit run.\n` +
        `Fix them, or record an accepted reason in ACKNOWLEDGED in e2e/audit-regression.spec.ts.\n\n` +
        lines.join("\n")
    ).toEqual([]);
  });

  test("the audit artifact covers every route", () => {
    test.skip(!existsSync(AUDIT_RAW), "No docs/audit/raw.json — run `npm run audit:ui` first");

    const artifact = JSON.parse(readFileSync(AUDIT_RAW, "utf8")) as {
      results: Array<{ route: string; viewport: string; theme: string; locale: string }>;
    };
    const covered = new Set(artifact.results.map((r) => r.route));

    const missing = auditedRoutes().filter((route) => !covered.has(route));
    expect(
      missing,
      "These routes have no audit result. Either they were never crawled, or the route " +
        "map changed after the last audit — re-run `npm run audit:ui`."
    ).toEqual([]);
  });

  test("no console errors on any public route", async ({ context }) => {
  for (const route of auditedRoutes()) {
    // A fresh page per route, so each route's listeners see only its own load. Registering
    // on a shared page across the loop leaves the previous route's listeners attached, and
    // an error from route N then gets reported against route N+1.
    const page = await context.newPage();
    const { errors, failed } = watch(page);

    await seed(page, "dark", "ar");
    await page.goto(route);
    await ready(page);

    expect(errors, `console errors on ${route}`).toEqual([]);
    const internalFailures = failed.filter((f) => !/favicon|\/icon\.jpg/.test(f));
    expect(internalFailures, `failed requests on ${route}`).toEqual([]);

    await page.close();
  }
});

test("no horizontal scroll at 360px", async ({ context }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 360, height: 740 });

  for (const route of auditedRoutes()) {
    for (const theme of ["dark", "light"] as const) {
      await seed(page, theme, "ar");
      await page.goto(route);
      await ready(page);

        const { scrollWidth, innerWidth, culprits } = await page.evaluate(() => {
          const inner = window.innerWidth;
          const scrollWidth = document.documentElement.scrollWidth;
          const culprits: string[] = [];
          if (scrollWidth > inner + 1) {
            for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
              const style = getComputedStyle(el);
              if (style.display === "none" || style.visibility === "hidden") continue;
              if (style.position === "fixed") continue;
              // A container that scrolls itself is doing it on purpose.
              if (el.scrollWidth > el.clientWidth + 1) continue;
              const rect = el.getBoundingClientRect();
              if (rect.right <= inner + 1) continue;
              culprits.push(
                `${el.tagName.toLowerCase()}.${(el.getAttribute("class") || "").split(/\s+/).slice(0, 2).join(".")} ` +
                  `(${(el.textContent || "").trim().slice(0, 40)})`
              );
            }
          }
          return { scrollWidth, innerWidth: inner, culprits: culprits.slice(0, 5) };
        });

        expect(
          culprits.length > 0 ? culprits : [`scrollWidth ${scrollWidth} > ${innerWidth}`],
          `horizontal scroll on ${route} in ${theme} theme at 360px`
        ).toEqual([]);
      }
    }

  await page.close();
  });
});
