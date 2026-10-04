"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The golden token.
 *
 * ## It is inserted by script, never shipped in the HTML
 *
 * The initial HTML of every page is fetched by anyone who wants to read it, and it is
 * what a crawler, a proxy, or a reader with JavaScript disabled sees. A token
 * present in that document is a token that has already been found. So the button is
 * rendered into the DOM only after a client-side effect decides the reader has won,
 * and the server never emits it.
 *
 * ## The accessible name is the whole point
 *
 * A small gold shape with no text is invisible to a screen reader and meaningless to
 * a keyboard user unless it says what it is. `aria-label` is «رمز غامض», constant and
 * unchanging, so a reader who tabs past it once knows what will happen next time.
 * The visible shape is decorative; the label is the content.
 *
 * ## Reduced motion
 *
 * `prefers-reduced-motion` removes the breathing animation entirely rather than
 * shortening it. A token that pulses is an invitation to keep looking; a token that
 * does not move at all when the reader has asked for stillness is the correct reading
 * of that request.
 */

/** Corner offsets as percentages of the stage. Kept away from every edge so the token
 *  never lands under a scrollbar, a sticky header, or the mobile bottom bar. */
const ANCHORS: Array<{ inline: number; block: number }> = [
  { inline: 8, block: 22 },
  { inline: 74, block: 14 },
  { inline: 12, block: 62 },
  { inline: 68, block: 68 },
  { inline: 46, block: 8 },
  { inline: 82, block: 44 },
];

/**
 * How long the token stays on screen before it is withdrawn.
 *
 * Long enough to be noticed by someone reading at their own pace, short enough that
 * a reader who closes the tab does not come back to a stale prize. A token is not
 * "yours until you claim it" — it is an invitation with a clock, and the clock is
 * the ten minutes already on the token itself.
 */
const VISIBLE_MS = 60_000;

export function GoldenToken({
  onActivate,
  reducedMotion,
}: {
  onActivate: () => void;
  reducedMotion: boolean;
}) {
  const [anchor, setAnchor] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A new position on every appearance, so a reader who claims one token and finds
  // another later is not handed the same spot twice. The starting index is derived
  // from the clock rather than stored, which is enough — this is atmosphere, not a
  // security property, and the token itself is signed.
  useEffect(() => {
    setAnchor(Math.floor(Date.now() / 1000) % ANCHORS.length);
    setLeaving(false);

    timer.current = setTimeout(() => setLeaving(true), VISIBLE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const withdraw = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setLeaving(true);
  }, []);

  const spot = ANCHORS[anchor] ?? ANCHORS[0];

  return (
    <div
      // `pointer-events: none` on the stage so the token never intercepts a tap meant
      // for the text underneath. The button re-enables it for itself.
      className="pointer-events-none fixed inset-0 z-40"
      aria-hidden={leaving}
    >
      <button
        type="button"
        onClick={() => {
          withdraw();
          onActivate();
        }}
        onBlur={withdraw}
        // Named once, and it does not change when the token moves. A label that
        // changed with position would make the button unlearnable.
        aria-label="رمز غامض"
        className={[
          "pointer-events-auto absolute grid place-items-center",
          "h-11 w-11 rounded-full",
          "border border-accent-solid/70",
          "bg-accent-quiet",
          "text-accent-solid",
          "transition-opacity duration-700",
          // Focus must be unmistakable: the token is small and low-contrast by design.
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-solid focus-visible:ring-offset-2 focus-visible:ring-offset-surface-solid",
          leaving ? "opacity-0" : "opacity-100",
          reducedMotion ? "" : "motion-safe:animate-pulse",
        ].join(" ")}
        style={{ insetInlineStart: `${spot.inline}%`, top: `${spot.block}%` }}
      >
        <span aria-hidden="true" className="text-base leading-none">
          ✦
        </span>
      </button>
    </div>
  );
}

/**
 * Reads the reduced-motion preference once, for the whole tree.
 *
 * A media query rather than a CSS-only animation because the token's *behaviour*
 * differs, not just its decoration: with motion reduced it does not pulse at all.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);

    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
