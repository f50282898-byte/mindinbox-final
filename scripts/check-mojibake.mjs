#!/usr/bin/env node
/**
 * Mojibake gate.
 *
 * Fails the build if any source file contains Arabic that was written through a
 * cp1252 round trip, or text whose original bytes were discarded.
 *
 * ## Why this is a build gate and not a lint rule
 *
 * Corrupted Arabic is *renderable*. Every mojibake glyph is an ordinary Latin-1
 * letter, so it has a font, a colour, a measured contrast ratio and a bounding box.
 * Every automated check this project owns passed straight over it. The UI audit
 * rendered `/journal` at 2398 "characters" with a character count that was pure
 * noise. axe found nothing. The contrast probe found nothing. The clipping probe
 * found nothing. 433 unit tests passed.
 *
 * That is the whole argument for the gate: a defect class that satisfies every
 * quality check in the pipeline is only caught by checking for the one thing all of
 * those checks assume — that the text is the text it was written as.
 *
 * 337 lines across 11 files were found this way. Every user-facing Arabic string on
 * the journal, the account panel, the dialogue, the wisdom panel, the quotes, the
 * tracker, the membership page, the riddle dialog and the shell navigation.
 *
 * Run: node scripts/check-mojibake.mjs [paths...]
 */

import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  checkMojibake,
  checkUnrecoverable,
  repairLine,
  MOJIBAKE_FILES,
} from "./lib/mojibake.mjs";

const args = process.argv.slice(2);
/** @type {string[]} */
const targets = args.length ? args : ["src", "scripts"];

/** @returns {string[]} */
function candidatesFor(target) {
  const abs = resolve(process.cwd(), target);
  try {
    return statSync(abs).isDirectory() ? MOJIBAKE_FILES(abs) : [abs];
  } catch {
    return [];
  }
}

let files = 0;
let lines = 0;
/** @type {{ file: string, bad: number[], lost: number[] }[]} */
const report = [];

for (const target of targets) {
  for (const file of candidatesFor(target)) {
    const src = readFileSync(file, "utf8");
    const all = src.split(/\r?\n/);
    /** @type {number[]} */
    const bad = [];
    /** @type {number[]} */
    const lost = [];
    all.forEach((line, i) => {
      if (checkMojibake(line).hit) bad.push(i + 1);
      else if (checkUnrecoverable(line).hit) lost.push(i + 1);
    });
    if (bad.length === 0 && lost.length === 0) continue;
    files++;
    lines += bad.length + lost.length;
    report.push({
      file: file.replace(`${process.cwd()}\\`, "").replace(/\\/g, "/"),
      bad,
      lost,
    });
  }
}

if (files === 0) {
  console.log("mojibake: none found.");
  process.exit(0);
}

report.sort((a, b) => b.bad.length + b.lost.length - (a.bad.length + a.lost.length));

let repairable = 0;
let unrecoverable = 0;

console.error(`\n${lines} corrupted line(s) in ${files} file(s):\n`);
for (const r of report) {
  const src = readFileSync(resolve(process.cwd(), r.file), "utf8").split(/\r?\n/);
  console.error(`  ${String(r.bad.length + r.lost.length).padStart(4)}  ${r.file}`);

  for (const n of r.bad.slice(0, 2)) {
    const original = src[n - 1].trim();
    const fixed = repairLine(original);
    if (fixed.ok) repairable++;
    console.error(`       :${n}`);
    console.error(`         - ${original.slice(0, 100)}`);
    if (fixed.ok) console.error(`         + ${fixed.text.trim().slice(0, 100)}`);
    else console.error(`         ! needs a human: ${fixed.reason}`);
  }
  if (r.bad.length > 2) console.error(`       ... ${r.bad.length - 2} more repairable`);

  for (const n of r.lost) {
    unrecoverable++;
    console.error(`       :${n}  UNRECOVERABLE (bytes already discarded)`);
    console.error(`         ${src[n - 1].trim().slice(0, 100)}`);
  }
}

console.error(
  "\nArabic strings saved after a cp1252 round trip. They render as garbage to\n" +
    "every reader while passing contrast, clipping and axe checks.\n" +
    "Repair the repairable ones with:  node scripts/fix-mojibake.mjs --write\n" +
    "U+FFFD lines cannot be decoded back -- a human must retype them.\n"
);
console.error(`${repairable} repairable, ${unrecoverable} need a human.`);
process.exit(1);
