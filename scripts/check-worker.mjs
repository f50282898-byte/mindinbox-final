#!/usr/bin/env node
/** Validate the Cloudflare Pages worker produced by the installed Next.js adapter. */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, extname, relative } from "node:path";

const ROOT = resolve(process.cwd());
const SRC = resolve(ROOT, "src");
const OUTPUT = resolve(ROOT, ".vercel/output/static");
const CONFIG = resolve(ROOT, "wrangler.json");
const NODE_EDGE_RUNTIME = /export\s+const\s+runtime\s*=\s*["']edge["']/;
/**
 * Provider key formats and PEM private keys.
 *
 * These are deliberately anchored on a recognisable vendor prefix. A generic
 * "long base64 string" rule was removed: it matched the DWARF/Rust panic
 * backtrace symbol tables that `sharp`'s native binary contributes to the
 * bundle (base64 of binary data very often begins with `AAAA`), so it fired on
 * every single build and could never be satisfied.
 *
 * Source-tree secrets are covered separately and more precisely by
 * `check-no-keys.mjs` (`npm run check:keys`); this list only guards what the
 * bundler might inline into the Worker output.
 */
const SECRET_PATTERNS = [
  /gsk_[0-9A-Za-z]{20,}/,
  /nvapi-[0-9A-Za-z\-_]{20,}/,
  /sk-[0-9A-Za-z]{20,}/,
  /cfat_[0-9A-Za-z]{20,}/,
  /-----BEGIN [A-Z ]+-----[\r\n\\n]+[A-Za-z0-9+/=\r\n\\]{40,}-----END [A-Z ]+-----/,
];

const errors = [];

function walk(dir, extensions) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // Vendored dependencies are not our code and cannot hold a secret we
    // introduced; OpenNext copies a full node_modules tree into the output.
    if (entry.name === "node_modules") continue;
    const file = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(file, extensions));
    } else if (extensions.includes(extname(entry.name))) {
      files.push(file);
    }
  }
  return files;
}

console.log("Checking Cloudflare Pages Worker output...");

if (!existsSync(CONFIG)) {
  errors.push("wrangler.json is missing");
} else {
  const config = JSON.parse(readFileSync(CONFIG, "utf8"));
  if (config.pages_build_output_dir !== ".vercel/output/static") errors.push("Pages output directory does not match the adapter");
  if (!config.compatibility_flags?.includes("nodejs_compat")) errors.push("nodejs_compat is required");
}

const workerEntry = resolve(OUTPUT, "_worker.js/index.js");
if (!existsSync(workerEntry)) {
  errors.push(".vercel/output/static/_worker.js/index.js is missing; run `npm run build:pages` first");
} else {
  for (const file of walk(OUTPUT, [".js", ".mjs", ".json"])) {
    const content = readFileSync(file, "utf8");
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(content)) {
        errors.push(`${relative(ROOT, file)}: secret pattern found in generated Worker output`);
        break;
      }
    }
  }
}

if (errors.length) {
  console.error(`\n${errors.length} Cloudflare Worker check(s) failed:`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log("✓ Cloudflare Pages Worker passed.");
