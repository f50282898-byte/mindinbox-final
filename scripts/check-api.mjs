#!/usr/bin/env node
/**
 * Audits every API route and fails on an unjustified one.
 *
 * ## What this is for
 *
 * "There is no unprotected API route without a written justification" is not
 * checkable by reading. Routes accumulate — one added for a webhook, one added in a
 * hurry, one whose guard was copied and then the auth removed — and nothing in a
 * review reliably notices.
 *
 * So each route is classified mechanically, and a route that is **not** protected must
 * declare why, in a comment this script can read:
 *
 *     // @public — the riddle roll rate limit, and the draw is server-side
 *
 * That makes "unprotected" a deliberate, greppable, reviewable claim rather than an
 * omission. Adding `@public` is easy; what matters is that it is visible and that this
 * script lists every one of them on every build.
 *
 * ## What is checked per route
 *
 * | Check | Why |
 * |---|---|
 * | `runtime = "edge"` | a Node runtime silently unpins the bundle model |
 * | a guard or `@public` | no anonymous privileged surface by accident |
 * | zod on any request body | an unvalidated body is the entry point for everything |
 * | a body size bound | zod's `.max()` on a string is not a body size limit |
 * | no `Access-Control-Allow-Origin: *` | CORS is not an auth control (see below) |
 *
 * ## On CORS
 *
 * The brief asks for same-origin-only CORS. Worth being precise about what that buys:
 * **CORS is not an access control.** A browser enforces it; `curl` does not run the
 * same-origin policy at all. Every route here authenticates with a bearer token and
 * re-checks server-side, which is the actual control. What matters is that no response
 * carries `Access-Control-Allow-Origin: *`, because that would let a malicious page
 * *read* a response from a logged-in visitor — which a token check alone does not stop,
 * since the browser attaches the victim's session.
 *
 * So: no wildcard ACAO anywhere, and no `credentials: true` alongside it. Preflight is
 * answered by absence, which is the correct same-origin answer.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = process.cwd();
const API_DIR = join(ROOT, "src", "app", "api");

/** Guards that establish an identity or a privilege. */
const GUARDS = [
  "requireUser",
  "requireAdmin",
  "verifyIdToken",
  "verifyTurnstile",
  "verifyWinToken",
  "verifyRsiToken", // (none yet — listed so adding one is a deliberate edit)
];

/** Annotation that declares a route intentionally anonymous. */
const PUBLIC_MARKER = /@public\b/;

const errors = [];
const warnings = [];
const rows = [];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry === "route.ts" || entry === "route.tsx") out.push(full);
  }
  return out;
}

const files = walk(API_DIR);

for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  const source = readFileSync(file, "utf8");

  /* Strip comments so a guard named in prose is not mistaken for a real one. */
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  const methods = [...new Set([...code.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/g)].map((m) => m[1]))];
  const isGuard = GUARDS.some((g) => new RegExp(`\\b${g}\\s*\\(`).test(code));
  const isPublic = PUBLIC_MARKER.test(source);
  const hasZod = /\bz\.(object|string|number|enum|array|union|literal|boolean)\s*\(/.test(code);
  const readsBody = /\.(json|formData|text)\s*\(\s*\)/.test(code);
  const hasBodyBound = /\.(max|length)\s*\(\s*\d{3,}\s*\)/.test(code);
  const declaresEdge = /export\s+const\s+runtime\s*=\s*"edge"/.test(code);

  /* ── hard failures ─────────────────────────────────────────────────────── */

  if (!declaresEdge) {
    errors.push(`${rel}: no 'export const runtime = "edge"'`);
  }

  if (!isGuard && !isPublic) {
    errors.push(
      `${rel}: no identity guard and no '// @public' justification. An anonymous privileged surface must be declared, not omitted.`
    );
  }

  if (methods.includes("GET") && readsBody && !hasZod) {
    errors.push(`${rel}: GET reads a body without zod`);
  }

  if (readsBody && !hasZod) {
    warnings.push(`${rel}: reads a request body without zod — unvalidated input reaches this handler`);
  }

  if (readsBody && !hasBodyBound) {
    warnings.push(
      `${rel}: no explicit body-size bound. zod's .max() on a string bounds a field, not the body; add an explicit Content-Length or field cap.`
    );
  }

  /* A wildcard CORS header is the one CORS mistake that is actually exploitable. */
  if (/Access-Control-Allow-Origin["'\s:,]+\*/i.test(code) || /allowOrigin\s*:\s*["']\*["']/.test(code)) {
    errors.push(
      `${rel}: sends Access-Control-Allow-Origin: *. That lets a malicious page read this response from a logged-in visitor. Same-origin needs no CORS header at all.`
    );
  }

  /* ── rows for the report ───────────────────────────────────────────────── */

  rows.push({
    route: `/${relative(API_DIR, file).replace(/\\/g, "/").replace(/\/route\.tsx?$/, "")}`,
    methods: methods.join(",") || "—",
    guard: isGuard ? "yes" : isPublic ? "@public" : "NONE",
    zod: hasZod ? "yes" : readsBody ? "MISSING" : "n/a",
    body: readsBody ? (hasBodyBound ? "bounded" : "UNBOUNDED") : "n/a",
  });
}

/* ── report ───────────────────────────────────────────────────────────────── */

const width = (key) => Math.max(key.length, ...rows.map((r) => r[key].length));

console.log("API route audit\n");
console.log(
  `${rows.length} route(s)\n`
);
console.log(
  `  ${"route".padEnd(width("route"))}  ${"methods".padEnd(width("methods"))}  ${"guard".padEnd(width("guard"))}  ${"zod".padEnd(width("zod"))}  body`
);
for (const r of rows.sort((a, b) => a.route.localeCompare(b.route))) {
  console.log(
    `  ${r.route.padEnd(width("route"))}  ${r.methods.padEnd(width("methods"))}  ${r.guard.padEnd(width("guard"))}  ${r.zod.padEnd(width("zod"))}  ${r.body}`
  );
}

const publicRoutes = rows.filter((r) => r.guard === "@public");
const unguarded = rows.filter((r) => r.guard === "NONE");

if (unguarded.length > 0) {
  console.error(`\n❌ ${unguarded.length} route(s) with neither a guard nor a justification:`);
  for (const r of unguarded) console.error(`   - ${r.route}`);
}

if (warnings.length > 0) {
  console.error(`\n⚠️  ${warnings.length} warning(s):`);
  for (const w of warnings) console.error(`   - ${w}`);
}

if (errors.length > 0) {
  console.error(`\n❌ ${errors.length} error(s):`);
  for (const e of errors) console.error(`   - ${e}`);
  process.exit(1);
}

console.log(
  `\n✅ Every route either has an identity guard or an explicit '// @public' justification` +
    (publicRoutes.length > 0
      ? ` (${publicRoutes.length} declared public: ${publicRoutes.map((r) => r.route).join(", ")})`
      : "") +
    "."
);
