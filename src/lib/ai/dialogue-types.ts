/**
 * Wire format for `/dialogue`.
 *
 * Separate from `StreamEvent` because the shape is genuinely different: a
 * dialogue is a multi-turn, multi-speaker sequence where the client must know
 * *which* philosopher is speaking before it renders a token, not after. Folding
 * this into the chat events would mean every consumer grew optional fields that
 * only ever make sense for one route.
 *
 * The invariant: `turn` and `summary` deltas are only valid between their
 * matching `*_start` and `*_end`, so a client can render a placeholder the
 * instant a speaker opens and never has to guess.
 */

export type DialogueEvent =
  /** A speaker begins. Carries the persona so the UI can label the bubble. */
  | { type: "turn_start"; round: number; personaId: string; nameAr: string; symbol: string }
  /** A chunk of this speaker's turn. */
  | { type: "turn_delta"; round: number; personaId: string; delta: string }
  /** This speaker has finished. */
  | { type: "turn_end"; round: number; personaId: string }
  /** The neutral summary begins. Carries no persona, by design. */
  | { type: "summary_start" }
  | { type: "summary_delta"; delta: string }
  | { type: "summary_end" }
  /** Remaining allowance, sent once the first token of the round arrives. */
  | { type: "quota"; remaining: number }
  /**
   * A non-member has had their single preview round.
   *
   * The client renders this as an invitation, not a wall — and the server is the
   * only thing that can send it, because the server is the only thing that knows
   * the entitlement.
   */
  | { type: "preview_end" }
  /** Terminal failure. No further events follow. */
  | { type: "error"; code: string; message: string }
  /** The response closed normally. */
  | { type: "done" };
