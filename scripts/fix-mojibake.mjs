#!/usr/bin/env node
/**
 * Mojibake scanner and repair.
 *
 * ## What it detects
 *
 * decoded as cp1252 and then saved as if they were the text. Every character of
 * the word lands in U+00C0-U+00FF instead of the Arabic block, so a reader sees
 * a run of Latin-1 letters.
 *
 * The corrupted text is deliberately not reproduced here. This file is scanned by
 * `check-mojibake.mjs`, and a literal example would fail the gate on its own
 * documentation.
 *
 * ## Why this needed a detector at all
 *
 * Mojibake is *renderable*. Every corrupted glyph is a real Latin-1 letter, so the
 * text has a font, a colour, a contrast ratio and a bounding box. No contrast probe,
 * no clipping check, no axe rule and no character-count assertion will ever flag it.
 * The UI audit passed `/journal` at 2398 characters with every one of those
 * characters being garbage, because "enough text rendered" and "readable text
 * rendered" are different claims and only one of them is a proxy for quality.
 *
 * It surfaced here only by accident: the audit reports a clicked control's label as
 * its finding id, and the corrupted label is what finally made it legible.
 *
 * ## Repair
 *
 * Lossless and mechanical — `cp1252 bytes -> utf8` is the exact inverse of the
 * corruption, so this is decoding, not guessing. Every line is verified before it is
 * written, and the verification is what makes it safe to run unattended over source
 * code: a repair is accepted only when the bytes decode as valid UTF-8 (a fatal
 * decoder, so malformed bytes cannot pass as a success), only when the result
 * actually contains Arabic, and only when the ASCII skeleton is byte-identical, which
 * is what stops a bad decode from editing code that happens to sit beside a corrupted
 * string. A line that fails any check is reported and left alone, because a
 * hand-edit is required there and a wrong automatic fix would be invisible.
 *
 * Run: node scripts/fix-mojibake.mjs           (report only, writes nothing)
 *      node scripts/fix-mojibake.mjs --write   (repair, with verification)
 */

import { readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { checkMojibake, repairLine, MOJIBAKE_FILES } from "./lib/mojibake.mjs";

const roots = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const write = process.argv.includes("--write");
const targets = roots.length ? roots : ["src"];

/**
 * Accept a directory to walk or a single file, exactly as `check-mojibake.mjs`
 * does. The two are used together -- "the gate named this file, repair that file" --
 * so they must accept the same arguments.
 *
 * @param {string} target
 * @returns {string[]}
 */
function candidatesFor(target) {
  const abs = resolve(process.cwd(), target);
  try {
    return statSync(abs).isDirectory() ? MOJIBAKE_FILES(abs) : [abs];
  } catch {
    return [];
  }
}

let totalLines = 0;
let totalFiles = 0;
let totalRepaired = 0;
let totalUnrepairable = 0;
const unrepairable = [];

for (const root of targets) {
  const files = candidatesFor(root);
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const eol = src.includes("\r\n") ? "\r\n" : "\n";
    const lines = src.split(/\r?\n/);
    let fileBad = 0;
    let fileFixed = 0;
    const out = lines.map((line) => {
      const { hit } = checkMojibake(line);
      if (!hit) return line;
      fileBad++;
      const repaired = repairLine(line);
      if (repaired.ok) {
        fileFixed++;
        return repaired.text;
      }
      unrepairable.push({ file, line: repaired.text.slice(0, 120), reason: repaired.reason });
      return line;
    });

    if (fileBad === 0) continue;
    totalFiles++;
    totalLines += fileBad;
    totalRepaired += fileFixed;
    totalUnrepairable += fileBad - fileFixed;

    const shown = file.replace(`${process.cwd()}\\`, "").replace(/\\/g, "/");
    console.log(`${String(fileBad).padStart(4)} lines  ${shown}  (${fileFixed} repairable)`);

    if (fileFixed > 0) {
      if (write) {
        writeFileSync(file, out.join(eol), "utf8");
      } else {
        // Prove the repair works without touching the tree.
        const sample = lines.find((l) => checkMojibake(l).hit);
        const fixed = repairLine(sample);
        console.log(`      -  ${sample.trim().slice(0, 96)}`);
        console.log(`      +  ${fixed.ok ? fixed.text.trim().slice(0, 96) : "UNREPAIRABLE"}`);
      }
    }
  }
}

console.log(
  `\n${totalLines} mojibake line(s) in ${totalFiles} file(s): ` +
    `${totalRepaired} repairable, ${totalUnrepairable} not.`
);

if (unrepairable.length) {
  console.log("\nNeeds a human (not auto-repairable):");
  for (const u of unrepairable.slice(0, 20)) {
    console.log(`  ${u.file}  ${u.reason}`);
    console.log(`    ${u.line}`);
  }
}

if (!write && totalLines > 0) {
  console.log("\nDry run. Re-run with --write to repair.");
}

process.exit(totalLines > 0 && !write ? 1 : 0);
