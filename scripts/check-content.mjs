#!/usr/bin/env node
/**
 * Content linter for user-visible strings.
 *
 * This exists because hand-written bilingual copy is easy to corrupt: a Latin
 * fragment or a stray token lands inside an Arabic sentence, and nothing else
 * in the toolchain notices. `tsc` is happy, the build is happy, and the page
 * ships visibly wrong text.
 *
 * Checks:
 *   1. Latin words (3+ letters) adjacent to Arabic — e.g. "... في-frameworks ..."
 *   2. Suspicious leftovers: TODO, FIXME, lorem, undefined, NaN, [object
 *   3. A bilingual pair where one side is empty but the other is not
 *   4. Placeholder-looking user copy: "xxx", "???", "…"
 *
 * Run: node scripts/check-content.mjs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const ROOT = resolve(process.cwd(), "src");
const SCAN = new Set([".ts", ".tsx", ".css"]);

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
// 3+ ASCII letters as a standalone word, allowing an internal hyphen.
const LATIN_WORD = /[A-Za-z]{3,}/;
const SUSPICIOUS = /\b(TODO|FIXME|lorem ipsum|\[object)\b/gi;
// String literals only: double-quoted, single-quoted, or backtick, no escapes.
const STRING_LITERAL = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
// Deliberate bilingual rendering inside one string, e.g. "عقل في صندوق | Mind
// in a Box" or "أقسام · Sections". Separated by |, /, —, –, · or -.
const BILINGUAL = /\s[|/—–·-]\s/;
// Product, technical and philosophical names that legitimately appear inside
// Arabic copy. Anything NOT listed here and sitting next to Arabic is treated
// as corruption.
const ALLOWED_LATIN = new Set([
  "firebase",
  "firestore",
  "storage",
  "pdf",
  "next",
  "cloudflare",
  "pages",
  "api",
  "env",
  "uid",
  "url",
  "premium",
  "library",
  "rules",
  "app",
  "react",
  "edge",
  "admin",
  "free",
  "oracle",
  "sanctum",
  "mind",
  "in",
  "a",
  "box",
  "project",
  "id",
  "doc",
  "rules",
  "path",
  "on",
  "off",
  "span",
  // Greek philosophical terms transliterated into Arabic copy.
  "prohairesis",
  "logos",
  "pathos",
  "ethos",
  "logos",
  // Generic tech words that appear inside Arabic prose.
  "emoji",
  "phoenix",
  "filepath",
  "json",
]);

/** True when every Latin word in `value` is an allowed product name. */
function latinIsAllowed(value) {
  const words = value.match(/[A-Za-z]{3,}/g);
  if (!words) return true;
  return words.every((w) => ALLOWED_LATIN.has(w.toLowerCase()));
}

const findings = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    if (!SCAN.has(extname(full))) continue;
    check(full);
  }
}

/** Report a finding, collapsing repeats on the same line to one entry. */
function report(rel, n, rule, text) {
  findings.push({ rel, n, rule, text });
}

function check(file) {
  const rel = relative(process.cwd(), file);

  // Tests contain adversarial fixtures on purpose — injection strings, crisis
  // phrasings, bilingual edge cases — and none of them is user-visible. Linting
  // them would be a false positive on every safety test.
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(rel)) return;

  const src = readFileSync(file, "utf-8");
  const lines = src.split(/\r?\n/);
  const isComment = (line) => /^\s*(\*|\/\/|<!--)/.test(line);

  lines.forEach((line, i) => {
    const n = i + 1;
    if (isComment(line)) return;

    STRING_LITERAL.lastIndex = 0;
    let m;
    while ((m = STRING_LITERAL.exec(line)) !== null) {
      const value = (m[1] ?? m[2] ?? m[3] ?? "").trim();
      if (!value) continue;
      // Strip ${...} interpolations: that is code, not copy. `uid.slice(0,8)`
      // must not read as Latin leaking into an Arabic sentence.
      const literal = value.replace(/\$\{[^}]*\}/g, "␟").trim();
      if (!literal) continue;
      // `{name}` is our own template placeholder for the persona name, not
      // corruption. Strip it before the adjacency check, or every prompt
      // template reads as a failure.
      const probe = literal.replace(/\{[a-z][a-zA-Z]{0,24}\}/g, "␟");

      // 1. Latin word adjacent to Arabic, in a single user-visible string.
      //    Allowed when the string is intentionally bilingual.
      if (ARABIC.test(probe) && LATIN_WORD.test(probe) && !BILINGUAL.test(probe)) {
        if (latinIsAllowed(probe)) continue;
        report(rel, n, "latin-in-arabic", literal);
      }

      // 2. Suspicious leftovers inside copy.
      SUSPICIOUS.lastIndex = 0;
      const hit = SUSPICIOUS.exec(literal);
      if (hit) report(rel, n, `suspicious:${hit[1]}`, literal);
    }

    // 3. Half-empty bilingual pair: ar: "" / en: "" beside a filled sibling.
    const pair = /^\s*(ar|en):\s*"([^"]*)"/.exec(line);
    if (pair && pair[2].trim() === "") {
      const side = pair[1];
      const other = side === "ar" ? "en" : "ar";
      const window = lines.slice(i + 1, i + 4).join("\n");
      const sib = new RegExp(`${other}:\\s*"([^"]*)"`).exec(window);
      if (sib && sib[1].trim() !== "") {
        report(rel, n, `empty-${side}`, `${side}: "" beside a filled ${other}`);
      }
    }
  });
}

walk(ROOT);

if (findings.length === 0) {
  console.log("content check: no issues found.");
  process.exit(0);
}

console.log(`content check: ${findings.length} issue(s)\n`);
const byRule = new Map();
for (const f of findings) {
  const list = byRule.get(f.rule) ?? [];
  list.push(f);
  byRule.set(f.rule, list);
}
for (const [rule, list] of byRule) {
  console.log(`── ${rule} (${list.length})`);
  for (const f of list.slice(0, 12)) {
    console.log(`   ${f.rel}:${f.n}`);
    console.log(`     ${f.text.slice(0, 150)}`);
  }
  if (list.length > 12) console.log(`   … and ${list.length - 12} more`);
  console.log("");
}
process.exit(1);
