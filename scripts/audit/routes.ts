/**
 * The route map the audit crawls.
 *
 * ## Why not `sitemap.xml`
 *
 * The brief says the route map, not the sitemap, and the difference matters.
 * `sitemap.ts` deliberately omits `/account` (noindex, personal) and, since D66,
 * the three Firebase-dependent routes when Firebase is absent. Crawling the
 * sitemap would therefore silently skip `/enter`, `/tracker` and `/journal` on
 * this machine — which is exactly where a regression would hide, since those are
 * the pages currently rendering their degraded state.
 *
 * The sitemap answers "what should a search engine be told about". This answers
 * "what does a user have a URL for". Different questions.
 *
 * ## Where the list comes from
 *
 * `lib/nav.ts` is the single source for navigation, and it is read at runtime by
 * `sitemap.ts` and by the shell. Reading `INDEXABLE_ROUTES` from it — rather than
 * restating the paths here — means a route added to navigation is audited
 * without editing this file, which is the whole point of having a route map.
 *
 * `/oracle`, `/sanctum`, `/account`, `/admin`, `/god-mode-admin` and `/membership`
 * are appended deliberately: they are reachable by a user with a URL even though
 * the nav hides them, and an audit that cannot reach `/oracle` is not an audit.
 * `/membership` is listed as a redirect expectation rather than a page.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface RouteSpec {
  path: string;
  /** What the page is, for the report. */
  kind: "public" | "account" | "tier" | "admin" | "redirect";
  /**
   * Expected to end somewhere else. A redirect target that 404s, or that lands
   * somewhere surprising, is a P1 — a bookmark that silently stops working is the
   * kind of breakage nobody notices for six months.
   */
  expectRedirect?: string;
  /** Expected HTTP status when fetched directly. */
  expectStatus?: number;
  /**
   * Firebase-dependent pages render a different screen with no keys configured.
   * The audit still visits them, and records which state it saw, so a report that
   * says "these three were checked in their degraded state" cannot be mistaken
   * for "these three were checked working".
   */
  firebaseDependent?: boolean;
  /** Skip the interactive click-through (a form that submits navigates away). */
  skipInteraction?: boolean;
}

/**
 * Reads `INDEXABLE_ROUTES` out of `src/lib/nav.ts`.
 *
 * Parsed rather than imported, and that is a deliberate trade. Importing would
 * type-check properly but pulls `nav.ts` and its whole dependency graph into a
 * Node script that only needs a list of strings; `nav.ts` imports React-adjacent
 * types and locale helpers, and a future edit there would be able to break the
 * audit for reasons unrelated to auditing.
 *
 * The cost of parsing is that a rename breaks it, so it **throws** rather than
 * falling back to a hardcoded list. A silent fallback is the one failure mode
 * that must not exist here: the audit would keep running, keep writing a report,
 * and quietly stop covering routes. A loud crash costs one build; a plausible
 * report with holes costs a launch.
 */
function indexableRoutes(): string[] {
  const navPath = resolve(process.cwd(), "src/lib/nav.ts");
  const src = readFileSync(navPath, "utf8");
  const match = /export const INDEXABLE_ROUTES = \[([\s\S]*?)\] as const;/.exec(src);
  if (!match?.[1]) {
    throw new Error(
      `Could not read INDEXABLE_ROUTES from ${navPath}. The route map is the ` +
        "audit's foundation — a silent fallback to a hardcoded list would make the " +
        "audit quietly stop covering routes, which is worse than failing."
    );
  }
  return [...match[1].matchAll(/"(\/[^"]*)"/g)].map((m) => m[1] as string);
}

/** Reachable by URL, whether or not the nav shows them. */
const EXTRA_ROUTES: RouteSpec[] = [
  { path: "/oracle", kind: "tier" },
  { path: "/sanctum", kind: "tier" },
  { path: "/account", kind: "account", firebaseDependent: true },
  /*
   * 404 is the *correct* response here, by design (D46): the admin console is gated
   * behind a signed 15-minute `miab_admin` cookie, and without it the route does not
   * exist as far as anyone is concerned. Reporting that as a P0 would be the audit
   * flagging a security control as a defect — the most damaging kind of false positive
   * this tool could emit, because the tempting fix is to make the page render.
   */
  { path: "/god-mode-admin", kind: "admin", expectStatus: 404 },
  { path: "/membership", kind: "redirect", expectRedirect: "/pricing", expectStatus: 307 },
];

function buildRoutes(): RouteSpec[] {
  const deps = new Set(["/enter", "/tracker", "/journal"]);
  const fromNav: RouteSpec[] = indexableRoutes().map((path) => ({
    path,
    kind: "public" as const,
    firebaseDependent: deps.has(path),
  }));
  return [...fromNav, ...EXTRA_ROUTES];
}

export const ROUTES: RouteSpec[] = buildRoutes();

/** The 12 combinations under audit: 3 viewports × 2 themes × 2 locales. */
export interface Viewport {
  name: string;
  width: number;
  height: number;
  /** Sets `isMobile`/`hasTouch` in Playwright, which changes layout and media queries. */
  mobile: boolean;
  deviceScaleFactor: number;
}

export const VIEWPORTS: Viewport[] = [
  { name: "mobile-360", width: 360, height: 740, mobile: true, deviceScaleFactor: 2 },
  { name: "tablet-768", width: 768, height: 1024, mobile: false, deviceScaleFactor: 2 },
  { name: "desktop-1440", width: 1440, height: 900, mobile: false, deviceScaleFactor: 1 },
];

export type Theme = "dark" | "light";
export type Locale = "ar" | "en";

export const THEMES: Theme[] = ["dark", "light"];
export const LOCALES: Locale[] = ["ar", "en"];

/** Full cross product, as a flat list. 16 routes × 12 = 192 page loads. */
export interface Combination {
  route: RouteSpec;
  viewport: Viewport;
  theme: Theme;
  locale: Locale;
}

export function combinations(): Combination[] {
  const out: Combination[] = [];
  for (const route of ROUTES) {
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        for (const locale of LOCALES) {
          out.push({ route, viewport, theme, locale });
        }
      }
    }
  }
  return out;
}

/** Stable slug for a screenshot filename. Never used as a path component. */
export function slug(c: Combination): string {
  const path = c.route.path === "/" ? "root" : c.route.path.replace(/\//g, "_");
  return `${path}__${c.viewport.name}__${c.theme}__${c.locale}`;
}