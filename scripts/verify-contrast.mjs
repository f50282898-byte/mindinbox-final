#!/usr/bin/env node
/**
 * Contrast verifier — WCAG 2.1 relative luminance.
 *
 * Parses the real token values out of src/app/globals.css and checks every
 * declared text/surface pair. Fails if any pair is under the threshold, so a
 * future theme tweak cannot silently regress accessibility.
 *
 * Run: node scripts/verify-contrast.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf-8");
const THRESHOLD = 4.5; // AA for normal text

/* ── token extraction ──────────────────────────────────────────────────── */

function block(selector) {
  const i = CSS.indexOf(selector);
  if (i === -1) throw new Error(`selector not found: ${selector}`);
  const open = CSS.indexOf("{", i);
  let depth = 0;
  for (let j = open; j < CSS.length; j++) {
    if (CSS[j] === "{") depth++;
    else if (CSS[j] === "}") {
      depth--;
      if (depth === 0) return CSS.slice(open + 1, j);
    }
  }
  throw new Error(`unbalanced braces after ${selector}`);
}

function tokens(body) {
  // Strip comments first: a declaration sharing a fragment with a `/* ... */`
  // comment otherwise fails to parse and the token silently vanishes.
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = {};
  for (const line of clean.split(";")) {
    const m = /(--[a-z0-9-]+)\s*:\s*(.+)$/i.exec(line.trim());
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const dark = tokens(block(":root"));
const light = tokens(block('[data-theme="light"]'));

/* ── colour maths ──────────────────────────────────────────────────────── */

function parseHex(hex) {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
}

function composite(fg, bg) {
  // bg is opaque; fg may carry alpha
  const a = fg[3] ?? 1;
  return [
    fg[0] * a + bg[0] * (1 - a),
    fg[1] * a + bg[1] * (1 - a),
    fg[2] * a + bg[2] * (1 - a),
  ];
}

function parseColor(value, backdrop) {
  const v = value.trim();
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(v);
  if (rgba) {
    const p = rgba[1].split(",").map((x) => parseFloat(x));
    const rgb = [p[0] / 255, p[1] / 255, p[2] / 255];
    const a = p.length > 3 ? p[3] : 1;
    return backdrop ? composite({ ...rgb, 3: a }, backdrop) : rgb;
  }
  if (v.startsWith("#")) return parseHex(v);
  throw new Error(`cannot parse colour: ${value}`);
}

function luminance([r, g, b]) {
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/* ── pairs under test ──────────────────────────────────────────────────── */

// Text tokens against each background token they can appear on.
const PAIRS = [
  ["--text-1", "--bg-0"],
  ["--text-1", "--bg-1"],
  ["--text-1", "--surface-solid"],
  ["--text-2", "--bg-0"],
  ["--text-2", "--bg-1"],
  ["--text-2", "--surface-solid"],
  ["--text-3", "--bg-0"],
  ["--text-3", "--surface-solid"],
  // accent used as *text* on a background
  ["--accent", "--bg-0"],
  ["--accent", "--surface-solid"],
  // solid accent fill with its paired label
  ["--text-on-accent-solid", "--accent-solid"],
];

let failures = 0;
let checked = 0;

function run(themeName, t) {
  console.log(`\n${themeName}`);
  console.log("  pair                              ratio   verdict");
  for (const [fgName, bgName] of PAIRS) {
    const fgRaw = t[fgName];
    const bgRaw = t[bgName];
    if (!fgRaw || !bgRaw) {
      console.log(`  ${`${fgName} on ${bgName}`.padEnd(32)} MISSING TOKEN`);
      failures++;
      continue;
    }
    const bg = parseColor(bgRaw);
    const fg = parseColor(fgRaw, bg);
    const r = ratio(fg, bg);
    checked++;
    const ok = r >= THRESHOLD;
    if (!ok) failures++;
    console.log(
      `  ${`${fgName} on ${bgName}`.padEnd(32)} ${r.toFixed(2).padStart(5)}   ${ok ? "PASS" : "FAIL"}`
    );
  }
}

run("dark theme (:root)", dark);
run("light theme [data-theme=light]", light);

console.log(`\n${checked - failures}/${checked} pairs meet WCAG AA (>= ${THRESHOLD}:1)`);
if (failures) {
  console.error(`\n${failures} contrast failure(s).`);
  process.exit(1);
}
console.log("all pairs pass.");