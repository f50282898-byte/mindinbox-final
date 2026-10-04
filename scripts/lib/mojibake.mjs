/**
 * Mojibake detection and verified repair, shared by `check-mojibake.mjs` (the
 * build gate) and `fix-mojibake.mjs` (the repair).
 *
 * ## The shape of the corruption
 *
 * Arabic written as UTF-8, then decoded as cp1252 and saved. The word "al-Qasida"
 * becomes a run of Latin-1 characters -- the same bytes, relocated into
 * U+00C0-U+00FF. It renders as garbage, and it is renderable garbage: every glyph
 * has a font, a colour, a measured contrast ratio and a bounding box.
 *
 * ## Why the detector is not a character blacklist
 *
 * The obvious approach -- flag the characters mojibake produces -- cannot work. It
 * has to include characters that legitimate copy uses, because cp1252 corruption
 * maps some UTF-8 byte values onto typographic characters: em dash, curly quotes,
 * ellipsis, circumflex accent. Those appear in ordinary English comments throughout
 * this repository. Flagging them reported *every file* as corrupted.
 *
 * So the test is not "does this line contain a suspicious character" but:
 *
 *   take a run of consecutive non-ASCII characters, decode it as cp1252 bytes, and
 *   check whether Arabic comes out.
 *
 * That is self-validating. A real mojibake run decodes to Arabic by construction.
 * A typographic dash, an apostrophe, a curly-quote pair: decode it as cp1252 and you
 * get more Latin-1 punctuation, not one character from the Arabic block. A false
 * positive is not "unlikely to be filtered out" -- it is structurally impossible.
 *
 * The consequence is that this detector has no threshold to tune and no
 * false-positive rate to tune it against.
 */

/** @typedef {{ ok: true, text: string } | { ok: false, text: string, reason: string }} Repair */

import { readdirSync } from "node:fs";
import { join } from "node:path";

/** Anything that could be part of a cp1252-mojibake run. */
const NON_ASCII = /[^\x00-\x7F]/;

/**
 * The Arabic blocks. Spelled as escapes so the file stays pure ASCII and cannot be
 * itself corrupted by whatever wrote it.
 *
 * Arabic Supplement, Arabic Presentation Forms-A, Presentation Forms-B, and the
 * Arabic Presentation Forms-A block that carries harakat and Quranic marks.
 */
const ARABIC =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/**
 * ASCII that reliably ends a corrupted token.
 *
 * ASCII round-trips through any codec, so stopping a run here cannot corrupt the
 * code around it.
 */
const BOUNDARY = /["'`<>(){}[\];,=|/]/;

function isBoundary(ch) {
  return ch !== undefined && BOUNDARY.test(ch);
}

/**
 * Maximal runs of consecutive non-ASCII characters.
 *
 * A space does not end a run, because a JSX text node or a prose string holds
 * several words and they are corrupted together.
 */
function runs(line) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    if (NON_ASCII.test(line[i])) {
      let j = i;
      while (j < line.length && !isBoundary(line[j])) j++;
      out.push(line.slice(i, j));
      i = j;
    } else {
      i++;
    }
  }
  return out;
}

/**
 * cp1252 code point to byte, for the 0x80-0x9F block.
 *
 * Node's `Buffer` supports `latin1` but **not** `cp1252`, and the two differ in
 * exactly this block: cp1252 maps those 32 byte values onto typographic characters
 * (em dash, curly quote, euro sign, double low quote, ellipsis, circumflex accent)
 * where latin1 maps them onto C1 controls. Since the corruption passed *through*
 * cp1252, the repair has to go back *through* cp1252. Reaching for `latin1` here
 * returns a byte that the round trip never produced, which is why the first
 * version of this file decoded nothing and reported a clean tree.
 *
 * Order matters. 0x81, 0x8D, 0x8F, 0x90 and 0x9D are C1 controls; if they were
 * listed first they would shadow the real typographic mappings.
 */
const CP1252_HIGH = [
  [0x20ac, 0x80], [0x0081, 0x81], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89],
  [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c], [0x008d, 0x8d], [0x017d, 0x8e],
  [0x008f, 0x8f], [0x0090, 0x90], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97], [0x02dc, 0x98],
  [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c], [0x009d, 0x9d],
  [0x017e, 0x9e], [0x0178, 0x9f],
];

const CP1252_REVERSE = (() => {
  const m = new Map();
  for (const [cp, byte] of CP1252_HIGH) if (!m.has(cp)) m.set(cp, byte);
  return m;
})();

/** @returns {Buffer | null} null when a character is not representable in cp1252. */
function toCp1252Bytes(text) {
  const bytes = [];
  for (const ch of text) {
    const cp = /** @type {number} */ (ch.codePointAt(0));
    if (cp > 0xff) {
      const mapped = CP1252_REVERSE.get(cp);
      if (mapped === undefined) return null;
      bytes.push(mapped);
    } else {
      bytes.push(cp);
    }
  }
  return Buffer.from(bytes);
}

/**
 * Fatal, so malformed UTF-8 throws instead of quietly yielding U+FFFD. That makes
 * the "produced a replacement character" check unnecessary: a decode that would have
 * produced one never returns.
 */
const UTF8 = new TextDecoder("utf-8", { fatal: true });

/** @returns {string | null} the decoded text, or null when the bytes were not UTF-8. */
function decode(run) {
  const bytes = toCp1252Bytes(run);
  if (bytes === null) return null;
  try {
    return UTF8.decode(bytes);
  } catch {
    return null;
  }
}

/** The ASCII skeleton: every non-ASCII character removed. */
function skeleton(s) {
  return s.replace(/[^\x00-\x7F]/g, "");
}

/**
 * Does this line contain mojibake?
 *
 * True only when some run decodes to Arabic. See the module comment: that is the
 * whole test, and it has no false-positive branch to tune.
 *
 * @returns {{ hit: boolean, run?: string }}
 */
export function checkMojibake(line) {
  if (!NON_ASCII.test(line)) return { hit: false };
  for (const run of runs(line)) {
    const text = decode(run);
    if (text && ARABIC.test(text)) return { hit: true, run };
  }
  return { hit: false };
}

/**
 * Repair a line, or refuse.
 *
 * Beyond producing Arabic, a repair must leave the ASCII skeleton byte-identical.
 * That is what makes it safe to run unattended over source code: a decode that
 * mangled a brace, a quote or an identifier is rejected, and the line is left alone
 * and reported for a human.
 *
 * A wrong automatic fix to user-facing copy is worse than a visible failure,
 * because a wrong fix does not look wrong.
 *
 * @param {string} line
 * @returns {Repair}
 */
export function repairLine(line) {
  if (!NON_ASCII.test(line)) {
    return { ok: false, text: line, reason: "no non-ASCII" };
  }

  let changed = false;
  let out = "";
  let i = 0;

  while (i < line.length) {
    if (NON_ASCII.test(line[i])) {
      const start = i;
      let j = i;
      while (j < line.length && !isBoundary(line[j])) j++;
      const run = line.slice(start, j);
      const text = decode(run);

      // Accept only a decode that yields Arabic *and* leaves the surrounding code
      // untouched. Anything else is passed through verbatim.
      if (text && ARABIC.test(text) && skeleton(text) === skeleton(run)) {
        out += text;
        changed = true;
      } else {
        out += run;
      }
      i = j;
    } else {
      out += /** @type {string} */ (line[i]);
      i++;
    }
  }

  if (!changed) {
    return {
      ok: false,
      text: line,
      reason: "no cp1252 run decodes to Arabic (not mojibake)",
    };
  }
  if (!ARABIC.test(out)) {
    return { ok: false, text: line, reason: "repaired line lost its Arabic" };
  }
  if (skeleton(out) !== skeleton(line)) {
    return { ok: false, text: line, reason: "ASCII skeleton changed -- would edit code" };
  }

  return { ok: true, text: out };
}

/**
 * Directories never worth scanning: dependencies, build output, version control.
 *
 * Without this, pointing the gate at the repository root walks `node_modules` --
 * tens of thousands of third-party files that are not ours to fix, and the one
 * genuinely interesting failure mode (a dependency shipping mojibake) is not the
 * one this gate exists to catch.
 */
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".vercel",
  ".git",
  ".turbo",
  "coverage",
  "dist",
  "out",
  ".wrangler",
  // Generated audit evidence. These files record what the broken UI looked like, so
  // they contain the corruption *on purpose*. "Repairing" them would falsify the
  // record of the defect, which is the one thing a before-shot must never do.
  "audit",
]);

/**
 * Every source file under `dir` worth scanning.
 *
 * @param {string} dir
 * @returns {string[]}
 */
export function MOJIBAKE_FILES(dir) {
  /** @type {string[]} */
  const out = [];
  /** @type {import("node:fs").Dirent[]} */
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...MOJIBAKE_FILES(full));
    else if (/\.(ts|tsx|js|jsx|mjs|cjs|css|json|md)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Unrecoverable text: U+FFFD, or a raw C1 control.
 *
 * This is the irreversible sibling of the corruption above. cp1252 mojibake keeps
 * the original bytes, just relocated, so decoding restores it. U+FFFD means
 * something decoded the text *non-fatally* and threw the bytes away, so no codec
 * can bring them back — the only repair is a human reading the sentence.
 *
 * It is checked separately rather than as part of `checkMojibake` because it is
 * reported, never fixed: silently substituting a plausible character is guessing,
 * and a wrong guess in user-facing copy is invisible.
 *
 * @param {string} line
 * @returns {{ hit: boolean, count: number }}
 */
export function checkUnrecoverable(line) {
  let count = 0;
  for (const ch of line) {
    const cp = /** @type {number} */ (ch.codePointAt(0));
    if (cp === 0xfffd || (cp >= 0x0080 && cp <= 0x009f)) count++;
  }
  return { hit: count > 0, count };
}
