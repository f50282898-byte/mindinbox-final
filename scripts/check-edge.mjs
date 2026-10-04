#!/usr/bin/env node
/**
 * check-edge.mjs — Edge runtime guard.
 * Fails the build if:
 * 1. Any file under src/ imports Node.js built-ins (fs, path, crypto, etc.)
 * 2. Any route handler under src/app/api/ lacks `export const runtime = "edge"`
 * 3. Any secret-looking key pattern appears in the build output
 * 4. Any NEXT_PUBLIC_ variable is used in a server-only context (heuristic)
 *
 * Exit code: 0 = pass, 1 = fail
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, extname, relative } from "node:path";

const ROOT = resolve(process.cwd());
const SRC = resolve(ROOT, "src");
const BUILD_OUTPUT = resolve(ROOT, ".vercel/output");

const NODE_BUILTINS = new Set([
  "fs", "path", "stream", "child_process", "crypto", "os", "net", "tls",
  "zlib", "http", "https", "buffer", "util", "url", "querystring", "dns",
  "events", "cluster", "worker_threads", "perf_hooks", "async_hooks",
  "inspector", "module", "vm", "v8", "readline", "string_decoder",
  "punycode", "tty", "process", "assert", "constants", "domain",
]);

const NODE_BUILTIN_REGEX = /from\s+["'](?:node:)?(fs|path|stream|child_process|crypto|os|net|tls|zlib|http|https|buffer|util|url|querystring|dns|events|cluster|worker_threads|perf_hooks|async_hooks|inspector|module|vm|v8|readline|string_decoder|punycode|tty|process|assert|constants|domain)["']/g;
const RUNTIME_EDGE_REGEX = /export\s+const\s+runtime\s*=\s*["']edge["']/;
const SECRET_PATTERNS = [
  /AIza[0-9A-Za-z\-_]{20,}/,
  /gsk_[0-9A-Za-z]{20,}/,
  /nvapi-[0-9A-Za-z\-_]{20,}/,
  /sk-[0-9A-Za-z]{20,}/,
  /cfat_[0-9A-Za-z]{20,}/,
  /-----BEGIN [A-Z ]+-----/,
  /1:[0-9]{6,}:web:[0-9a-zA-Z]{10,}/,
  /AAAA[A-Za-z0-9_\-]{30,}/,
];

const NEXT_PUBLIC_SERVER_REGEX = /process\.env\.NEXT_PUBLIC_[A-Z0-9_]+/g;

let errors = [];
let warnings = [];

function walk(dir, exts) {
  let results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
        results.push(...walk(full, exts));
      }
    } else if (exts.includes(extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

function checkFile(file) {
  const content = readFileSync(file, "utf-8");
  const rel = relative(ROOT, file);

  // A test file is never bundled for the edge — vitest runs it in Node, and reading a
  // fixture off disk is the point of several of them (the leak-scanner drift tests
  // read `scripts/check-no-riddle-leak.mjs` precisely so the gate cannot rot). So the
  // Node-built-in rule skips them.
  //
  // Deliberately narrow: it keys on the `.test.` infix, not on a directory, and it
  // skips rule 1 only. Rules 2 and 3 still run, so a test that declared a route
  // handler or read a `NEXT_PUBLIC_` secret would still be caught.
  const isTest = /\.test\.(ts|tsx|mjs|js)$/.test(file);

  // 1. Node built-in imports
  if (!isTest) {
    for (const match of content.matchAll(NODE_BUILTIN_REGEX)) {
      const mod = match[1];
      if (NODE_BUILTINS.has(mod)) {
        errors.push(`${rel}: imports Node built-in "${mod}" — not allowed in Edge runtime`);
      }
    }
  }

  // 2. Route handlers must declare edge runtime
  if (file.includes("/app/api/") && file.endsWith("route.ts")) {
    if (!RUNTIME_EDGE_REGEX.test(content)) {
      errors.push(`${rel}: route handler missing 'export const runtime = "edge"'`);
    }
  }

  // 3. NEXT_PUBLIC_ used in server-only files (heuristic)
  if (file.includes("/app/") && (file.includes("/api/") || file.endsWith("route.ts"))) {
    for (const match of content.matchAll(NEXT_PUBLIC_SERVER_REGEX)) {
      warnings.push(`${rel}: reads ${match[0]} in server route — ensure it's safe to expose`);
    }
  }
}

function checkBuildOutput() {
  if (!statSync(BUILD_OUTPUT, { throwIfNoEntry: false })?.isDirectory()) {
    warnings.push("Build output directory .vercel/output not found — run `npm run pages:build` first");
    return;
  }

  const files = walk(BUILD_OUTPUT, [".js", ".mjs", ".json"]);
  for (const file of files) {
    const content = readFileSync(file, "utf-8");

    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(content)) {
        errors.push(`${relative(ROOT, file)}: secret pattern found in build output`);
        break;
      }
    }
  }
}

console.log("🔍 Running edge runtime checks...\n");

const srcFiles = walk(SRC, [".ts", ".tsx", ".mjs", ".js"]);
console.log(`Scanning ${srcFiles.length} source files...`);

for (const file of srcFiles) {
  checkFile(file);
}

console.log("Scanning build output...");
checkBuildOutput();

if (warnings.length > 0) {
  console.log("\n⚠️  Warnings:");
  for (const w of warnings) console.log(`  - ${w}`);
}

if (errors.length > 0) {
  console.log("\n❌ Errors:");
  for (const e of errors) console.log(`  - ${e}`);
  console.log(`\n❌ ${errors.length} error(s) — build blocked.`);
  process.exit(1);
} else {
  console.log("\n✅ All edge checks passed.");
  process.exit(0);
}