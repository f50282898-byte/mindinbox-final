#!/usr/bin/env node
/**
 * Fails the build if an AI provider key can reach the browser.
 *
 * The rule: a value read from a `NEXT_PUBLIC_*` variable is inlined into the
 * bundle at build time and is readable by anyone who views source. Only
 * `NEXT_PUBLIC_*` config belongs there. API keys must never appear in a
 * client chunk, in `public/`, or in a sourcemap.
 *
 * This is deliberately not the same check as `check-edge.mjs` — that one looks
 * for secret *names*; this one looks for secret *values*, which is what
 * actually matters. A key accidentally pasted into a component as a literal has
 * no secret name to grep for.
 *
 * Scans:
 *   - .next/static/**   the client bundle and its sourcemaps
 *   - public/**          anything served verbatim
 *
 * Run: node scripts/check-no-keys.mjs
 * Needs a build to have run.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const SCAN_DIRS = [".next/static", "public"];

/** Files worth reading. Text-ish only; skip large binaries. */
const SCAN_EXT = new Set([".js", ".mjs", ".cjs", ".json", ".map", ".css", ".html", ".txt", ".env"]);

const MAX_BYTES = 24 * 1024 * 1024;

/**
 * Provider key shapes.
 *
 * Matching the prefix is what makes this reliable: it catches a leaked key
 * wherever it landed, including a hardcoded literal in source. The literal
 * alternation exists so a *placeholder* in source or docs does not fail the
 * build, while a real key does.
 *
 * ── The `AIza` ambiguity ────────────────────────────────────────────────────
 *
 * `AIza…` is the prefix for BOTH a Firebase Web API key and a Gemini API key.
 * They must be treated differently:
 *
 *   - `NEXT_PUBLIC_FIREBASE_API_KEY` is public BY DESIGN. Google's own docs
 *     state the web config key identifies the project and is meant to ship in
 *     client apps; the protection comes from Firestore/Storage Security Rules
 *     and App Check, not from hiding the key.
 *   - `GEMINI_API_KEY` is a secret and must never reach a client.
 *
 * So an `AIza…` value in a client chunk is a leak *unless* it is byte-identical
 * to the configured `NEXT_PUBLIC_FIREBASE_API_KEY`. Any other `AIza…` value —
 * including a Gemini key, or a Firebase key from a different project pasted in
 * by mistake — fails the build.
 */
const PATTERNS = [
  { name: "Anthropic key", re: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: "Google/Gemini key", re: /AIza[A-Za-z0-9_-]{30,}/g },
  { name: "Groq key", re: /gsk_[A-Za-z0-9]{30,}/g },
  { name: "NVIDIA key", re: /nvapi-[A-Za-z0-9_-]{30,}/g },
  { name: "OpenAI-style key", re: /sk-[A-Za-z0-9]{32,}/g },
  { name: "Cloudflare Turnstile secret", re: /0\.[A-Za-z0-9_-]{40,}/g },
  { name: "Firebase service account private key", re: /"private_key"\s*:\s*"-----BEGIN PRIVATE KEY-----/g },
];

/**
 * Reads a variable from the local env files.
 *
 * Next.js loads `.env.local` at build time; a plain `node` script does not. The
 * value is only ever *compared*, never printed, and these files are gitignored.
 * Without this the check cannot tell a public Firebase key from a leaked Gemini
 * key, because they share a prefix.
 */
function readLocalEnv(name) {
  if (process.env[name]) return process.env[name].trim();
  for (const file of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf-8").split(/\r?\n/)) {
      const m = new RegExp(`^${name}=(.*)$`).exec(line.trim());
      if (m) {
        const value = m[1].trim().replace(/^["']|["']$/g, "");
        if (value) return value;
      }
    }
  }
  return null;
}

/** The one `AIza` value legitimately allowed in a client bundle. */
const PUBLIC_FIREBASE_KEY = readLocalEnv("NEXT_PUBLIC_FIREBASE_API_KEY");

/** Strings that look like keys but are documentation or placeholders. */
const ALLOW = [
  /your[-_ ]?key/i,
  /example/i,
  /placeholder/i,
  /xxx/i,
  /^\$\{/,
  /process\.env/,
  /\bTODO\b/,
  /<[a-z_]+>/i,
];

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      yield* walk(full);
      continue;
    }
    if (!SCAN_EXT.has(extname(full))) continue;
    if (st.size > MAX_BYTES) continue;
    yield full;
  }
}

const findings = [];
let scanned = 0;
let publicByDesign = 0;

for (const dir of SCAN_DIRS) {
  const abs = resolve(process.cwd(), dir);
  if (!existsSync(abs)) {
    console.log(`  (skipping ${dir} — not built yet)`);
    continue;
  }
  for (const file of walk(abs)) {
    scanned += 1;
    const content = readFileSync(file, "utf-8");

    for (const { name, re } of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(content)) !== null) {
        const match = m[0];
        const context = content.slice(Math.max(0, m.index - 80), m.index + match.length + 40);

        // Ignore an obvious placeholder or an env reference in the vicinity.
        if (ALLOW.some((re2) => re2.test(context))) continue;

        // The Firebase web key is public by design; a Gemini key is not, and the
        // two share a prefix. Identity, not shape, is the discriminator.
        const isConfiguredFirebaseKey =
          name === "Google/Gemini key" && PUBLIC_FIREBASE_KEY !== null && match === PUBLIC_FIREBASE_KEY;

        if (isConfiguredFirebaseKey) {
          publicByDesign += 1;
          continue;
        }

        findings.push({
          file: relative(process.cwd(), file),
          kind: name,
          // Never print the secret. Only where and what shape.
          at: m.index,
          preview: `${match.slice(0, 6)}…${match.slice(-4)} (${match.length} chars)`,
        });
      }
    }
  }
}

if (scanned === 0) {
  console.error("no files scanned — run `npm run build` first.");
  process.exit(1);
}

if (findings.length === 0) {
  const publicNote =
    publicByDesign > 0
      ? ` ${publicByDesign} Firebase web key value(s) present — public by design, gated by Security Rules and App Check.`
      : "";
  console.log(`check:keys — ${scanned} file(s) scanned, no secret provider key found.${publicNote}`);
  process.exit(0);
}

console.error(`check:keys — ${findings.length} potential key leak(s):\n`);
for (const f of findings) {
  console.error(`  ${f.file} @${f.at}`);
  console.error(`    ${f.kind}: ${f.preview}`);
}
console.error("\nA provider key in the client bundle is readable by anyone who views source.");
console.error("Rotate the key, then move it behind an edge route.");
process.exit(1);
