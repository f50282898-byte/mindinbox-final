#!/usr/bin/env node
/**
 * Validate the generated OpenNext Worker bundle before deployment.
 *
 * OpenNext's Cloudflare adapter runs Next.js on the Workers Node.js runtime;
 * Next.js Edge Runtime route exports are not supported by this adapter.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, extname, relative } from "node:path";

const ROOT = resolve(process.cwd());
const SRC = resolve(ROOT, "src");
const OUTPUT = resolve(ROOT, ".open-next");
const CONFIG = resolve(ROOT, "wrangler.jsonc");
const NODE_EDGE_RUNTIME = /export\s+const\s+runtime\s*=\s*["']edge["']/;
const SECRET_PATTERNS = [
  /gsk_[0-9A-Za-z]{20,}/,
  /nvapi-[0-9A-Za-z\-_]{20,}/,
  /sk-[0-9A-Za-z]{20,}/,
  /cfat_[0-9A-Za-z]{20,}/,
  /-----BEGIN [A-Z ]+-----[\r\n\\n]+[A-Za-z0-9+/=\r\n\\]{40,}-----END [A-Z ]+-----/,
  /AAAA[A-Za-z0-9_\-]{30,}/,
];

const errors = [];

function walk(dir, extensions) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(file, extensions));
    } else if (extensions.includes(extname(entry.name))) {
      files.push(file);
    }
  }
  return files;
}

console.log("Checking OpenNext Cloudflare Worker output...");

if (!existsSync(CONFIG)) {
  errors.push("wrangler.jsonc is missing");
} else {
  const config = readFileSync(CONFIG, "utf8");
  if (!/"main"\s*:\s*"\.open-next\/worker\.js"/.test(config)) {
    errors.push('wrangler.jsonc must set "main" to ".open-next/worker.js"');
  }
  if (!/"directory"\s*:\s*"\.open-next\/assets"/.test(config)) {
    errors.push('wrangler.jsonc must serve assets from ".open-next/assets"');
  }
}

const sourceFiles = walk(SRC, [".ts", ".tsx", ".js", ".mjs"]);
for (const file of sourceFiles) {
  const source = readFileSync(file, "utf8");
  if (NODE_EDGE_RUNTIME.test(source)) {
    errors.push(
      `${relative(ROOT, file)}: the Next.js Edge Runtime is unsupported by OpenNext; remove its runtime export`
    );
  }
}

const workerEntry = resolve(OUTPUT, "worker.js");
if (!existsSync(workerEntry)) {
  errors.push(".open-next/worker.js is missing; run `npm run build:worker` first");
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

console.log(`✓ OpenNext Worker and ${sourceFiles.length} source files passed.`);
