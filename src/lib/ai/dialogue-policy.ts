/**
 * Who gets how much of a dialogue.
 *
 * Extracted from the route so the policy can be tested directly. It is a product
 * decision — how many rounds a stranger may watch, and whether the summary is
 * theirs — and burying it in a route handler makes it untestable except by
 * signing in, which the e2e environment cannot do.
 *
 * The invariant this file exists to hold: **every number here comes from the
 * entitlement, never from the request.** A client-supplied `round` is checked
 * against the cap this module returns; it never widens it.
 */

/** Rounds a member gets. Three is the brief; more would be a different product. */
export const FULL_ROUNDS = 3;

/** Rounds anyone may watch before being invited. One, so the shape is clear. */
export const PREVIEW_ROUNDS = 1;

/**
 * How many rounds this visitor may have.
 *
 * One round is enough to show that two voices really disagree and that the
 * reader is being addressed rather than served a monologue — which is the only
 * thing a preview has to prove.
 */
export function roundCap(entitled: boolean): number {
  return entitled ? FULL_ROUNDS : PREVIEW_ROUNDS;
}

/**
 * Whether a neutral summary is produced.
 *
 * Members only. The summary is the part that makes the debate legible, so
 * withholding it is what makes the preview a preview rather than a free taste of
 * the whole product.
 */
export function summaryAllowed(entitled: boolean): boolean {
  return entitled;
}

/**
 * What the server sends once the dialogue has gone as far as it may.
 *
 * The client renders this; it does not decide it. Returning `preview_end` for a
 * non-member and `done` for a member keeps that distinction on the server, where
 * the entitlement actually is.
 */
export function terminalFor(entitled: boolean): "preview_end" | "done" {
  return entitled ? "done" : "preview_end";
}
