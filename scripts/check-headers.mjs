#!/usr/bin/env node
/**
 * Fails if `public/_headers` and `src/lib/security/csp.ts` disagree.
 *
 * ## Why a drift check and not "just keep them in sync"
 *
 * The real policy is a nonce-based CSP in middleware, which no static file can
 * express. So the fallback in `_headers` is a **second, weaker copy** of the same
 * policy — and a second copy of a security policy is exactly the kind of thing that
 * silently rots. Someone tightens `frame-src` in the TypeScript module, the static
 * file keeps the old value, and the fallback is now the weakest link with nobody
 * looking at it.
 *
 * So the two are compared mechanically, on every build:
 *
 *   - every directive name in the module appears in `_headers`
 *   - every origin in the module appears in the matching `_headers` directive
 *   - every `SECURITY_HEADERS` entry appears as a header line
 *   - **`'unsafe-eval'` does not appear in `_headers`**
 *   - **`'unsafe-inline'` does not appear in any script directive**
 *
 * The last two are the assertions that matter. The shipped policy had
 * `'unsafe-inline' 'unsafe-eval'` in `script-src`, which together void CSP's
 * protection against XSS entirely. A check that only verified agreement would happily
 * ratify that.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const HEADERS_PATH = join(ROOT, "public", "_headers");
const CSP_PATH = join(ROOT, "src", "lib", "security", "csp.ts");

const errors = [];
const notes = [];

function readOrFail(path, label) {
  if (!existsSync(path)) {
    errors.push(`${label} is missing at ${path}`);
    return null;
  }
  return readFileSync(path, "utf8");
}

/* ── 1. every directive in the module appears in _headers ──────────────────── */

/**
 * Extracts the CSP line from `_headers`.
 *
 * The file has two `/* ... *\/` blocks; only the second carries the policy. Taking
 * the first match of `Content-Security-Policy:` is enough and avoids parsing blocks.
 */
function extractHeaderCsp(headers) {
  const line = headers
    .split(/\r?\n/)
    .find((l) => /^\s*Content-Security-Policy:/i.test(l));
  return line ? line.slice(line.indexOf(":") + 1).trim() : "";
}

/** Parses a policy value into `{ directive: Set(origin) }`. */
function parsePolicy(value) {
  const out = new Map();
  for (const part of value.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const [directive, ...sources] = tokens;
    out.set(directive.toLowerCase(), new Set(sources));
  }
  return out;
}

/** Directive names the module declares, read from the source rather than evaluated. */
function moduleDirectives(source) {
  const body = source.slice(source.indexOf("export function cspDirectives"));
  const block = body.slice(0, body.indexOf("\n  };"));
  const names = new Set();
  for (const m of block.matchAll(/"([a-z-]+)":/g)) names.add(m[1]);
  return names;
}

/** Sources per directive, read from the module's const tables. */
function moduleSources(source) {
  const read = (name) => {
    const m = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\]\\.join\\(" "\\)`).exec(source);
    if (!m) return null;
    return new Set(
      [...m[1].matchAll(/"([^"]+)"|(\S+?)(?=,\s*$)/gm)]
        .map((x) => (x[1] ?? x[2] ?? "").replace(/,$/, "").trim())
        .filter(Boolean)
    );
  };
  return {
    "connect-src": read("CONNECT_SRC"),
    "frame-src": read("FRAME_SRC"),
    "img-src": read("IMG_SRC"),
    "font-src": read("FONT_SRC"),
    "style-src": read("STYLE_SRC"),
  };
}

/** Header names the module sets, read from its `SECURITY_HEADERS` table. */
function moduleSecurityHeaders(source) {
  const start = source.indexOf("export const SECURITY_HEADERS");
  const block = source.slice(start, source.indexOf("\n];", start));
  return [...block.matchAll(/\["([^"]+)"/g)].map((m) => m[1]);
}

const headersText = readOrFail(HEADERS_PATH, "public/_headers");
const cspText = readOrFail(CSP_PATH, "src/lib/security/csp.ts");

if (headersText && cspText) {
  const headerCsp = parsePolicy(extractHeaderCsp(headersText));
  const declared = moduleDirectives(cspText);
  const sources = moduleSources(cspText);

  /* Every directive the module emits must exist in the fallback. */
  for (const directive of declared) {
    if (!headerCsp.has(directive)) {
      errors.push(`directive "${directive}" is in csp.ts but not in public/_headers`);
    }
  }

  /* Every origin the module allows must be allowed in the fallback. */
  for (const [directive, origins] of Object.entries(sources)) {
    if (!origins) continue;
    const inHeaders = headerCsp.get(directive);
    if (!inHeaders) {
      errors.push(`directive "${directive}" missing entirely from public/_headers`);
      continue;
    }
    for (const origin of origins) {
      // A nonce placeholder is dynamic and legitimately absent from a static file.
      if (origin.includes("nonce-")) continue;
      if (!inHeaders.has(origin)) {
        errors.push(`origin "${origin}" allowed in csp.ts but not in _headers (${directive})`);
      }
    }
  }

  /* Every security header the module sets must appear as a line in _headers. */
  for (const name of moduleSecurityHeaders(cspText)) {
    const present = headersText
      .split(/\r?\n/)
      .some((l) => new RegExp(`^\\s*${name.replace(/[-]/g, "\\-")}\\s*:`, "i").test(l));
    if (!present) errors.push(`header "${name}" is in csp.ts but not in public/_headers`);
  }

  /* ── the two assertions that actually catch a regression ───────────────── */

  const scriptDirectives = ["script-src", "script-src-elem"];
  for (const directive of scriptDirectives) {
    const values = headerCsp.get(directive);
    if (!values) continue;
    if (values.has("'unsafe-eval'")) {
      errors.push(
        `public/_headers allows 'unsafe-eval' in ${directive}. A production build does not need it, and eval in production is most of what an XSS payload wants.`
      );
    }
  }

  // `'unsafe-inline'` is permitted in `style-src` only, and only there. Inline style
  // cannot execute; inline script can.
  for (const [directive, values] of headerCsp) {
    if (!values.has("'unsafe-inline'")) continue;
    if (directive.startsWith("script")) {
      errors.push(
        `public/_headers allows 'unsafe-inline' in ${directive}. This voids CSP's XSS protection entirely. The nonce in middleware.ts is what replaces it.`
      );
    } else if (directive !== "style-src") {
      errors.push(
        `'unsafe-inline' in ${directive} is not expected and has no justification.`
      );
    } else {
      notes.push(
        "style-src keeps 'unsafe-inline' by decision — see the note in src/lib/security/csp.ts."
      );
    }
  }

  /* A permissive origin must never reach script-src. */
  const scriptValues = headerCsp.get("script-src");
  if (scriptValues) {
    for (const value of scriptValues) {
      if (value.startsWith("https://")) {
        errors.push(
          `script-src allows the third-party origin "${value}". No third-party origin needs to execute script in this product; the YouTube iframe API is not used.`
        );
      }
    }
  }

  /* frame-src must not permit the cookie-setting YouTube host. */
  const frameValues = headerCsp.get("frame-src");
  if (frameValues && frameValues.has("https://www.youtube.com")) {
    errors.push(
      "frame-src allows https://www.youtube.com, which sets tracking cookies. Only youtube-nocookie.com belongs here."
    );
  }
}

/* ── security.txt must exist and be reachable ─────────────────────────────── */

const TXT_PATH = join(ROOT, "public", ".well-known", "security.txt");
if (!existsSync(TXT_PATH)) {
  errors.push("public/.well-known/security.txt is missing");
}

/* ── report ───────────────────────────────────────────────────────────────── */

for (const n of notes) console.log(`  note: ${n}`);

if (errors.length > 0) {
  console.error("\ncheck-headers — FAILED\n");
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    "\nThe static fallback and the middleware policy must describe the same site."
  );
  process.exit(1);
}

console.log(
  "check-headers — public/_headers agrees with src/lib/security/csp.ts; " +
    "no 'unsafe-inline' or 'unsafe-eval' in any script directive; security.txt present."
);
