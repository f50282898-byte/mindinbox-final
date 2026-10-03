import { describe, expect, it } from "vitest";
import {
  FULL_ROUNDS,
  PREVIEW_ROUNDS,
  roundCap,
  summaryAllowed,
  terminalFor,
} from "@/lib/ai/dialogue-policy";

/**
 * The dialogue access policy.
 *
 * The property that must hold: **nothing here reads the request.** Every answer
 * is a function of the entitlement alone, so a client that lies about its round
 * number gains nothing. If a value in this file ever started coming from input,
 * it would be a paywall bypass — which is why the file takes only a boolean.
 */

describe("roundCap", () => {
  it("gives a member three rounds", () => {
    expect(roundCap(true)).toBe(FULL_ROUNDS);
    expect(FULL_ROUNDS).toBe(3);
  });

  it("gives a guest exactly one round", () => {
    expect(roundCap(false)).toBe(PREVIEW_ROUNDS);
    expect(PREVIEW_ROUNDS).toBe(1);
  });

  it("never exceeds the full round count for anyone", () => {
    expect(roundCap(true)).toBeLessThanOrEqual(FULL_ROUNDS);
    expect(roundCap(false)).toBeLessThanOrEqual(FULL_ROUNDS);
  });

  it("depends on nothing but the boolean", () => {
    // Structural: the signature cannot accept a round number, so it cannot be
    // widened by a caller who supplies one.
    expect(roundCap.length).toBe(1);
    expect(roundCap(true)).toBe(roundCap(true));
    expect(roundCap(false)).toBe(roundCap(false));
  });
});

describe("summaryAllowed", () => {
  it("is for members only", () => {
    // The summary is what makes a debate legible, so it is the part a preview
    // must not hand over.
    expect(summaryAllowed(true)).toBe(true);
    expect(summaryAllowed(false)).toBe(false);
  });
});

describe("terminalFor", () => {
  it("ends a guest's dialogue with the invitation", () => {
    expect(terminalFor(false)).toBe("preview_end");
  });

  it("ends a member's dialogue normally", () => {
    expect(terminalFor(true)).toBe("done");
  });
});
