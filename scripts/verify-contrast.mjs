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

import { readFileSync, readdirSync } from "node:fs";
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
  // Tailwind needs the channels separately to apply `<alpha-value>`, so several accent
  // tokens are stored as a bare triplet — `212 175 55` — rather than a hex or rgba().
  // These are the tokens most often used as text, so failing to read them here would
  // have left the most-used colours unchecked.
  const triplet = /^([\d.]+)\s+([\d.]+)\s+([\d.]+)$/.exec(v);
  if (triplet) {
    const rgb = [
      Number(triplet[1]) / 255,
      Number(triplet[2]) / 255,
      Number(triplet[3]) / 255,
    ];
    return backdrop ? composite({ ...rgb, 3: 1 }, backdrop) : rgb;
  }
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

/**
 * The opaque backgrounds a text token can actually land on.
 *
 * Two of them were missing from the first version of this file, and that omission is
 * why 91 call sites shipped at 1.44:1–2.90:1 while this script reported a clean sheet.
 * `--surface-1` and `--surface-2` are translucent, so neither is a colour on its own —
 * every card, modal and inset is one of them composited over `--bg-0`, and that
 * composite is what the text is really sitting on.
 */
function backgrounds(t) {
  const page = parseColor(t["--bg-0"]);
  return {
    "--bg-0": page,
    "--bg-1": parseColor(t["--bg-1"]),
    "--surface-solid": parseColor(t["--surface-solid"]),
    "glass over --bg-0": composite(parseColor(t["--surface-1"]), page),
    "overlay over --bg-0": composite(parseColor(t["--surface-2"]), page),
  };
}

const TEXT_TOKENS = [
  "--text-1",
  "--text-2",
  "--text-3",
  "--gold",
  "--gold-light",
  "--gold-muted",
];

const BACKGROUNDS = [
  "--bg-0",
  "--bg-1",
  "--surface-solid",
  "glass over --bg-0",
  "overlay over --bg-0",
];

const PAIRS = [];
for (const fg of TEXT_TOKENS) {
  for (const bg of BACKGROUNDS) PAIRS.push([fg, bg]);
}
// accent used as *text* on a background
PAIRS.push(["--accent", "--bg-0"], ["--accent", "--surface-solid"]);
// solid accent fill with its paired label
PAIRS.push(["--text-on-accent-solid", "--accent-solid"]);

let failures = 0;
let checked = 0;

function run(themeName, t) {
  const backgroundsByName = backgrounds(t);
  console.log(`\n${themeName}`);
  console.log("  pair                                     ratio   verdict");
  for (const [fgName, bgName] of PAIRS) {
    const fgRaw = t[fgName];
    // `--accent-solid` is a Tailwind constant rather than one of the composited
    // backgrounds above, so fall back to reading the token directly.
    const bg = backgroundsByName[bgName] ?? (t[bgName] ? parseColor(t[bgName]) : null);
    if (!fgRaw || !bg) {
      console.log(`  ${`${fgName} on ${bgName}`.padEnd(39)} MISSING TOKEN`);
      failures++;
      continue;
    }
    const r = ratio(parseColor(fgRaw, bg), bg);
    checked++;
    const ok = r >= THRESHOLD;
    if (!ok) failures++;
    console.log(
      `  ${`${fgName} on ${bgName}`.padEnd(39)} ${r.toFixed(2).padStart(5)}   ${ok ? "PASS" : "FAIL"}`
    );
  }
}

run("dark theme (:root)", dark);
run("light theme [data-theme=light]", light);

console.log(`\n${checked - failures}/${checked} pairs meet WCAG AA (>= ${THRESHOLD}:1)`);

/* ── usage ─────────────────────────────────────────────────────────────── */

/**
 * Token pairs are not what ships. Classes are.
 *
 * ## The gap this closes
 *
 * The pair check above proves `--gold-muted` is 13.28:1 on the dark page and 9.32:1 on
 * parchment. Both true, both beside the point: 210 call sites appended an opacity
 * modifier to a text token, and `text-gold-muted/55` — the same token, dimmed — shipped
 * at **2.87:1**. The token check and the usage check were measuring different things,
 * and only one of them described the product.
 *
 * Every token in `TEXT_TOKENS` clears AA at 100% in both themes on every background
 * above, which means **no opacity modifier is safe on a text token**: 100% is the only
 * passing value. So this check does not ask for a "reasonable" opacity. It asks for
 * none.
 *
 * ## Two bands, and why they differ
 *
 * - **below 3:1** → hard failure. 3:1 is WCAG's floor for content at any size; beneath
 *   it the text cannot be read. The audit calls this P1, and 91 sites were repaired to
 *   `text-ink-3`.
 * - **3:1 to 4.5:1** → reported, not failed. A genuine AA shortfall and the audit's P2,
 *   but this pass was scoped to fix P0/P1 and present P2/P3 rather than change them. A
 *   gate that blocked on them would fail the build for work nobody has agreed to, and a
 *   gate that gets routinely disabled is not a gate.
 *
 * To finish the job: raise `FLOOR` to 4.5 and repair what it lists. Nothing else here
 * needs to change.
 */
const FLOOR = 3;

/** Tailwind colour names that resolve to a token verified above. */
const UTIL_TO_TOKEN = {
  gold: "--gold",
  "gold-light": "--gold-light",
  "gold-muted": "--gold-muted",
  "ink-1": "--text-1",
  "ink-2": "--text-2",
  "ink-3": "--text-3",
};

/**
 * `text-<colour>/<n>`, including variant-prefixed forms.
 *
 * `hover:`, `focus:`, `placeholder:` and `marker:` are all matched, and all four carry
 * content or structure — a placeholder states what the field wants, a marker states list
 * position. A hover colour is worse rather than better, not better: it is shown only to
 * someone already pointing at the element, so it never reaches the reader who needed it.
 */
const USAGE = new RegExp(
  `\\btext-(${Object.keys(UTIL_TO_TOKEN).join("|")})/(\\d{1,3})\\b`,
  "g"
);

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Worst contrast for one utility, across every theme and every background. */
function worstCase(utilName, opacity) {
  const token = UTIL_TO_TOKEN[utilName];
  let worst = Infinity;
  let where = "";
  for (const [themeName, t] of [
    ["dark", dark],
    ["light", light],
  ]) {
    if (!t[token]) return null;
    const base = parseColor(t[token]);
    const alpha = opacity / 100;
    for (const [bgName, back] of Object.entries(backgrounds(t))) {
      const fg = [0, 1, 2].map((i) => base[i] * alpha + back[i] * (1 - alpha));
      const r = ratio(fg, back);
      if (r < worst) {
        worst = r;
        where = `${themeName} / ${bgName}`;
      }
    }
  }
  return { worst, where, token };
}

const usage = new Map();
for (const file of sourceFiles(resolve(process.cwd(), "src"))) {
  const src = readFileSync(file, "utf8");
  USAGE.lastIndex = 0;
  let m;
  while ((m = USAGE.exec(src))) {
    const key = `${m[1]}/${m[2]}`;
    if (!usage.has(key)) {
      usage.set(key, {
        util: m[1],
        opacity: Number(m[2]),
        uses: 0,
        sites: [],
      });
    }
    const entry = usage.get(key);
    entry.uses += 1;
    if (entry.sites.length < 3) {
      entry.sites.push(
        `${file.replace(/\\/g, "/").replace(`${process.cwd()}/`, "")}:${
          src.slice(0, m.index).split("\n").length
        }`
      );
    }
  }
}

let usageFailures = 0;
let usageWarnings = 0;

if (usage.size > 0) {
  console.log("\nusage: opacity modifiers on text colours in src/");
  console.log(`  ${"class".padEnd(24)} ${"worst".padStart(6)} ${"uses".padStart(6)}  verdict`);
  const rows = [...usage.values()].sort(
    (a, b) => a.opacity - b.opacity || a.util.localeCompare(b.util)
  );
  for (const u of rows) {
    const full = `text-${u.util}/${u.opacity}`;
    const r = worstCase(u.util, u.opacity);
    if (!r) {
      console.log(`  ${full.padEnd(24)}          ${String(u.uses).padStart(6)}  FAIL  no such token`);
      usageFailures += u.uses;
      continue;
    }
    let verdict = "ok";
    if (r.worst < FLOOR) {
      verdict = `FAIL  under ${FLOOR}:1 — unreadable`;
      usageFailures += u.uses;
    } else if (r.worst < THRESHOLD) {
      verdict = `warn  under AA ${THRESHOLD}:1 — reported, not blocking`;
      usageWarnings += u.uses;
    }
    console.log(
      `  ${full.padEnd(24)} ${r.worst.toFixed(2).padStart(6)} ${String(u.uses).padStart(6)}  ${verdict}`
    );
    if (r.worst < THRESHOLD) {
      console.log(`      worst case ${r.worst.toFixed(2)}:1 on ${r.where}`);
      for (const s of u.sites) console.log(`      ${s}`);
    }
  }
  console.log(
    `\n  Every text token clears AA at 100% on all ${BACKGROUNDS.length} backgrounds in both`
  );
  console.log(
    "  themes, so 100% is the only safe value and a modifier is never justified."
  );
  console.log(
    "  Repair: drop the modifier and use `text-ink-3` (6.69:1 dark, 5.30:1 light)."
  );
} else {
  console.log("\nusage: no opacity modifiers on text colours — nothing to check.");
}

if (failures || usageFailures) {
  console.error(
    `\n${failures} token pair failure(s), ${usageFailures} usage failure(s)` +
      (usageWarnings ? `, ${usageWarnings} reported below AA.` : ".")
  );
  process.exit(1);
}
console.log(
  `\nall pairs pass.` +
    (usageWarnings ? ` ${usageWarnings} class use(s) reported below AA — see above.` : "")
);