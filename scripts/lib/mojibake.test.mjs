/**
 * Tests for the mojibake detector.
 *
 * Arabic literals here are written as \u escapes on purpose. A test file that
 * contains real Arabic can itself be corrupted by a cp1252 round trip, and then it
 * would either fail for the wrong reason or -- worse -- pass while testing garbage.
 * An escaped literal has exactly one representation.
 */

import { describe, it, expect } from "vitest";
import {
  checkMojibake,
  checkUnrecoverable,
  repairLine,
  MOJIBAKE_FILES,
} from "./mojibake.mjs";

/** Reproduce the corruption: UTF-8 bytes read as cp1252. */
function corrupt(arabic) {
  return Buffer.from(arabic, "utf8").toString("latin1");
}

const UFFFD = String.fromCharCode(0xfffd);

describe("corruption and repair", () => {
  it("round-trips a word through the corruption and back", () => {
    const good = "اختر فيلسوفك";
    const bad = corrupt(good);

    expect(bad).not.toBe(good);
    expect(bad.length).toBeGreaterThan(good.length);

    const line = `{ ariaLabel: "${bad}" }`;
    expect(checkMojibake(line).hit).toBe(true);

    const fixed = repairLine(line);
    expect(fixed.ok).toBe(true);
    expect(fixed.text).toBe(`{ ariaLabel: "${good}" }`);
  });

  it("restores Arabic diacritics, not just base letters", () => {
    // Shadda on the jim, tanween fath on the alif, and a final hamza-free form.
    // These are the cases where a naive Latin-1 mapping loses or reorders marks.
    const good = "سجّل الدخول أولاً.";
    const fixed = repairLine(`message: "${corrupt(good)}"`);
    expect(fixed.ok).toBe(true);
    expect(fixed.text).toBe(`message: "${good}"`);
  });

  it("restores a Latin-1 high character that cp1252 remapped", () => {
    // The middle dot is U+00B7, byte 0xB7 in both cp1252 and Latin-1, but the
    // corruption also drags U+00C2 (A-circumflex) in front of it. A decoder that
    // ignores the 0x80-0x9F block gets this wrong in the other direction.
    const fixed = repairLine(`MEMBERSHIP ${corrupt("· العضوية")}`);
    expect(fixed.ok).toBe(true);
    expect(fixed.text).toBe("MEMBERSHIP · العضوية");
  });

  it("leaves the ASCII skeleton of the line untouched", () => {
    const line = `const x = { label: "${corrupt("اقتباسات")}", id: "quotes-1" };`;
    const fixed = repairLine(line);
    expect(fixed.ok).toBe(true);
    // Stripping every non-ASCII character must give the same string before and
    // after. This is the property that makes an unattended repair safe.
    const skeleton = (s) => s.replace(/[^\x00-\x7F]/g, "");
    expect(skeleton(fixed.text)).toBe(skeleton(line));
    expect(fixed.text).toContain('id: "quotes-1"');
  });
});

describe("false positives", () => {
  // Each of these was reported as corrupted by the first version of the detector,
  // which used a character blacklist. cp1252 maps UTF-8 bytes onto typographic
  // characters, and legitimate copy uses all of them.

  const cases = [
    ["an em dash in a comment", "  // a token without one is rejected — which is what we want"],
    ["a curly apostrophe", "  // doesn't matter — it's the caller's problem"],
    ["curly double quotes", '  // the "unavailable" path returns null'],
    ["an ellipsis character", "  // loading… then ready"],
    ["a circumflex accent", "  // naïve vs naive: both are 2 chars in UTF-8"],
    ["a non-breaking space", "  // a b"],
    ["French accents", "  // déjà vu, café, naïve"],
    ["an emoji", "  // done ✅"],
    ["real Arabic, uncorrupted", '  const label = "اقتباسات";'],
  ];

  for (const [label, line] of cases) {
    it(`does not flag ${label}`, () => {
      expect(checkMojibake(line).hit).toBe(false);
    });
  }

  it("reports a line with no non-ASCII at all as clean", () => {
    expect(checkMojibake("export const x = 1;").hit).toBe(false);
  });
});

describe("refusals", () => {
  it("refuses a line with nothing to repair", () => {
    const r = repairLine("export const x = 1;");
    expect(r.ok).toBe(false);
  });

  it("refuses a decode whose bytes were not valid UTF-8", () => {
    // 0xD8 followed by 0x41 is not a valid UTF-8 sequence, so this is not
    // mojibake -- it is just two Latin-1 characters that happen to look like one.
    const r = repairLine('x = "\u00D8A\u00D9B";');
    expect(r.ok).toBe(false);
  });
});

describe("unrecoverable text", () => {
  it("detects U+FFFD", () => {
    expect(checkUnrecoverable(`rejected ${UFFFD} which is`).hit).toBe(true);
  });

  it("detects a raw C1 control", () => {
    expect(checkUnrecoverable("a\u0085b").hit).toBe(true);
  });

  it("does not flag an em dash or a real Arabic letter", () => {
    expect(checkUnrecoverable("rejected — which is").hit).toBe(false);
    expect(checkUnrecoverable("اقتباسات").hit).toBe(false);
  });
});

describe("file discovery", () => {
  it("finds source files and does not descend into build output", () => {
    const files = MOJIBAKE_FILES(process.cwd());
    expect(files.length).toBeGreaterThan(10);
    expect(files.every((f) => /\.(ts|tsx|js|jsx|mjs|cjs|css|json|md)$/.test(f))).toBe(true);
    expect(files.some((f) => f.includes("node_modules"))).toBe(false);
  });
});
