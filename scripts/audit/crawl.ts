/**
 * The UI audit crawler.
 *
 * Opens every route × viewport × theme × locale in a real browser and records what a
 * user would actually see. Nothing here is inferred from the source: a route appearing
 * in `nav.ts` says nothing about whether it renders, and a component passing `tsc`
 * says nothing about whether its text is legible on a 360px screen.
 *
 * ## What is recorded, and why each item earns its place
 *
 * | Recorded | Catches | Not found by |
 * |---|---|---|
 * | console errors | hydration mismatch, CSP violation, a thrown render | static analysis |
 * | failed requests | missing assets, 4xx APIs, blocked fonts | reading the DOM |
 * | horizontal scroll | one over-wide element breaking the page | unit tests |
 * | overflow offenders | *which* element causes it | a boolean |
 * | clipped text | content the reader can never reach | a screenshot |
 * | contrast | text over a translucent panel over artwork | `verify-contrast` |
 * | keyboard gaps | controls a keyboard cannot reach | axe alone |
 * | unnamed controls | icon buttons with no label | a screenshot |
 * | heading order | broken heading navigation | partly |
 * | tap targets | mobile-only unusable controls | desktop testing |
 * | CLS | layout shift on load | any static check |
 * | LCP | which element is slow, and which | guessing |
 * | axe | the full WCAG A/AA rule set | hand-written probes |
 * | link integrity | wrong hrefs, broken destinations | anything static |
 * | rendered state | a page that renders and does nothing | a 200 status |
 *
 * ## The twelve combinations
 *
 * 3 viewports × 2 themes × 2 locales, for every route. Not a sample. A defect
 * confined to *Parchment at 360px in English* is invisible to anyone testing dark on
 * desktop in Arabic, which is exactly how it survives to launch.
 *
 * ## Performance is measured, not asserted
 *
 * CLS and LCP come from `PerformanceObserver`s installed **before** the page loads, via
 * `addInitScript`. Reading them after `goto` reports zeros, because layout-shift entries
 * are buffered per page and a late subscriber misses the shift that already happened —
 * which is how a page with a real 0.4 CLS reports a clean 0.000.
 *
 * Theme and locale are seeded the same way, for a different reason. The app reads both
 * from `localStorage` in a pre-paint inline script to avoid a flash; setting them after
 * load would repaint every element and manufacture a layout shift that exists only in
 * the audit.
 *
 * ## Sequential on purpose
 *
 * A parallel crawl of 192 combinations on one machine makes every CLS and LCP number
 * describe CPU contention rather than the page. These numbers go into a report someone
 * acts on, so they have to mean what they say.
 *
 * ## The interaction pass is separate
 *
 * Clicking is destructive — it submits forms, navigates, opens dialogs. Run inside the
 * twelve-way sweep it would make each result depend on what ran before it. So it runs
 * afterwards, once per route per viewport, and restores the page between clicks.
 *
 * ## As a regression test
 *
 * `e2e/audit-regression.spec.ts` asserts the acceptance criteria from `AUDIT-UI.md` —
 * no console errors, no internal 404s, no horizontal scroll at 360px. This file produces
 * the report; the spec keeps it honest.
 *
 * Run:
 *   npx tsx scripts/audit/crawl.ts
 *   npx tsx scripts/audit/crawl.ts --only=/wisdom --no-interact
 *   AUDIT_BASE_URL=https://mindinbox.pages.dev npx tsx scripts/audit/crawl.ts
 */

import { chromium, type Browser, type ConsoleMessage, type Page } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { combinations, ROUTES, VIEWPORTS, slug, type Combination, type Locale, type RouteSpec, type Theme, type Viewport } from "./routes";
import { runProbes, type ProbeResult } from "./probes";

/* ── configuration ────────────────────────────────────────────────────────── */

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(hit.indexOf("=") + 1) : fallback;
}

/**
 * A bare flag such as `--no-interact`.
 *
 * Separate from `arg` because a flag and a valued option are different shapes, and
 * conflating them is how `--no-interact` silently does nothing: `arg` only matches
 * `--name=value`, so a bare `--no-interact` falls through to the default. The run would
 * then print "interaction: off" while clicking every button on every page — a report
 * claiming coverage it did not have, which is the one thing an audit must not do.
 */
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const BASE_URL = arg("base", process.env.AUDIT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
/** Screenshots and raw JSON land here. */
const ARTIFACT_DIR = resolve(arg("out", "docs/audit"));
/** The report itself, at the repo root next to PROJECT_MAP.md. */
const REPORT_PATH = resolve(arg("report", "AUDIT-UI.md"));
const SHOTS_DIR = join(ARTIFACT_DIR, "screenshots");
/**
 * Which routes to visit, or `""` for all.
 *
 * Comma-separated. It began as a single substring — `--only=/wisdom` — which reads
 * naturally and then fails completely and silently on `--only=/quotes,/paths`: the
 * filter matches no route, zero combinations are crawled, and the report is written
 * claiming a clean bill of health for a run that examined nothing. A list is what
 * anyone reaching for this flag actually has in their hand, so it is what it takes.
 */
const ONLY = arg("only", "");
/** The individual needles. `""` means "no filter". */
const ONLY_PARTS = ONLY.split(",").map((s) => s.trim()).filter(Boolean);
const SHOT_FULL_PAGE = !flag("shots-viewport") && arg("shots", "full") !== "viewport";
const DO_INTERACT = !flag("no-interact");
const DO_SWEEP = !flag("interact-only");
/** A cap so one page with 300 controls cannot consume the whole run. */
const MAX_CONTROLS = Number(arg("max-controls", "40"));

/* ── the finding shape ────────────────────────────────────────────────────── */

export type Severity = "P0" | "P1" | "P2" | "P3";

export interface Finding {
  severity: Severity;
  /** Stable id, so a fix can be verified as the same defect and not a new one. */
  id: string;
  route: string;
  viewport: string;
  theme: Theme;
  locale: Locale;
  /** What a user would say, not what a tool printed. */
  title: string;
  /** The measured evidence. */
  evidence: string;
  /** Path relative to the repo root. */
  screenshot?: string;
  /** How many combinations showed it. One combo is not the same as all of them. */
  occurrences: number;
}

export interface PageResult {
  route: string;
  viewport: string;
  theme: Theme;
  locale: Locale;
  status: number | null;
  finalUrl: string;
  textLength: number;
  title: string;
  screenshot: string | null;
  probes: ProbeResult | null;
  cls: number | null;
  lcpMs: number | null;
  lcpElement: string | null;
  topShiftSources: string[];
  consoleErrors: string[];
  consoleWarnings: string[];
  failedRequests: { url: string; status: number; kind: string }[];
  axeViolations: {
    id: string;
    impact: string;
    nodes: number;
    help: string;
    /**
     * A few failing nodes verbatim.
     *
     * Without these, a `color-contrast` finding says "9 elements" and the reader has to
     * re-run the audit with different settings to learn which nine. A finding that cannot
     * be acted on without a second tool is a finding nobody fixes.
     */
    samples: string[];
  }[];
  /**
   * Rules axe loaded but refused to decide on.
   *
   * `color-contrast` appears here whenever the background behind text could not be
   * determined — which on a page with an artwork layer is all of them. Not a pass, and
   * not a failure either: it is the absence of a verdict, and the report says so.
   */
  axeIncomplete: { id: string; nodes: number }[];
  links: { href: string; internal: boolean; status: number | null; broken: boolean }[];
  /**
   * Set when the audit's own instrumentation failed on this page.
   *
   * Its presence means the DOM probes for this combination did not run, so every
   * layout/contrast/keyboard column in the coverage table for this row is *absent*, not
   * passing. Non-null values are surfaced as a P0 rather than being buried in the
   * console-error list, because an audit blaming the app for its own failure sends the
   * reader to fix the wrong file.
   */
  harnessFailure: string | null;
  /** How many focus stops the Tab walk reached, and how many the inventory listed. */
  focusStops: number;
  focusInventory: number;
  /**
   * Focus stops the walk reached that the inventory never listed.
   *
   * Non-zero means the probe under-counted the page's focusable elements, so the
   * keyboard verdict for this combination is incomplete. Recorded because a keyboard
   * finding derived from an incomplete list is a finding of unknown reliability.
   */
  focusOffInventory: number;
  /**
   * Which UI state actually rendered. Recorded because "the page loaded" and "the page
   * worked" are different claims — without it, a run visiting 192 combinations would
   * report 192 successes while half of them showed an unavailable screen.
   */
  renderedState: "normal" | "firebase-degraded" | "empty" | "loading-stuck" | "gate";
}

/* ── pre-load instrumentation ──────────────────────────────────────────────── */

/**
 * Installed before any page script runs.
 *
 * Three things, all of which lose data if registered after `goto`:
 *
 * - `layout-shift`: the browser buffers entries per page; a late subscriber sees none
 *   of the shifts that already happened.
 * - `largest-contentful-paint`: likewise, and only readable via `takeRecords()` while
 *   the page is foregrounded.
 * - `__miabAudit.describe`: the same element-path function `probes.ts` uses, so the
 *   crawler's Tab walk can name a focused element in the *same* vocabulary the findings
 *   use. Duplicating that function would guarantee the two drifted apart, and a diff
 *   that never matches is a diff that always reports everything as a gap.
 */
const INIT_SCRIPT = `
(() => {
  window.__miab = { cls: 0, shifts: [], lcp: 0, lcpElement: null };

  // esbuild (which tsx uses) rewrites every compiled function to
  // \`__name(fn, "originalName")\` so stack traces keep names. Playwright ships
  // page.evaluate's function to the browser as a *string* and evals it there, where
  // that helper does not exist — so every probe threw ReferenceError on every page and
  // the sweep reported "no overflow, no contrast, no keyboard gaps". An audit that
  // silently measures nothing is worse than no audit, because the empty report reads
  // as a clean page.
  //
  // Defining it as the identity it is meant to be makes the stringified probe valid.
  // Harmless if a future toolchain stops emitting it.
  if (typeof globalThis.__name !== 'function') {
    globalThis.__name = function (fn) { return fn; };
  }

  function describe(el) {
    if (!el || !el.getAttribute) return 'unknown';
    const id = el.getAttribute('id');
    if (id) return '#' + id;
    const label = el.getAttribute('aria-label');
    if (label) return el.tagName.toLowerCase() + '[aria-label="' + label.slice(0, 28) + '"]';
    const testid = el.getAttribute('data-testid');
    if (testid) return '[data-testid="' + testid + '"]';
    const cls = (el.getAttribute('class') || '').split(/\\s+/)
      .filter(function (c) {
        return c && !/^(absolute|fixed|flex|grid|block|inline|hidden|relative|sticky|w-full|h-full)$/.test(c);
      }).slice(0, 2).join('.');
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  }
  window.__miabAudit = { describe: describe };

  try {
    new PerformanceObserver(function (list) {
      for (const entry of list.getEntries()) {
        // hadRecentInput excludes shifts the user caused, which is the correct
        // exclusion: CLS measures surprise, not a deliberate resize.
        if (entry.hadRecentInput) continue;
        window.__miab.cls += entry.value;
        if (window.__miab.shifts.length < 20) {
          window.__miab.shifts.push({
            value: Math.round(entry.value * 1000) / 1000,
            sources: (entry.sources || []).map(function (s) {
              return s.node ? describe(s.node) : 'text-node';
            }),
          });
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) { /* unsupported: reported as null, never as 0 */ }

  try {
    new PerformanceObserver(function (list) {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (!last) return;
      window.__miab.lcp = last.startTime;
      window.__miab.lcpElement = last.element ? describe(last.element) : 'text-node';
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) { /* unsupported */ }
})();
`;

/**
 * Seeds theme and locale before the app's pre-paint script reads them.
 *
 * Sets the *shipped* dark default rather than deferring to the OS preference, so the run
 * exercises what a user with no OS setting sees. `colorScheme: "dark"` on the context
 * covers the CSS `prefers-color-scheme` side; this covers the `localStorage` side, which
 * is what the app actually branches on.
 */
function stateScript(theme: Theme, locale: Locale): string {
  return `
    try {
      localStorage.setItem('miab-theme', ${JSON.stringify(theme)});
      localStorage.setItem('miab-locale', ${JSON.stringify(locale)});
    } catch (e) {}
  `;
}

/** axe, injected from the installed package. Never fetched from a CDN. */
const AXE_PATH = (() => {
  const local = resolve(process.cwd(), "node_modules/axe-core/axe.min.js");
  if (existsSync(local)) return local;
  throw new Error(
    "axe-core is not installed. Run: npm install --save-dev axe-core\n" +
      "Deliberately not fetched from a CDN at runtime — an audit that depends on a " +
      "third-party host reports on that host's availability, not on this app."
  );
})();

async function runAxe(page: Page): Promise<{
  violations: PageResult["axeViolations"];
  incomplete: PageResult["axeIncomplete"];
}> {
  await page.addScriptTag({ path: AXE_PATH });
  // wcag2a/aa + wcag21a/aa — the rule set "no critical axe violations" is measured
  // against. `best-practice` is deliberately excluded: it is advisory, and mixing
  // advisory rules into a pass/fail list is how a gate stops meaning anything.
  const result = await page.evaluate(async () => {
    const w = window as unknown as {
      axe: {
        run: (
          ctx: unknown,
          opts: unknown
        ) => Promise<{
          violations: Array<{
            id: string;
            impact: string | null;
            help: string;
            nodes: Array<{ target: string[]; failureSummary?: string; html?: string }>;
          }>;
          incomplete: Array<{
            id: string;
            nodes: Array<{ target: string[] }>;
          }>;
        }>;
      };
    };
    const res = await w.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    });
    return {
      violations: res.violations.map((v) => ({
        id: v.id,
        impact: v.impact ?? "unknown",
        nodes: v.nodes.length,
        help: v.help,
        // Three is enough to recognise a pattern and few enough to keep the report
        // readable. The full node list lives in raw.json.
        samples: v.nodes.slice(0, 3).map((n) => {
          const target = n.target.join(" ");
          const summary = (n.failureSummary ?? "").replace(/\s+/g, " ").trim();
          const text = (n.html ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 70);
          return `${target} — "${text}" ${summary}`.trim();
        }),
      })),
      // axe's "incomplete" is not a pass. It is a rule that loaded, found candidate
      // elements, and then refused to decide — for `color-contrast`, because it could not
      // determine the background behind the text.
      //
      // On a page with a painted artwork layer behind the content that is *every*
      // heading and paragraph, so `/` and `/dialogue` return zero violations from axe
      // and the contrast risk there is entirely unchecked by axe. Recording the count
      // keeps that visible: an empty `incomplete` next to an empty `violations` is a
      // genuine clean page, and the two must not be able to look alike.
      incomplete: res.incomplete.map((i) => ({
        id: i.id,
        nodes: i.nodes.length,
      })),
    };
  });
  return result;
}

/**
 * Which state did this page actually render?
 *
 * The degraded-state test looks for the *words a user sees*, never for a technical
 * token. If it matched on `NEXT_PUBLIC_` or on `Firebase`, then a future copy edit
 * could make the audit quietly report "normal" on a page that is in fact broken — and
 * an audit that cannot fail is not an audit.
 */
async function detectState(page: Page): Promise<PageResult["renderedState"]> {
  return page.evaluate(() => {
    const text = document.body.innerText || "";
    const heading = document.querySelector("h1");
    const headingText = heading ? heading.textContent || "" : "";

    if (heading) return "normal";
    if (/غير متاح|not available|قريباً|soon/i.test(text)) return "firebase-degraded";
    if (text.trim().length < 40) return "empty";
    if (/جارٍ التحقق|جارٍ التحميل|\bloading\b/i.test(text) && text.trim().length < 160) {
      return "loading-stuck";
    }
    return "normal";
  });
}

/** Every internal link on the page, each one fetched. */
async function auditLinks(page: Page): Promise<PageResult["links"]> {
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
      .map((a) => a.getAttribute("href") ?? "")
      .filter((h) => h !== "" && !h.startsWith("#") && !/^(mailto|tel|javascript|data):/.test(h))
  );

  const results: PageResult["links"] = [];
  for (const href of [...new Set(hrefs)].slice(0, 30)) {
    const internal = href.startsWith("/");
    if (!internal) {
      results.push({ href, internal: false, status: null, broken: false });
      continue;
    }
    try {
      // maxRedirects: 0 so a 3xx is reported as a redirect rather than silently
      // followed — a link that 307s into a 404 is exactly the breakage to catch.
      //
      // The absolute URL matters: `page.request` does not inherit the context's
      // `baseURL`, so a bare "/wisdom" throws and every link on every page is reported
      // as broken. Eleven false P1s on a page whose links are all fine is the kind of
      // noise that gets an audit switched off.
      const res = await page.request.get(`${BASE_URL}${href}`, { timeout: 8000, maxRedirects: 0 });
      const status = res.status();
      results.push({ href, internal: true, status, broken: status >= 400 });
    } catch {
      results.push({ href, internal: true, status: null, broken: true });
    }
  }
  return results;
}

/* ── the keyboard walk ────────────────────────────────────────────────────── */

/** One control, as the keyboard inventory sees it. */
interface FocusEntry {
  /** Stable per-page index, used to match the Tab walk against this list. */
  index: number;
  selector: string;
  name: string;
}

/**
 * Numbers every focusable control on the page, in DOM order.
 *
 * ## Why indices and not selectors
 *
 * The obvious way to match a Tab walk against an inventory is to compare CSS selectors.
 * It does not work, and it fails in the most misleading direction possible: `describe()`
 * deliberately returns a *short* selector, so a list of twelve persona buttons all come
 * back as `button.group.items-start`. Every one of them matches the first walk hit, all
 * twelve are reported reachable, and the run reports no finding while the keyboard is in
 * fact skipping twelve controls. An audit that under-reports a real keyboard trap is
 * worse than one that over-reports noise, because the bug it hides is the one that makes
 * the product unusable without a mouse.
 *
 * A per-page numeric marker cannot collide.
 */
async function assignFocusIndexes(page: Page): Promise<FocusEntry[]> {
  return page.evaluate(() => {
    const INTERACTIVE =
      'a[href], button, input, select, textarea, [role="button"], [role="link"], ' +
      '[role="tab"], [role="switch"], [role="menuitem"], [role="checkbox"], ' +
      '[role="radio"], summary, [tabindex]:not([tabindex="-1"])';

    const audit = (window as unknown as { __miabAudit?: { describe: (el: Element) => string } })
      .__miabAudit;
    const describe = audit
      ? audit.describe
      : (el: Element) => el.tagName.toLowerCase();

    // Content inside a closed <details> is not rendered and not focusable, but Chrome
    // reports it as `display: block` with a real bounding box. Without this filter the
    // eleven "verify the source" links on /quotes enter the inventory, the Tab walk
    // correctly never reaches them, and the audit reports eleven unreachable links on a
    // page whose keyboard behaviour is correct.
    function insideClosedDetails(el: Element): boolean {
      const summary = el.closest("summary");
      let node: Element | null = el;
      while (node) {
        if (
          node.tagName === "DETAILS" &&
          !(node as HTMLDetailsElement).open &&
          !(summary && node.contains(summary))
        ) {
          return true;
        }
        node = node.parentElement;
      }
      return false;
    }

    const out: Array<{ index: number; selector: string; name: string }> = [];
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(INTERACTIVE));
    let index = 0;
    for (const el of nodes) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (Number(style.opacity) === 0) continue;
      if (el.getAttribute("aria-hidden") === "true") continue;
      if (insideClosedDetails(el)) continue;
      if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") continue;

      el.setAttribute("data-audit-focus", String(index));
      out.push({
        index,
        selector: describe(el),
        name: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40),
      });
      index += 1;
    }
    return out;
  });
}

/**
 * Presses real Tab keys and records the indices focus actually reached.
 *
 * ## Why this cannot live inside `page.evaluate`
 *
 * Dispatching a synthetic `KeyboardEvent` does not move focus. A browser moves focus as
 * the *default action* of a **trusted** key event; an untrusted event has no default
 * action to perform. So an in-page focus probe passes on pages that trap the keyboard —
 * the single most damaging accessibility defect a page can have, and the one no
 * screenshot can show.
 *
 * ## Why the walk is bounded but generous
 *
 * 400 presses is far more stops than any page here has. It terminates early in every
 * normal case: on `document.body`, meaning the tab order ran off the end into the
 * browser's own UI, or on focus failing to move at all.
 *
 * ## Why exceeding the inventory is a finding, not a silent pass
 *
 * If the walk reaches an index the inventory never assigned, the page has a focusable
 * element the probe missed. That is a measurement gap, and it is returned so the caller
 * can say so rather than reporting a clean result derived from an incomplete list.
 */
async function tabWalk(page: Page): Promise<{ reached: number[]; offInventory: number }> {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    window.scrollTo(0, 0);
  });

  const reached: number[] = [];
  let offInventory = 0;

  for (let i = 0; i < 400; i += 1) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active || active === document.body || active === document.documentElement) {
        return null;
      }
      const marker = active.getAttribute("data-audit-focus");
      if (marker === null) return { unknown: true, index: -1 };
      return { unknown: false, index: Number(marker) };
    });
    if (!info) break;
    if (info.unknown) {
      offInventory += 1;
      continue;
    }
    if (!reached.includes(info.index)) reached.push(info.index);
  }

  return { reached, offInventory };
}

/**
 * The controls the walk never reached.
 *
 * Deliberately a flat list of gaps rather than a "trapped" diagnosis: this function sees
 * one walk, and attributing a dozen gaps to a focus trap would be a claim the evidence
 * does not support. What it *can* say without guessing is that these controls are
 * unreachable — which is already a P1 on its own, because an unreachable button is a
 * button a keyboard user cannot use.
 */
function matchFocus(inventory: FocusEntry[], reached: number[]): Array<{ selector: string; name: string; reason: string }> {
  const seen = new Set(reached);
  return inventory
    .filter((entry) => !seen.has(entry.index))
    .map((entry) => ({
      selector: entry.selector,
      name: entry.name,
      reason: "never received focus in a 400-press Tab walk",
    }));
}

/* ── one page visit ───────────────────────────────────────────────────────── */

/**
 * Wait until the page is genuinely ready to be measured.
 *
 * This used to be `waitUntil: "networkidle"`, and that was wrong in a way that only
 * showed up once the app was fixed.
 *
 * `networkidle` means "no requests for 500ms". A correctly configured app holds requests
 * open forever: Firestore's `Listen` channel is a permanent long-poll by design. So the
 * moment the browser stopped believing Firebase was absent — the very P0 this audit
 * found — every visit timed out at 30s with zero characters recorded and the run
 * reported `ERR` on all 204 combinations. The instrument had been passing only because
 * the bug was suppressing the traffic that broke it.
 *
 * `networkidle` is also discouraged by Playwright as flaky, for the same class of reason:
 * it couples the audit's verdict to third-party and long-lived network state.
 *
 * What is waited for instead, in order, each for a reason:
 *
 * 1. `domcontentloaded` — the document exists. No third-party dependency.
 * 2. `html[data-hydrated="1"]` — set by `AppShell`'s mount effect. This is the signal
 *    that matters: before it React has attached no listeners, so an early click is a
 *    silent no-op and every interaction finding would be fiction. The app already
 *    publishes it for the e2e suite, and reusing it keeps one definition of "ready".
 * 3. `document.fonts.ready` — a webfont swap is a genuine layout shift and the single
 *    largest source of false CLS numbers. Bounded, because a stalled font CDN must not be
 *    able to fail a visit.
 * 4. A short settle, so LCP has finalised and framer-motion entrances have landed.
 *
 * Reaching hydration is reported rather than assumed: a page that never hydrates has no
 * probes, no clicks and no keyboard verdict, and that is a harness failure rather than a
 * clean page.
 *
 * Shared by the sweep and the interaction pass, because two definitions of "ready" would
 * let one pass click controls the other measured as absent.
 */
async function waitUntilReady(page: Page): Promise<{ hydrated: boolean; detail: string }> {
  await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });
  try {
    await page.waitForSelector('html[data-hydrated="1"]', { timeout: 20_000 });
  } catch {
    return {
      hydrated: false,
      detail: "the app never set html[data-hydrated], so React never mounted",
    };
  }
  await page
    .evaluate(() =>
      Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))])
    )
    .catch(() => undefined);
  await page.waitForTimeout(700);
  return { hydrated: true, detail: "" };
}

async function visit(browser: Browser, combo: Combination): Promise<PageResult> {
  const { route, viewport, theme, locale } = combo;

  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
    colorScheme: "dark",
    locale: locale === "ar" ? "ar-SA" : "en-US",
    reducedMotion: "no-preference",
  });

  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  const failedRequests: PageResult["failedRequests"] = [];

  /**
   * Is this failure the route doing what it is designed to do?
   *
   * `/god-mode-admin` answers 404 to everyone without a valid `miab_admin` cookie (D46),
   * and the browser logs that 404 as a console error. Without this filter the audit
   * reports a security control as a broken page on all 12 of its combinations — and the
   * obvious "fix" that follows from such a report is to make the admin page render,
   * which would delete the control.
   *
   * The same applies to `/membership` → 307 → `/pricing`. A redirect is not a failure.
   *
   * Scoped to `kind === "document"` deliberately: a 404 on the document is the route's
   * own answer, but a 404 on a stylesheet or an API call beneath it is still a defect,
   * and this filter must not be able to hide one.
   */
  function isDesignedFailure(url: string, status: number, kind: string): boolean {
    if (kind !== "document") return false;
    if (route.expectStatus === undefined) return false;
    if (status !== route.expectStatus) return false;
    const path = url.startsWith(BASE_URL) ? url.slice(BASE_URL.length).split("?")[0] : "";
    return path === route.path;
  }

  page.on("console", (msg: ConsoleMessage) => {
    const text = msg.text();
    if (msg.type() === "error") {
      // The Next dev-tools nudge exists in dev only and is not a page defect.
      if (/Download the React DevTools/i.test(text)) return;
      // Chromium logs "Failed to load resource: ... 404 (Not Found)" with no URL, so the
      // text alone cannot be matched against the route. It is attributed to the route's
      // own document only when that document's status is the expected one — see above.
      if (
        route.expectStatus !== undefined &&
        /Failed to load resource/i.test(text) &&
        new RegExp(`\\b${route.expectStatus}\\b`).test(text)
      ) {
        return;
      }
      consoleErrors.push(text.slice(0, 300));
    } else if (msg.type() === "warning") {
      consoleWarnings.push(text.slice(0, 200));
    }
  });

  page.on("pageerror", (err) => {
    consoleErrors.push(`[pageerror] ${err.message.slice(0, 300)}`);
  });

  page.on("requestfailed", (req) => {
    // An aborted prefetch or a cancelled beacon is normal navigation noise.
    const reason = req.failure()?.errorText ?? "";
    if (/ERR_ABORTED/.test(reason)) return;
    failedRequests.push({ url: req.url().slice(0, 160), status: 0, kind: reason });
  });

  page.on("response", (res) => {
    if (res.status() >= 400) {
      const url = res.url().slice(0, 160);
      const kind = res.request().resourceType();
      if (isDesignedFailure(url, res.status(), kind)) return;
      failedRequests.push({ url, status: res.status(), kind });
    }
  });

  await page.addInitScript({ content: INIT_SCRIPT });
  await page.addInitScript({ content: stateScript(theme, locale) });

  const result: PageResult = {
    route: route.path,
    viewport: viewport.name,
    theme,
    locale,
    status: null,
    finalUrl: "",
    textLength: 0,
    title: "",
    screenshot: null,
    probes: null,
    cls: null,
    lcpMs: null,
    lcpElement: null,
    topShiftSources: [],
    consoleErrors,
    consoleWarnings,
    failedRequests,
    axeViolations: [],
    axeIncomplete: [],
    links: [],
    renderedState: "normal",
    harnessFailure: null,
    focusStops: 0,
    focusInventory: 0,
    focusOffInventory: 0,
  };

  /**
   * Wait until the page is genuinely ready to be measured.
   *
   * This used to be `waitUntil: "networkidle"`, and that was wrong in a way that only
   * showed up once the app was fixed.
   *
   * `networkidle` means "no requests for 500ms". A correctly configured app holds
   * requests open forever: Firestore's `Listen` channel is a permanent long-poll by
   * design. So the moment the browser stopped believing Firebase was absent — the very
   * P0 this audit found — every visit timed out at 30s with zero characters recorded,
   * and the run reported `ERR` on all 204 combinations. The instrument had been passing
   * only because the bug was suppressing the traffic that broke it.
   *
   * `networkidle` is also discouraged by Playwright as flaky, for the same class of
   * reason: it couples the audit's verdict to third-party and long-lived network state.
   *
   * What is waited for instead, in order, each for a reason:
   *
   * 1. `domcontentloaded` — the document exists. No third-party dependency.
   * 2. `html[data-hydrated="1"]` — set by `AppShell`'s mount effect. This is the signal
   *    that matters: before it, React has attached no listeners, so an early click is a
   *    silent no-op and every interaction finding would be fiction. The app already
   *    publishes it for the e2e suite, and reusing it keeps one definition of "ready".
   * 3. `document.fonts.ready` — a webfont swap is a genuine layout shift and the single
   *    largest source of false CLS numbers. Bounded, because a stalled font CDN must not
   *    fail the visit.
   * 4. A short settle, so LCP has finalised and framer-motion entrances have landed.
   *
   * Reaching hydration is reported rather than assumed. A page that never hydrates has
   * no probes, no clicks and no keyboard verdict, and that is a harness failure, not a
   * clean page.
   *
   * Shared by the sweep and the interaction pass, because two definitions of "ready"
   * would let one pass click buttons the other measured as absent.
   */
  try {
    const res = await page.goto(`${BASE_URL}${route.path}`, {
      waitUntil: "commit",
      timeout: 30_000,
    });
    result.status = res?.status() ?? null;
    result.finalUrl = page.url();

    const ready = await waitUntilReady(page);
    if (!ready.hydrated) {
      // Set now so it survives the per-visit findings added below, which would otherwise
      // run first and bury it.
      result.harnessFailure = ready.detail;
    }

    result.title = await page.title();
    result.textLength = (await page.evaluate(() => document.body.innerText || "")).trim().length;
    result.renderedState = await detectState(page);

    const metrics = await page.evaluate(() => {
      const m = (
        window as unknown as {
          __miab?: { cls: number; lcp: number; lcpElement: string | null; shifts: Array<{ value: number; sources: string[] }> };
        }
      ).__miab;
      if (!m) return null;
      return { cls: m.cls, lcp: m.lcp, lcpElement: m.lcpElement, shifts: m.shifts };
    });
    if (metrics) {
      result.cls = Math.round(metrics.cls * 10000) / 10000;
      result.lcpMs = metrics.lcp ? Math.round(metrics.lcp) : null;
      result.lcpElement = metrics.lcpElement;
      result.topShiftSources = metrics.shifts
        .slice()
        .sort((a, b) => b.value - a.value)
        .slice(0, 3)
        .map((s) => `${s.value} ← ${s.sources.join(", ") || "unknown"}`);
    }

    // Screenshot before the Tab walk, which would paint focus rings over everything.
    const file = join(SHOTS_DIR, `${slug(combo)}.png`);
    await page.screenshot({ path: file, fullPage: SHOT_FULL_PAGE });
    result.screenshot = relative(process.cwd(), file).replace(/\\/g, "/");

    // A probe that throws is a broken audit, not a broken page. It is recorded as its
    // own finding at P0 and the sweep records *no* layout, contrast, clipping or
    // keyboard result for this combination, so the report cannot present a silent gap
    // as a passing one.
    let probes: ProbeResult | null = null;
    try {
      probes = await page.evaluate(runProbes);
    } catch (err) {
      result.consoleErrors.push(`[AUDIT-HARNESS] probes did not run: ${(err as Error).message.split("\n")[0]}`);
      result.harnessFailure = (err as Error).message.split("\n")[0] ?? "unknown";
    }
    result.probes = probes;

    // Diff the real Tab walk against the in-page inventory. An interactive control that
    // never receives focus is unreachable by keyboard — the inventory alone cannot say
    // which controls those are, and the walk alone cannot name them.
    const inventory = await assignFocusIndexes(page);
    const walk = await tabWalk(page);
    if (probes) {
      probes.focusGaps = matchFocus(inventory, walk.reached);
    }
    result.focusStops = walk.reached.length;
    result.focusInventory = inventory.length;
    result.focusOffInventory = walk.offInventory;

    try {
      const axe = await runAxe(page);
      result.axeViolations = axe.violations;
      result.axeIncomplete = axe.incomplete;
    } catch (err) {
      result.consoleErrors.push(`[axe] ${(err as Error).message.slice(0, 200)}`);
    }

    result.links = await auditLinks(page);
  } catch (err) {
    result.consoleErrors.push(`[visit] ${(err as Error).message.slice(0, 300)}`);
  } finally {
    await context.close();
  }

  result.consoleErrors = [...new Set(result.consoleErrors)];
  result.consoleWarnings = [...new Set(result.consoleWarnings)];
  return result;
}

/* ── the interactive pass ─────────────────────────────────────────────────── */

/** One control, as the audit found it. */
interface Control {
  idx: number;
  tag: string;
  text: string;
  href: string;
  /** True for a control that reveals more: `aria-expanded`, `<details>`, a menu button. */
  disclosure: boolean;
}

const CONTROL_SELECTOR =
  'button, a[href], [role="button"], [role="tab"], [role="switch"], summary, input[type="checkbox"]';

/**
 * Tags every clickable control with `data-audit-idx` and returns the inventory.
 *
 * ## Why elements are marked rather than clicked by position
 *
 * The obvious approach is `locator(selector).nth(i)`. It is wrong, and wrong in a way
 * that looks like coverage. The first click may open a dialog, which inserts controls into
 * the list, so every index after it points at a different element. The log then records a
 * long run of plausible-looking results, all of them testing the wrong thing. An attribute
 * marker survives re-rendering, so index 7 is always the same control.
 *
 * ## What is excluded, and why
 *
 * - `display: none` / zero-size: not clickable by a finger, so clicking it tests nothing.
 * - `aria-hidden`: outside the accessibility tree by definition.
 * - `type="submit"`: would post credentials to a backend that does not exist. This audit
 *   asks whether a control *responds*, not what it transmits — posting a fake password
 *   would create a security finding out of nothing.
 */
async function stampControls(page: Page): Promise<Control[]> {
  return page.evaluate((selector: string) => {
    const out: Array<{
      idx: number;
      tag: string;
      text: string;
      href: string;
      disclosure: boolean;
    }> = [];
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
    let idx = 0;
    for (const el of nodes) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;
      if (el.getAttribute("aria-hidden") === "true") continue;
      if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") continue;
      if ((el.getAttribute("type") ?? "") === "submit") continue;

      el.setAttribute("data-audit-idx", String(idx));
      out.push({
        idx,
        tag: el.tagName.toLowerCase(),
        text: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40),
        href: el.getAttribute("href") ?? "",
        disclosure:
          el.hasAttribute("aria-expanded") || el.tagName === "SUMMARY" || el.hasAttribute("aria-controls"),
      });
      idx += 1;
    }
    return out;
  }, CONTROL_SELECTOR);
}

/**
 * Makes sure control `idx` is present and clickable, reloading if it is not.
 *
 * ## Why this exists
 *
 * Clicking a drawer toggle, a "more" button, or a riddle reveal re-renders the tree and
 * every `data-audit-idx` marker is destroyed. The obvious failure — treating the next
 * click's `scrollIntoViewIfNeeded` timeout as "this control does not work" — produces a
 * report claiming a dozen broken buttons on a page where every button works. That is the
 * worst output this harness can produce, because it looks exactly like a real finding.
 *
 * So: if the marker is gone, reload and re-stamp, and only then judge.
 *
 * ## Why a control absent even after a reload is skipped, and counted
 *
 * It means the control only exists inside a collapsed disclosure. Clicking it from a clean
 * load is impossible, so skipping is correct — but silently skipping would mean the report
 * claims coverage it does not have. The count is returned so `main` can state it.
 */
async function ensureClickable(
  page: Page,
  route: string,
  idx: number
): Promise<"ready" | "needs-reload" | "absent"> {
  const sel = `[data-audit-idx="${idx}"]`;

  if ((await page.locator(sel).count()) === 0) {
    // The tree was rebuilt by a previous click, so the marker is gone. Reload.
    await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(400);
    await stampControls(page);
    if ((await page.locator(sel).count()) === 0) return "absent";
    return "needs-reload";
  }

  // The marker survived, but a dialog opened by the previous click may still be on
  // top. The riddle overlay is `z-[9998]` over the whole viewport with `aria-modal`, so a
  // symbol button beneath it is present, visible, and unclickable. Playwright reports
  // that as a click timeout, which is indistinguishable from a genuinely dead button
  // unless the harness closes the overlay first — and a false "this button is broken"
  // on a page where every button works is the most damaging thing this tool can print.
  const modal = page.locator('[role="dialog"][aria-modal="true"], dialog[open]');
  if ((await modal.count()) > 0 && (await modal.first().isVisible().catch(() => false))) {
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.waitForTimeout(400);
    // Escape is the conventional dismissal, but not every dialog honours it.
    if (await modal.first().isVisible().catch(() => false)) {
      await modal.first().click({ position: { x: 5, y: 5 }, timeout: 2000 }).catch(() => undefined);
      await page.waitForTimeout(400);
    }
    // Still open: reload rather than judge a control through a scrim.
    if (await modal.first().isVisible().catch(() => false)) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => undefined);
      await page.waitForTimeout(400);
      await stampControls(page);
      return (await page.locator(sel).count()) > 0 ? "needs-reload" : "absent";
    }
  }

  return "ready";
}

/**
 * Click every control on a route and record what breaks.
 *
 * ## What counts as a failure
 *
 * - a console or page error produced by the click
 * - a click that times out **while the element is still in the DOM** — the shape of
 *   "the button looks enabled and is not"
 * - a navigation to a URL outside the audited route set: a wrong page, not merely a bad one
 * - a `target="_blank"` click that opens a popup to nowhere
 * - a disclosure button whose `aria-expanded` does not flip, i.e. it reveals nothing
 *
 * ## Coverage is reported, never assumed
 *
 * The return value includes `clicked` and `skippedBehindDisclosure`, so a run can say "every
 * control on `/enter` was clicked" and be believed, or say "3 controls live inside a
 * collapsed drawer" and be believed too.
 */
async function interact(
  browser: Browser,
  route: RouteSpec,
  viewport: Viewport
): Promise<{ findings: Finding[]; clicked: number; skipped: number }> {
  const findings: Finding[] = [];
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
    colorScheme: "dark",
  });
  const page = await context.newPage();

  const known = new Set(ROUTES.map((r) => r.path));
  const add = (f: Omit<Finding, "route" | "viewport" | "theme" | "locale" | "occurrences">) =>
    findings.push({
      ...f,
      route: route.path,
      viewport: viewport.name,
      theme: "dark",
      locale: "ar",
      occurrences: 1,
    });

  let clicked = 0;
  let skipped = 0;

  try {
    await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "commit", timeout: 30_000 });
    const ready = await waitUntilReady(page);
    if (!ready.hydrated) {
      // No listeners are attached, so every click below would be a silent no-op and
      // every "this control does nothing" finding would be fabricated.
      throw new Error(ready.detail);
    }
    const controls = (await stampControls(page)).slice(0, MAX_CONTROLS);

    for (const control of controls) {
      const state = await ensureClickable(page, route.path, control.idx);
      if (state === "absent") {
        skipped += 1;
        continue;
      }

      const before = page.url();
      const errors: string[] = [];
      // Held in an object: TypeScript narrows a `let` only ever assigned inside a closure
      // back to `null`, and types the truthy branch as `never`. The runtime is fine; only
      // the type is wrong, and `!` would hide that rather than fix it.
      const popup: { url: string | null } = { url: null };
      const onConsole = (msg: ConsoleMessage) => {
        if (msg.type() === "error") errors.push(msg.text().slice(0, 200));
      };
      const onError = (err: Error) => errors.push(`[pageerror] ${err.message.slice(0, 200)}`);
      const onPopup = (p: Page) => {
        popup.url = p.url();
        void p.close().catch(() => undefined);
      };
      page.on("console", onConsole);
      page.on("pageerror", onError);
      page.on("popup", onPopup);

      const beforeExpanded = control.disclosure
        ? await page.locator(`[data-audit-idx="${control.idx}"]`).getAttribute("aria-expanded")
        : null;

      try {
        const locator = page.locator(`[data-audit-idx="${control.idx}"]`);
        await locator.scrollIntoViewIfNeeded({ timeout: 3000 });
        await locator.click({ timeout: 4000 });
        // Let a navigation or a dialog land before judging it.
        await page.waitForTimeout(400);
        clicked += 1;
      } catch (err) {
        const message = (err as Error).message.split("\n")[0] ?? "";
        // Only a genuine "present but unresponsive" is a product defect. A detached
        // element is the harness's problem, and `ensureClickable` already ruled that out.
        if (/intercepts pointer|element is not enabled|Timeout .*exceeded/i.test(message)) {
          add({
            severity: "P1",
            id: `unresponsive-control:${route.path}:${control.tag}:${control.text}`,
            title: `«${control.text || control.tag}» لا يستجيب`,
            evidence: `${message} — العنصر موجود في الصفحة لكن النقر لم يُنفَّذ`,
          });
        }
      } finally {
        page.off("console", onConsole);
        page.off("pageerror", onError);
        page.off("popup", onPopup);
      }

      for (const err of errors) {
        add({
          severity: "P1",
          id: `click-console-error:${route.path}:${control.tag}:${control.text}:${err.slice(0, 40)}`,
          title: `خطأ في الطرفية عند الضغط على «${control.text || control.tag}»`,
          evidence: err,
        });
      }

      // Only a popup *to our own unknown route* is a defect. A quote's "verify the
      // source" link opening classics.mit.edu in a new tab is the feature working, and
      // the first version of this check flagged all eleven of them as broken
      // destinations — which would have "fixed" the product by removing citation links.
      if (popup.url && popup.url.startsWith(BASE_URL)) {
        const target = popup.url.replace(BASE_URL, "") || "/";
        if (!known.has(target.split("?")[0] ?? "")) {
          add({
            severity: "P1",
            id: `popup-unknown-route:${route.path}:${target}`,
            title: `«${control.text || control.tag}» يفتح نافذة إلى مسار غير معروف`,
            evidence: `popup → ${popup.url}`,
          });
        }
      }

      // A disclosure that does not open is worse than no disclosure: it advertises
      // something is behind it and then lies.
      if (control.disclosure && beforeExpanded !== null) {
        const afterExpanded = await page
          .locator(`[data-audit-idx="${control.idx}"]`)
          .getAttribute("aria-expanded")
          .catch(() => null);
        if (afterExpanded === beforeExpanded) {
          add({
            severity: "P1",
            id: `disclosure-noop:${route.path}:${control.text || control.idx}`,
            title: `«${control.text || "زر"}» يقول إنه يفتح شيئاً ولا يفتح`,
            evidence: `aria-expanded stayed "${beforeExpanded}" after the click`,
          });
        }
      }

      const after = page.url();
      if (after !== before) {
        const clean = (after.replace(BASE_URL, "").split("#")[0] ?? "/").split("?")[0] ?? "/";
        if (!known.has(clean)) {
          add({
            severity: "P1",
            id: `wrong-destination:${route.path}:${clean}`,
            title: `«${control.text || control.tag}» ينتقل إلى صفحة خاطئة`,
            evidence: `${route.path} → ${after}، وهي ليست أحد المسارات المفحوصة`,
          });
        }
        const status = await page.request
          .get(after.replace(BASE_URL, ""), { timeout: 8000, maxRedirects: 0 })
          .catch(() => null);
        if (status && status.status() >= 400) {
          add({
            severity: "P1",
            id: `click-lands-404:${route.path}:${control.text}:${status.status()}`,
            title: `«${control.text || control.tag}» ينتهي في صفحة ${status.status()}`,
            evidence: `${route.path} → ${after} (${status.status()})`,
          });
        }
      }
    }
  } catch (err) {
    add({
      severity: "P1",
      id: `interact-failed:${route.path}`,
      title: "تعذّر الفحص التفاعلي لهذه الصفحة",
      evidence: (err as Error).message.split("\n")[0] ?? "",
    });
  } finally {
    await context.close();
  }

  return { findings, clicked, skipped };
}

/* ── classification ───────────────────────────────────────────────────────── */

/**
 * Turn one page result into findings.
 *
 * ## Severity is about consequence to a user, not about which tool found it
 *
 * An axe `critical` violation is not automatically P0. axe calls something critical
 * when it is likely to block assistive-technology use; that is serious, but P0 here is
 * reserved for "a person cannot use the product at all" — a page that does not render, a
 * crash on every load, a form that cannot be submitted. Calling every axe critical a P0
 * buries the real P0s.
 *
 * The opposite error is worse: downgrading a keyboard trap to P3 because no tool called
 * it critical. Those block real users every single day. Each mapping below names the
 * person it blocks.
 */
function classify(result: PageResult, route: RouteSpec): Finding[] {
  const findings: Finding[] = [];
  const add = (f: Omit<Finding, "route" | "viewport" | "theme" | "locale" | "occurrences">) =>
    findings.push({
      ...f,
      route: result.route,
      viewport: result.viewport,
      theme: result.theme,
      locale: result.locale,
      occurrences: 1,
    });

  /* the page did not load.
     `expectStatus` exists because a 404 can be the *correct* answer: `/god-mode-admin`
     is gated behind a signed cookie and is meant to look like it does not exist (D46).
     Flagging that as a P0 would be the audit calling a security control a defect, and
     the tempting "fix" would be to make the admin page render for anyone. */
  const expected = route.expectStatus ?? null;
  if (result.status !== null && result.status >= 400 && result.status !== expected) {
    add({
      severity: "P0",
      id: `http-${result.status}:${result.route}`,
      title: `الصفحة ترجع ${result.status}`,
      evidence: `${result.route} → ${result.status}${expected ? ` (المتوقع ${expected})` : ""}`,
      screenshot: result.screenshot ?? undefined,
    });
  }

  if (result.status === null) {
    add({
      severity: "P0",
      id: `no-response:${result.route}`,
      title: "الصفحة لا تستجيب",
      evidence: `no response from ${result.finalUrl}`,
    });
  }

  /* it loaded but is empty */
  if (
    result.status !== null &&
    result.status < 400 &&
    result.textLength < 40 &&
    !route.expectRedirect
  ) {
    add({
      severity: "P0",
      id: `empty-page:${result.route}`,
      title: "الصفحة شبه فارغة",
      evidence: `${result.textLength} characters of visible text at ${result.viewport}/${result.theme}/${result.locale}`,
      screenshot: result.screenshot ?? undefined,
    });
  }

  /* the audit's own instrumentation failed — reported before anything else, because
     every finding below this point is missing rather than clean */
  if (result.harnessFailure) {
    add({
      severity: "P0",
      id: `harness-failure:${result.route}:${result.viewport}`,
      title: "أداة الفحص نفسها لم تعمل على هذه الصفحة",
      evidence:
        `${result.harnessFailure} — نتائج الفحص لهذه التركيبة ناقصة، لا سليمة. ` +
        `هذا عطل في أداة الفحص لا في التطبيق.`,
      screenshot: result.screenshot ?? undefined,
    });
  }

  /**
   * The keyboard inventory and the walk disagreed about what exists.
   *
   * `focusOffInventory` counts controls the inventory expected to reach but the Tab walk
   * never stopped on. It was being recorded on every combination and then read by nobody,
   * which is the worst place for a number: it looks like diligence in the JSON and
   * contributes nothing to the report.
   *
   * Non-zero is a harness failure, not an app finding — the same reasoning as
   * `harnessFailure`. A mismatch means the two halves disagree about the page, so *every*
   * keyboard verdict for that combination is unreliable, and reporting those verdicts
   * would be reporting noise. Silence is the dangerous reading here: "0 keyboard gaps"
   * derived from an inventory that never matched would be indistinguishable from a page
   * that is genuinely perfect.
   */
  if (result.focusOffInventory > 0) {
    add({
      severity: "P0",
      id: `harness-focus-mismatch:${result.route}:${result.viewport}:${result.theme}:${result.locale}`,
      title: "أداة الفحص لم تتفق مع نفسها حول لوحة المفاتيح",
      evidence:
        `${result.focusOffInventory} من ${result.focusInventory} عنصراً متوقعاً لم يصل إليه التنقل ` +
        `(${result.focusStops} محطة). النتائج esta التركيبة غير موثوقة — عطل في الأداة.`,
      screenshot: result.screenshot ?? undefined,
    });
  }

  /* console errors */
  for (const err of result.consoleErrors) {
    // A hydration mismatch means the server HTML and the client render disagree, which
    // on this app means a visible flash and often a wrong first paint of the *body*. That
    // is a functional defect, not a warning.
    const fatal = /hydrat|Minified React error|Uncaught|is not a function|Cannot read|Unhandled/i.test(err);
    add({
      severity: fatal ? "P0" : "P1",
      id: `console:${err.slice(0, 70)}`,
      title: fatal ? "خطأ في الطرفية يمنع عمل الصفحة" : "خطأ في طرفية المتصفح",
      evidence: err,
      screenshot: result.screenshot ?? undefined,
    });
  }

  /* failed requests */
  for (const req of result.failedRequests) {
    const severity: Severity =
      req.status >= 500 || req.kind === "document" || req.kind === "script"
        ? "P1"
        : req.status >= 400 && req.kind !== "image" && req.kind !== "font"
          ? "P2"
          : "P3";
    add({
      severity,
      id: `request-${req.status || "fail"}:${req.url}`,
      title: "طلب فاشل",
      evidence: `${req.status || req.kind} ${req.url}`,
    });
  }

  /* horizontal scroll — an explicit acceptance criterion */
  const hs = result.probes?.horizontalScroll;
  if (hs && hs.scrollWidth > hs.innerWidth + 1) {
    const worst = result.probes?.overflow[0];
    add({
      severity: "P1",
      id: `horizontal-scroll:${result.viewport}:${result.theme}:${result.locale}:${worst?.selector ?? "unknown"}`,
      title: "تمرير أفقي",
      evidence:
        `scrollWidth ${hs.scrollWidth} > innerWidth ${hs.innerWidth}. ` +
        `السبب: ${worst?.selector ?? "لم يُعزل"} (${worst?.overflowPx ?? "?"}px خارج الحافة)`,
      screenshot: result.screenshot ?? undefined,
    });
  }

  /* contrast */
  for (const c of result.probes?.contrast ?? []) {
    add({
      severity: c.ratio < 3 ? "P1" : "P2",
      id: `contrast:${c.selector}:${c.ratio}`,
      title: "تباين نص غير كافٍ",
      evidence: `${c.ratio}:1 (المطلوب ${c.required}:1) - "${c.text}" ${c.fontSizePx}px/${c.fontWeight} ${c.foreground} على ${c.background}`,
      screenshot: result.screenshot ?? undefined,
    });
  }

  /**
   * Text whose contrast nothing measured, stated as a gap rather than swallowed.
   *
   * A gradient behind text cannot be composited into one colour, so the probe skips it
   * and defers to axe. Reporting only the failures would make "skipped" and "passed"
   * indistinguishable in the report — and a skipped element is precisely where a contrast
   * problem would be chosen to hide. axe gets the verdict where it can; the count is
   * here so a reader knows how much of the page was left to it.
   */
  const unmeasured = result.probes?.contrastUnmeasured ?? 0;
  if (unmeasured > 0) {
    const axeSawIt = (result.axeIncomplete ?? []).some(
      (i) => i.id === "color-contrast",
    );
    add({
      severity: "P3",
      id: `contrast-unmeasured:${result.route}:${result.viewport}:${result.theme}:${result.locale}`,
      title: "تباين غير مقيس خلف تدرّج لوني",
      evidence:
        `${unmeasured} عنصراً نصياً فوق تدرّج — لم يقسه أي فحص. ` +
        (axeSawIt
          ? `تركّز axe نفسه على ${result.axeIncomplete?.find((i) => i.id === "color-contrast")?.nodes} عنصراً.`
          : `لم يسجّل axe أياً منها غير محسوم.`),
      screenshot: result.screenshot ?? undefined,
    });
  }

  /* clipped text */
  for (const t of result.probes?.clipped ?? []) {
    add({
      severity: t.kind === "zero-height" ? "P1" : "P2",
      id: `clipped:${t.kind}:${t.selector}`,
      title: t.kind === "truncated-ellipsis" ? "نص مقصوص" : "نص خارج عن إطاره",
      evidence: `"${t.text}" — ${t.detail}`,
      screenshot: result.screenshot ?? undefined,
    });
  }

  /* keyboard unreachable */
  for (const g of result.probes?.focusGaps ?? []) {
    add({
      severity: "P1",
      id: `focus-gap:${g.selector}`,
      title: "عنصر لا يمكن الوصول إليه بلوحة المفاتيح",
      evidence: `${g.selector} ("${g.name}") — ${g.reason}`,
      screenshot: result.screenshot ?? undefined,
    });
  }

  for (const u of result.probes?.unnamed ?? []) {
    add({
      severity: "P1",
      id: `unnamed-control:${u.selector}`,
      title: "عنصر تفاعلي بلا اسم مخصص",
      evidence: `${u.selector} — ${u.reason}`,
      screenshot: result.screenshot ?? undefined,
    });
  }

  for (const img of result.probes?.imagesMissingAlt ?? []) {
    add({
      severity: "P2",
      id: `img-no-alt:${img}`,
      title: "صورة بلا سمة بديلة",
      evidence: img,
    });
  }

  for (const text of result.probes?.mojibake ?? []) {
    // P0, not P1. Every other check in this file passed over the corrupted text:
    // the glyphs are real Latin-1 letters, so they carry a font, a passing contrast
    // ratio and a real bounding box. A page whose every word is unreadable is worse
    // than a page that fails to load, because it looks like it worked.
    add({
      severity: "P0",
      id: `mojibake:${text.slice(0, 40)}`,
      title: "نص عربي معطوب يظهر كحروف لاتينية",
      evidence:
        `النص المقروء هو "${text}" لكنه محفوظ بعد مرور بالنظام cp1252، فيعرضه المتصفح كحروف ` +
        `لاتينية. النص يبدو مقروءاً للآلة: له خط ولون ونسبة تباين، لذلك لم ترصده أي أداة أخرى.`,
    });
  }

  for (const h of result.probes?.headingOrder ?? []) {
    add({
      severity: "P3",
      id: `heading:${h}`,
      title: "ترتيب العناوين غير سليم",
      evidence: h,
    });
  }

  for (const t of result.probes?.tapTargets ?? []) {
    add({
      severity: t.width < 24 || t.height < 24 ? "P2" : "P3",
      id: `tap-target:${t.selector}:${t.width}x${t.height}`,
      title: "هدف لمس أصغر من اللازم",
      evidence: `${t.selector} is ${t.width}×${t.height} ("${t.text}")`,
    });
  }

  /* axe */
  for (const v of result.axeViolations) {
    const severity: Severity = v.impact === "critical" ? "P1" : v.impact === "serious" ? "P2" : "P3";
    add({
      severity,
      id: `axe:${v.id}`,
      title: `مخالفة axe: ${v.help}`,
      evidence: `${v.id} (${v.impact}) على ${v.nodes} عنصر — ${v.samples.join(" · ")}`,
      screenshot: result.screenshot ?? undefined,
    });
  }

  /* broken internal links */
  for (const l of result.links) {
    if (l.internal && l.broken) {
      add({
        severity: "P1",
        id: `broken-link:${l.href}`,
        title: "رابط داخلي معطوب",
        evidence: `${result.route} → ${l.href} (${l.status ?? "no response"})`,
      });
    }
  }

  /* performance */
  if (result.cls !== null && result.cls > 0.1) {
    add({
      severity: result.cls > 0.25 ? "P1" : "P2",
      id: `cls:${result.route}:${result.cls.toFixed(3)}`,
      title: "ازاحة تخطيط (CLS)",
      evidence:
        `CLS ${result.cls.toFixed(4)} على ${result.finalUrl}` +
        (result.topShiftSources.length ? ` —_sources: ${result.topShiftSources.join(" | ")}` : ""),
      screenshot: result.screenshot ?? undefined,
    });
  }

  if (result.lcpMs !== null && result.lcpMs > 2500) {
    add({
      severity: result.lcpMs > 4000 ? "P1" : "P2",
      id: `lcp:${result.route}:${result.lcpMs}`,
      title: "أبطأ رسم للمحتوى (LCP)",
      evidence: `LCP ${result.lcpMs}ms — العنصر: ${result.lcpElement ?? "غير معروف"}`,
      screenshot: result.screenshot ?? undefined,
    });
  }

  void route;
  return findings;
}

/**
 * Collapse per-combination findings into per-defect ones.
 *
 * Without this, one over-wide element produces twelve identical rows and a report of
 * three hundred lines that hides the four real problems. `occurrences` is preserved, and
 * a merged finding's severity is **raised** if it appeared more than once: a defect in
 * every theme is worse than one seen once, and the severity should say so.
 */
function mergeFindings(findings: Finding[]): Finding[] {
  const byId = new Map<string, Finding>();
  const order: Severity[] = ["P0", "P1", "P2", "P3"];
  for (const f of findings) {
    const existing = byId.get(f.id);
    if (!existing) {
      byId.set(f.id, { ...f });
      continue;
    }
    existing.occurrences += 1;
    if (order.indexOf(f.severity) < order.indexOf(existing.severity)) {
      existing.severity = f.severity;
    }
    if (!existing.screenshot && f.screenshot) existing.screenshot = f.screenshot;
  }
  return [...byId.values()];
}

/* ── the report ───────────────────────────────────────────────────────────── */

function renderReport(
  results: PageResult[],
  sweep: Finding[],
  interaction: Finding[],
  startedAt: number,
  interactionCoverage: { clicked: number; skipped: number }
): string {
  const merged = mergeFindings([...sweep, ...interaction]);
  const order: Severity[] = ["P0", "P1", "P2", "P3"];
  merged.sort(
    (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || b.occurrences - a.occurrences
  );

  const duration = ((Date.now() - startedAt) / 1000).toFixed(0);
  const L: string[] = [];

  L.push("# AUDIT-UI — فحص الواجهة كما يراه المستخدم");
  L.push("");
  L.push(
    `فحص آلي بمتصفح حقيقي. **${results.length} زيارة** = ${ROUTES.length} مسار × ` +
      `${VIEWPORTS.length} نافذة × 2 ثيم × 2 لغة، إضافة إلى مرور تفاعلي فوق كل زر ورابط. المدة ${duration}ث.`
  );
  L.push("");
  L.push(
    "**مصدر المسارات:** `src/lib/nav.ts` (`INDEXABLE_ROUTES`) — لا `sitemap.xml`. " +
      "الـ sitemap يستبعد `/account` عمداً ويُسقط مسارات Firebase الثلاثة حين لا تكون مهيّأة " +
      "(القاعدة D66)، فقراءة منه كانت ستُسقط `/enter` و`/tracker` و`/journal` من الفحص — " +
      "وهي بالضبط الصفحات التي تعرض حالتها المتدهورة الآن. هذا الفحص يجيب «ما الذي يصل إليه " +
      "مستخدم؟»، لا «ماذا نريد لمحرك بحث أن يراه؟»."
  );
  L.push("");

  /* summary */
  L.push("## الخلاصة");
  L.push("");
  L.push("| | العدد |");
  L.push("|---|---|");
  for (const s of order) {
    L.push(`| **${s}** | ${merged.filter((f) => f.severity === s).length} |`);
  }
  L.push("");
  const ok = results.filter((r) => r.status !== null && r.status < 400);
  const consoleErr = results.filter((r) => r.consoleErrors.length > 0);
  const failedReq = results.filter((r) => r.failedRequests.length > 0);
  const hscroll = results.filter(
    (r) => (r.probes?.horizontalScroll.scrollWidth ?? 0) > (r.probes?.horizontalScroll.innerWidth ?? 0) + 1
  );
  L.push(
    `زيارات ناجحة **${ok.length}/${results.length}** · ` +
      `زيارات فيها خطأ طرفية **${consoleErr.length}** · ` +
      `زيارات فيها طلب فاشل **${failedReq.length}** · ` +
      `زيارات فيها تمرير أفقي **${hscroll.length}** · ` +
      `مخالفات axe **${new Set(results.flatMap((r) => r.axeViolations.map((v) => v.id))).size} نوع`
  );
  L.push("");
  L.push(
    `الضغط التفاعلي: **${interactionCoverage.clicked} ضغطة** على أزرار وروابط وحوافز. ` +
      (interactionCoverage.skipped > 0
        ? `و**${interactionCoverage.skipped} عنصراً** لم يُضغط لأنه لا يوجد إلا داخل قائمة مطويّة على حالة تحميل نظيفة — ` +
          `وهذا رقم مُعلن لا مُخفى، حتى لا يُقرأ التقرير كتغطية كاملة وهو ليس كذلك.`
        : `وكل عنصر كان قابلاً للضغط على حالة تحميل نظيفة.`)
  );
  L.push("");

  /* coverage — so "covers every route in 12 combinations" is checkable by reading */
  L.push("## التغطية — كل مسار في 12 تركيبة");
  L.push("");
  L.push("| المسار | 360 داكن/ع | 360 فاتح/ع | 360 داكن/en | 360 فاتح/en | 768 داكن/ع | 768 فاتح/en | 1440 داكن/ع | 1440 فاتح/en | الحالة |");
  L.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const route of ROUTES) {
    const mine = results.filter((r) => r.route === route.path);
    const cell = (vp: string, th: Theme, lo: Locale): string => {
      const r = mine.find((x) => x.viewport === vp && x.theme === th && x.locale === lo);
      if (!r) return "—";
      if (r.status === null) return "✗ لا رد";
      if (route.expectStatus !== undefined) {
        // A route with a declared expected status is judged against it, not against 200.
        return r.status === route.expectStatus ? "✓ كما هو متوقّع" : `✗ ${r.status}`;
      }
      if (r.status >= 400) return `✗ ${r.status}`;
      if (r.textLength < 40) return "✗ فارغ";
      if (r.consoleErrors.length > 0) return "⚠ خطأ";
      return "✓";
    };
    const allDegraded = mine.length > 0 && mine.every((r) => r.renderedState === "firebase-degraded");
    L.push(
      `| \`${route.path}\` | ${cell("mobile-360", "dark", "ar")} | ${cell("mobile-360", "light", "ar")} | ` +
        `${cell("mobile-360", "dark", "en")} | ${cell("mobile-360", "light", "en")} | ` +
        `${cell("tablet-768", "dark", "ar")} | ${cell("tablet-768", "light", "en")} | ` +
        `${cell("desktop-1440", "dark", "ar")} | ${cell("desktop-1440", "light", "en")} | ` +
        `${allDegraded ? "بلا Firebase" : "طبيعي"} |`
    );
  }
  L.push("");
  L.push("`✓` صفحة كاملة · `⚠` تعمل لكن بخطأ في الطرفية · `✗` عطل · `✓ كما هو متوقّع` = المسار يردّ بالحالة التي وُصف بها في خريطة المسارات (مثل `/god-mode-admin` الذي يرجع 404 عمداً لأنه محجوب) · «بلا Firebase» = الصفحة تعرض شاشة «غير متاح» لأن مفاتيح التهيئة غير موجودة.");
  L.push("");

  /* findings */
  L.push("## العيوب مرتّبة بالأولوية");
  L.push("");
  if (merged.length === 0) {
    L.push("لا عيوب في P0–P3.");
    L.push("");
  }
  for (const s of order) {
    const group = merged.filter((f) => f.severity === s);
    if (group.length === 0) continue;
    L.push(`### ${s} — ${group.length} عيباً`);
    L.push("");
    L.push("| المسار | النافذة | الوصف | الدليل | لقطة | عدد التركيبات |");
    L.push("|---|---|---|---|---|---|");
    for (const f of group) {
      const shot = f.screenshot ? `![${f.id}](${f.screenshot})` : "—";
      L.push(
        `| \`${f.route}\` | ${f.viewport} | ${f.title} | ${f.evidence.replace(/\|/g, "\\|")} | ${shot} | ${f.occurrences} |`
      );
    }
    L.push("");
  }

  /* performance */
  L.push("## الأداء لكل تركيبة");
  L.push("");
  L.push("| المسار | النافذة | الثيم | اللغة | CLS | LCP (ms) | عنصر LCP |");
  L.push("|---|---|---|---|---|---|---|");
  for (const r of results) {
    if (r.cls === null && r.lcpMs === null) continue;
    L.push(
      `| \`${r.route}\` | ${r.viewport} | ${r.theme} | ${r.locale} | ` +
        `${r.cls === null ? "—" : r.cls.toFixed(4)} | ${r.lcpMs ?? "—"} | ${r.lcpElement ?? "—"} |`
    );
  }
  L.push("");

  /* axe detail */
  const axeKinds = new Map<string, { impact: string; routes: Set<string>; nodes: number; samples: string[] }>();
  for (const r of results) {
    for (const v of r.axeViolations) {
      const cur = axeKinds.get(v.id) ?? { impact: v.impact, routes: new Set<string>(), nodes: 0, samples: [] };
      cur.routes.add(r.route);
      cur.nodes = Math.max(cur.nodes, v.nodes);
      for (const s of v.samples) {
        if (cur.samples.length < 4 && !cur.samples.includes(s)) cur.samples.push(s);
      }
      axeKinds.set(v.id, cur);
    }
  }
  if (axeKinds.size > 0) {
    L.push("## مخالفات axe بالتفصيل");
    L.push("");
    L.push("| القاعدة | الأثر | عدد العناصر | المسارات |");
    L.push("|---|---|---|---|");
    for (const [id, v] of [...axeKinds.entries()].sort((a, b) =>
      order.indexOf(a[1].impact as Severity) - order.indexOf(b[1].impact as Severity)
    )) {
      L.push(`| \`${id}\` | ${v.impact} | ${v.nodes} | ${[...v.routes].map((r) => `\`${r}\``).join(" ")} |`);
    }
    L.push("");
    L.push("<details><summary>العناصر المخالفة كما يسمّيها axe</summary>");
    L.push("");
    for (const [id, v] of axeKinds.entries()) {
      L.push(`**\`${id}\`**`);
      L.push("");
      for (const s of v.samples) L.push(`- ${s}`);
      L.push("");
    }
    L.push("</details>");
    L.push("");
  }

  /**
   * What axe refused to judge.
   *
   * Written out because the alternative reading is the dangerous one. A page with a
   * painted artwork layer behind its text gives axe no background to compare against, so
   * axe returns zero `color-contrast` violations — and an audit that reported only
   * violations would present those pages as contrast-verified. They are not verified by
   * axe; they are measured by the probe in `probes.ts`, which composites the CSS layers
   * and so cannot see the artwork itself. Both tools have a blind spot and this table is
   * where they meet.
   */
  const axeUndecided = new Map<string, { routes: Set<string>; maxNodes: number }>();
  for (const r of results) {
    for (const inc of r.axeIncomplete ?? []) {
      const cur = axeUndecided.get(inc.id) ?? { routes: new Set<string>(), maxNodes: 0 };
      cur.routes.add(r.route);
      cur.maxNodes = Math.max(cur.maxNodes, inc.nodes);
      axeUndecided.set(inc.id, cur);
    }
  }
  if (axeUndecided.size > 0) {
    L.push("## ما لم يحكم عليه axe");
    L.push("");
    L.push(
      "هذه ليست نجاحاً. هذه قواعد حمِّلها axe ثم رفض الحكم عليها — في `color-contrast` " +
        "لأنه لم يستطع تحديد الخلفية خلف النص، وهو ما يحدث خلف طبقات اللوحات المصوّرة. " +
        "قياس التباين على هذه المسارات مسؤول عن `probes.ts` في `scripts/audit/`."
    );
    L.push("");
    L.push("| القاعدة | أكبر عدد عناصر لم يُحسم | المسارات |");
    L.push("|---|---|---|");
    for (const [id, v] of axeUndecided) {
      L.push(
        `| \`${id}\` | ${v.maxNodes} | ${[...v.routes].map((r) => `\`${r}\``).join(" ")} |`
      );
    }
    L.push("");
  }

  /* rerun */
  L.push("## كيف أُعيد الفحص");
  L.push("");
  L.push("```bash");
  L.push("npm run build && npx next start -p 3000      # في نافذة طرفية أخرى");
  L.push("npm run audit:ui                            # الفحص الكامل");
  L.push("npm run audit:ui -- --only=/wisdom          # مسار واحد");
  L.push("npm run audit:ui -- --no-interact            # بدون النقر");
  L.push("npm run test:e2e -- audit-regression         # بوابة قبل الإطلاق");
  L.push("AUDIT_BASE_URL=https://…pages.dev npm run audit:ui   # على نشر حقيقي");
  L.push("```");
  L.push("");
  L.push(
    "اللقطات في `docs/audit/screenshots/`، والدليل الخام في `docs/audit/raw.json` " +
      "(كل زيارة، كل مقياس، كل رابط). التقرير نفسه مكتوب آلياً من `scripts/audit/crawl.ts`؛ " +
      "سجل الإصلاحات في `docs/audit/fixes.json` ويُرسَم هنا تحت «الإصلاحات»."
  );
  L.push("");

  return renderFixes(L, sweep, interaction);
}

/* ── closed defects ────────────────────────────────────────────────────────── */

/**
 * Render `docs/audit/fixes.json` — the closed P0/P1s, with before/after evidence.
 *
 * ## Why this is a hand-written file the crawler reads, not a paragraph in the report
 *
 * A defect is closed when its *cause* was understood and removed, not when its finding
 * stopped appearing. Only a person can write the first sentence, and only a person who
 * understands the cause can say whether it can return. So the prose lives in a file that
 * survives regenerating the report, and the crawler supplies the part a machine is better
 * at: checking whether the finding came back.
 *
 * That check is the real value. A closed defect that reappears is a regression, and a
 * regression in a gate is silent unless something is holding the old state to compare
 * against. `fixes.json` is that memory.
 */
interface FixRecord {
  id: string;
  severity: string;
  title: string;
  titleEn: string;
  cause: string;
  fix: string;
  impact: string;
  regression: string;
  /**
   * Finding ids that must not reappear, matched as substrings.
   *
   * The crawler's own ids (`console:<70 chars of the message>`,
   * `contrast:<selector>:<ratio>`) are derived from evidence, so they are not stable
   * strings anyone can hard-code from memory. Matching on a substring of the id is what
   * makes the check possible without freezing the id format.
   *
   * Empty or absent means there is nothing to watch — and the report says so rather than
   * implying a guard exists. A closure that claims a watch it does not have is worse
   * than one that admits it needs a different kind of guard.
   */
  watch?: string[];
  shots: { before: string; after: string; caption: string }[];

  /**
   * Which preserved before-run to read this closure's screenshots from, relative to
   * `docs/audit/`. Defaults to `before/screenshots`, which is wrong for any defect
   * found *after* the first run: the first run's screenshots predate it, so showing
   * them as "before" would be evidence of nothing.
   *
   * Each before-set is a real crawl, kept whole, because a before-shot is only
   * meaningful as one frame out of a run whose other 203 frames are also true.
   */
  beforeSet?: string;
}

function loadFixes(): FixRecord[] {
  const path = resolve(process.cwd(), "docs/audit/fixes.json");
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(parsed.fixes) ? parsed.fixes : [];
  } catch (err) {
    // A malformed record must not take the whole report down with it, but it must be
    // visible: a silently skipped closure is a closure nobody is tracking.
    console.error(`  fixes.json could not be read: ${(err as Error).message}`);
    return [];
  }
}

function renderFixes(L: string[], sweep: Finding[], interaction: Finding[]): string {
  const fixes = loadFixes();
  if (fixes.length === 0) return L.join("\n");

  L.push("## الإصلاحات — عيوب P0/P1 مُغلَقة");
  L.push("");
  L.push(
    "كل عيب هنا أُصلح بإزالة سببه لا بإخفاء علامته. السجل في `docs/audit/fixes.json`، " +
      "ويُفحص آلياً: إذا عاد أي معرّف مذكور هنا إلى Findings أعلاه فالفحص يعدّه انحداراً."
  );
  L.push("");

  const all = [...sweep, ...interaction];

  for (const fix of fixes) {
    const watch = fix.watch ?? [];

    // Only a finding *at least as severe* counts as this closure regressing.
    //
    // Without this, a P1 fix that watches `contrast:` reports itself as regressed the
    // moment the P2 band is non-empty — and the P2 band is deliberately non-empty,
    // because completing it to full AA is the user's decision, not a silent fix. A
    // guard that cries wolf on every run gets ignored, which is the same as having
    // no guard while looking as though the defect is tracked.
    const rank: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
    const fixedRank = rank[fix.severity] ?? 3;
    const returned = watch.flatMap((w) =>
      all.filter(
        (f) => f.id.includes(w) && (rank[f.severity] ?? 3) <= fixedRank
      )
    );
    L.push(`### ${fix.severity} — ${fix.title}`);
    L.push("");
    L.push(`**${fix.titleEn}**  \`${fix.id}\`${returned.length > 0 ? " — **عاد**" : ""}`);
    L.push("");
    if (returned.length > 0) {
      L.push(
        `> **انحدار.** ظهر هذا العيب ${returned.length} مرة في هذا الفحص بعد أن كان مُصلَحاً` +
          ` (${[...new Set(returned.map((f) => `\`${f.id}\``))].slice(0, 3).join("، ")}). ` +
          `الحارس في \`${fix.regression}\` لم يمنع عودته.`
      );
      L.push("");
    }
    L.push(`- **السبب:** ${fix.cause}`);
    L.push(`- **ما تغيّر:** ${fix.fix}`);
    L.push(`- **الأثر:** ${fix.impact}`);
    L.push(`- **حارس العودة:** ${fix.regression}`);
    if (watch.length > 0) {
      L.push(
        `- **مؤشّر العودة في الفحص:** ${watch.map((w) => `\`${w}\``).join("، ")}` +
          `${returned.length > 0 ? " — **ظهر**" : " — لم يظهر"}`
      );
    } else {
      L.push(
        "- **مؤشّر العودة في الفحص:** لا يوجد — هذا العيب لم يظهر كعيب في التقرير بل " +
          "كعطل في أداة الفحص نفسها، وحارسه هو طريقة انتظار الجاهزية لا معرّف عيب."
      );
    }
    L.push("");
    for (const shot of fix.shots) {
      const beforeDir = fix.beforeSet ?? "before/screenshots";
      const before = `docs/audit/${beforeDir}/${shot.before}.png`;
      const after = `docs/audit/screenshots/${shot.after}.png`;

      // A closure that points at a screenshot which does not exist is worse than one
      // with no screenshots: the table renders a broken image and reads as though
      // evidence were shown. Say so instead.
      if (!existsSync(resolve(process.cwd(), before))) {
        L.push(
          `> **دليل مفقود.** \`${before}\` غير موجود، فلا يمكن عرض لقطة قبل/بعد لهذا الإصلاح.`
        );
        L.push("");
        L.push(`*${shot.caption}*`);
        L.push("");
        continue;
      }

      L.push(`| قبل | بعد |`);
      L.push(`|---|---|`);
      L.push(`| ![قبل](${before}) | ![بعد](${after}) |`);
      L.push("");
      L.push(`*${shot.caption}*`);
      L.push("");
    }
  }

  return L.join("\n");
}

/* ── main ─────────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const startedAt = Date.now();

  await mkdir(SHOTS_DIR, { recursive: true });

  let all = combinations();
  if (ONLY_PARTS.length > 0) {
    all = all.filter((c) => ONLY_PARTS.some((p) => c.route.path.includes(p)));
  }

  /**
   * Refuse to report on nothing.
   *
   * A typo'd `--only=` used to produce a clean sweep of zero pages, a report titled
   * "No P0 or P1", and screenshots of zero files. Read at a glance that is a passing
   * audit. It is the single most dangerous output this script can produce, because it is
   * indistinguishable from the good news it imitates — and a gate that cannot tell a pass
   * from a run that never executed is not a gate.
   */
  const matchedRoutes = new Set(all.map((c) => c.route.path));
  if (ONLY_PARTS.length > 0 && matchedRoutes.size === 0) {
    console.error(
      `\n  --only=${ONLY} matched none of the ${ROUTES.length} routes. Nothing was crawled.`
    );
    console.error(`  Known routes: ${ROUTES.map((r) => r.path).join(" ")}`);
    console.error("  Comma-separate several, e.g. --only=/quotes,/paths\n");
    process.exit(1);
  }

  console.log(`audit:ui — ${BASE_URL}`);
  console.log(`  routes: ${ROUTES.length}  viewports: ${VIEWPORTS.length}  themes: 2  locales: 2`);
  console.log(
    `  sweep: ${DO_SWEEP ? `${all.length} combinations` : "skipped"}  ` +
      `interaction: ${DO_INTERACT ? "on" : "off"}`
  );

  try {
    const res = await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch {
    console.error(`\n  Cannot reach ${BASE_URL}.`);
    console.error("  Start the app first:  npm run build && npx next start -p 3000");
    console.error("  Or audit a deployment: AUDIT_BASE_URL=https://…pages.dev npm run audit:ui");
    process.exit(2);
  }

  const browser = await chromium.launch();
  const results: PageResult[] = [];
  const sweep: Finding[] = [];

  // Sequential, deliberately. See the note at the top of the file.
  if (DO_SWEEP) {
    for (const [i, combo] of all.entries()) {
      const result = await visit(browser, combo);
      results.push(result);
      sweep.push(...classify(result, combo.route));

      const found = sweep.filter((f) => f.route === combo.route.path).length;
      process.stdout.write(
        `\r  [${String(i + 1).padStart(3)}/${all.length}] ${combo.route.path.padEnd(15)} ` +
          `${combo.viewport.name.padEnd(12)} ${combo.theme.padEnd(5)} ${combo.locale}  ` +
          `${String(result.status ?? "ERR").padStart(4)} ${String(result.textLength).padStart(5)}ch  ` +
          `${result.consoleErrors.length > 0 ? `${result.consoleErrors.length} err` : "ok"}  ` +
          `${found > 0 ? `${found} finding` : "clean"}          `
      );
    }
    process.stdout.write("\n");
  }

  let interaction: Finding[] = [];
  let totalClicked = 0;
  let totalSkipped = 0;
  if (DO_INTERACT) {
    console.log("\n  interaction pass — clicking every control");
    // Mobile and desktop only: a control that works at 1440 and fails at 360 is a
    // mobile bug, and the tablet pass adds a third of the time for the same signal.
    const targets =
      ONLY_PARTS.length > 0
        ? ROUTES.filter((r) => ONLY_PARTS.some((p) => r.path.includes(p)))
        : ROUTES;
    for (const route of targets) {
      if (route.skipInteraction) continue;
      for (const viewport of [VIEWPORTS[0]!, VIEWPORTS[2]!]) {
        const outcome = await interact(browser, route, viewport);
        interaction.push(...outcome.findings);
        totalClicked += outcome.clicked;
        totalSkipped += outcome.skipped;
        process.stdout.write(
          `\r  ${route.path.padEnd(17)} ${viewport.name.padEnd(12)} ` +
            `${outcome.findings.length} finding(s)  clicked ${outcome.clicked}  hidden ${outcome.skipped}          `
        );
      }
    }
    process.stdout.write("\n");
  }

  await browser.close();

  const merged = mergeFindings([...sweep, ...interaction]);
  const counts = (["P0", "P1", "P2", "P3"] as Severity[])
    .map((s) => `${s}=${merged.filter((f) => f.severity === s).length}`)
    .join("  ");

  await writeFile(
    join(ARTIFACT_DIR, "raw.json"),
    JSON.stringify(
      {
        baseUrl: BASE_URL,
        generatedAt: new Date().toISOString(),
        coverage: { routes: ROUTES.length, viewports: VIEWPORTS.length, themes: 2, locales: 2, visits: results.length, controlsClicked: totalClicked, controlsHiddenBehindDisclosure: totalSkipped },
        results,
        sweep,
        interaction,
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    REPORT_PATH,
    renderReport(results, sweep, interaction, startedAt, { clicked: totalClicked, skipped: totalSkipped }),
    "utf8"
  );

  console.log(`\n  ${results.length} visits, ${merged.length} unique findings: ${counts}`);
  console.log(`  ${relative(process.cwd(), REPORT_PATH)}`);
  console.log(`  ${relative(process.cwd(), join(ARTIFACT_DIR, "raw.json"))}`);
  console.log(`  ${SHOTS_DIR}/ (${results.filter((r) => r.screenshot).length} screenshots)`);

  const p0 = merged.filter((f) => f.severity === "P0").length;
  const p1 = merged.filter((f) => f.severity === "P1").length;
  console.log(p0 + p1 > 0 ? `\n  ${p0} P0 and ${p1} P1 remain.` : "\n  No P0 or P1.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
