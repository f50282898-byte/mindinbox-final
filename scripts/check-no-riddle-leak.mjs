#!/usr/bin/env node
/**
 * Fails the build if a riddle answer can reach the browser.
 *
 * ## The rule
 *
 * The riddle is a gated game. Its answers are only meant for a reader who has
 * earned them, and `e2e/riddle.spec.ts` asserts that a signed-out response body
 * contains none of them. That test proves the *server* does not send them. It
 * cannot prove the *bundle* does not carry them, and a `"use client"` component
 * that holds `RIDDLES` in a literal is exactly how they would ship.
 *
 * This is the build-time half of the same guarantee: if any answer phrase appears
 * in a client chunk, in `public/`, or in a sourcemap, the build fails.
 *
 * ## Where the phrases come from
 *
 * `ANSWER_PHRASES` below must stay byte-identical to the three phrases in
 * `e2e/riddle.spec.ts` and to `RIDDLES` in `src/components/GoldenSymbols.tsx`.
 * They are duplicated rather than imported because this script runs against the
 * *built* tree with no module resolution — and, more to the point, because a
 * guard that imports the thing it guards is a guard that cannot fail.
 *
 * ## Current state
 *
 * `GoldenSymbols` is imported by nothing, so nothing leaks today and this gate
 * passes trivially. It exists for the day someone mounts it: that is the moment
 * the answers stop being a secret, and it should stop the build, not ship.
 *
 * Scans:
 *   - .next/static/**   the client bundle and its sourcemaps
 *   - public/**          anything served verbatim
 *
 * Run: node scripts/check-no-riddle-leak.mjs
 * Needs a build to have run.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const SCAN_DIRS = [".next/static", "public"];

/** Files worth reading. Text-ish only; skip large binaries. */
const SCAN_EXT = new Set([".js", ".mjs", ".cjs", ".json", ".map", ".css", ".html", ".txt"]);

const MAX_BYTES = 24 * 1024 * 1024;

/**
 * Distinctive fragments of the answer texts.
 *
 * Two sources, because there are two:
 *  - the three `RIDDLES[].answer` strings in `src/components/GoldenSymbols.tsx`,
 *    which are the ones that would actually ship if that component were mounted;
 *  - the acceptance and resolution phrases `e2e/riddle.spec.ts` asserts are absent
 *    from a signed-out response, which come from the philosophical answer bank.
 *
 * Each is a *fragment* rather than the whole sentence so a copy-editor rephrasing
 * the prose does not silently disarm the gate. Long enough that a collision with
 * ordinary UI copy is implausible — a false positive here would push someone
 * toward disabling the gate, and a disabled gate protects nothing.
 */
const ANSWER_PHRASES = [
  // GoldenSymbols RIDDLES[].answer
  "حين ينقص الهواء يخبو جمالها",
  "المسحُ يوسّعه",
  "الريح تولّد مني صدى غيري",
  // e2e/riddle.spec.ts — ANSWER_PHRASES
  "الأثر ينطبع في النفس",
  "العجز لا يعفيك",
  "داخل الإناء نفسه",
  // e2e/riddle.spec.ts — RESOLUTION_PHRASES
  "الأثر يخبر النفس",
  "أن تعرف الشر وتريد",
];

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.isFile() && SCAN_EXT.has(extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

if (!existsSync(SCAN_DIRS[0])) {
  console.error(
    "check-no-riddle-leak — .next/static not found. Run a build first (npm run build)."
  );
  process.exit(1);
}

let scanned = 0;
const leaks = [];

for (const dir of SCAN_DIRS) {
  if (!existsSync(dir)) continue;
  for (const file of walk(dir)) {
    let size = 0;
    try {
      size = statSync(file).size;
    } catch {
      continue;
    }
    if (size > MAX_BYTES) continue;

    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    scanned++;

    for (const phrase of ANSWER_PHRASES) {
      if (text.includes(phrase)) {
        leaks.push({ file: relative(process.cwd(), file), phrase });
      }
    }
  }
}

if (leaks.length) {
  console.error("check-no-riddle-leak — FAILED\n");
  for (const { file, phrase } of leaks) {
    console.error(`  ${file}`);
    console.error(`    contains riddle answer: ${phrase}`);
  }
  console.error(
    "\nThe riddle answers are only meaningful to a reader who has earned them." +
      "\nMove them behind the entitlement check — read them server-side and pass" +
      "\nthem to the client as a prop, or gate the whole component on the same" +
      "\ncondition /api/auth/entitlements already uses."
  );
  process.exit(1);
}

console.log(
  `check-no-riddle-leak — ${scanned} file(s) scanned, no riddle answer in the client bundle.`
);