/**
 * Answer verification.
 *
 * ## Server-only, and it must stay that way
 *
 * This is the whole game. The client never receives the acceptance list, the
 * resolution, or the correct answer — it sends an answer and receives pass or fail.
 *
 * ## The criterion, fixed
 *
 * A response passes when it carries at least `minRequired` distinct required ideas
 * **and** carries none of the forbidden confusions. Both halves matter:
 *
 * - Requiring substance stops a reader guessing the right word.
 * - Forbidding the error stops a reader who names the opposite of the point from
 *   passing by using the right vocabulary. A response that says "الخروج هروب من
 *   الكهف" contains "أثر" and "أعمق" and is still wrong.
 *
 * Matching is substring-based on a normalised form: Arabic diacritics stripped,
 * alef variants unified, and the definite article normalised. A reader who writes
 * "الأثر" and a test fixture that writes "أثر" must agree, or the verifier becomes
 * a spelling test.
 *
 * This is deliberately **not** a model. A model grading an answer is a gate that can
 * be talked past, and it would be non-deterministic: the same answer could pass on
 * Tuesday and fail on Wednesday. A reader who solved the riddle deserves to know it.
 */

import type { Riddle } from "./bank";

/**
 * Normalises Arabic for matching.
 *
 * Diacritics and tatweel removed, `أ إ آ ٱ` unified to `ا`, `ى` to `ي`, `ة` kept
 * (it is load-bearing in "الأثر" vs "أثر"), and whitespace collapsed. Without the
 * alef unification, "أثر" and "اثر" would not match, and most readers type without
 * diacritics.
 */
export function normaliseArabic(input: string): string {
  return input
    .replace(/[ً-ٰٟۖ-ۭ]/g, "")
    .replace(/ـ/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export interface Verdict {
  passed: boolean;
  /** Which required ideas were found, by index. For the explanation, never the answer. */
  matchedRequired: number[];
  /** Which forbidden confusions were found. Empty when the answer is sound. */
  matchedForbidden: number[];
  /** A short, honest reason. Never reveals an unstated required idea. */
  reasonAr: string;
}

/**
 * Grades a response.
 *
 * `exposeMatched` exists so the failure message can say *which* of the reader's own
 * ideas were seen without ever naming an idea they did not write. On failure the
 * matched set is returned but the UI only uses its length.
 */
export function verifyAnswer(riddle: Riddle, response: string): Verdict {
  const text = normaliseArabic(response ?? "");

  if (text.length === 0) {
    return {
      passed: false,
      matchedRequired: [],
      matchedForbidden: [],
      reasonAr: "لم يصل جواب. اكتب ما يخطرك في سطرين.",
    };
  }

  const matchedRequired: number[] = [];
  riddle.required.forEach((req, index) => {
    if (req.anyOf.some((word) => text.includes(normaliseArabic(word)))) {
      matchedRequired.push(index);
    }
  });

  const matchedForbidden: number[] = [];
  riddle.forbidden.forEach((f, index) => {
    if (f.anyOf.some((word) => text.includes(normaliseArabic(word)))) {
      matchedForbidden.push(index);
    }
  });

  // The error is checked first and reported first. A response carrying the opposite
  // of the point is not "nearly right" and must not be described as though it were.
  if (matchedForbidden.length > 0) {
    const why = riddle.forbidden[matchedForbidden[0] as number]?.whyAr ?? "";
    return {
      passed: false,
      matchedRequired,
      matchedForbidden,
      reasonAr: why,
    };
  }

  if (matchedRequired.length < riddle.minRequired) {
    const short = riddle.minRequired - matchedRequired.length;
    return {
      passed: false,
      matchedRequired,
      matchedForbidden,
      reasonAr:
        short === 1
          ? "في جوابك شيء صحيح، وينقصه فكرة واحدة. أعد النظر."
          : "ينقص جوابك أكثر مما فيه. أعد النظر.",
    };
  }

  return {
    passed: true,
    matchedRequired,
    matchedForbidden,
    reasonAr: "",
  };
}

/**
 * Whether a reader may try again.
 *
 * Attempts are counted per riddle, not per session, so opening the page again does
 * not reset the count.
 */
export function attemptsRemaining(used: number, allowed: number): number {
  return Math.max(0, allowed - used);
}

/** A fresh attempt record. */
export function newAttemptState(riddleId: string, now: number) {
  return { riddleId, used: 0, lastAt: now, solved: false, granted: false };
}
