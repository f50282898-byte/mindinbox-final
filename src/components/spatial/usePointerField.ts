"use client";

import { useEffect } from "react";

/**
 * The pointer field.
 *
 * One `requestAnimationFrame` loop for the whole spatial box, writing CSS custom
 * properties and nothing else. Three reasons that matters:
 *
 *  - **One loop, not one per animated element.** The tilt, the face separation and
 *    the core glow are all functions of the same pointer sample. Running them as
 *    separate loops would sample `clientX` three times a frame and triple the
 *    style-recalc cost for an identical result.
 *  - **Custom properties, not React state.** Every value here changes every frame.
 *    Routed through `useState` that is 60 renders a second of an entire subtree;
 *    written straight to `element.style` it is one style mutation and nothing
 *    re-renders. This is why `SpatialBox` has no `useState` at all.
 *  - **Frame-rate independent easing.** A naive `x += (target - x) * 0.1` is tied
 *    to the refresh rate — it converges twice as fast on a 120Hz display as on a
 *    60Hz one, so the same box feels different on different machines. The
 *    `1 - (1 - ease)^(dt/16.67)` form below converges on wall-clock time instead.
 *
 * The loop parks itself whenever the tab is hidden, the pointer has not moved, and
 * the box has settled — so an idle page costs nothing.
 */

export interface PointerFieldOptions {
  /** Tilt at the very edge of the viewport, in degrees. */
  maxTilt?: number;
  /** Chase speed. 0 = never moves, 1 = snaps. */
  ease?: number;
  /** True when the reader has asked for less motion. */
  enabled?: boolean;
}

/** How close to centre, as a fraction of the viewport, counts as "arriving". */
const CENTRE_BAND = 0.16;

/** A keypress blooms the box open, then it closes again on its own. */
const TYPING_BLOOM_MS = 2200;

/** Below this the box is not rendered at all — see `SpatialBox` for why. */
export function isLowPowerDevice(): boolean {
  if (typeof window === "undefined") return true;
  const cores = navigator.hardwareConcurrency;
  // Firefox and Safari on iOS report 0 or 8 here; treat an unknown as capable and
  // only cut the box on an explicitly low count.
  return typeof cores === "number" && cores > 0 && cores <= 4;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function usePointerField(
  ref: React.RefObject<HTMLElement | null>,
  { maxTilt = 11, ease = 0.075, enabled = true }: PointerFieldOptions = {}
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    // Normalised pointer position in [-1, 1]; 0,0 is the centre of the viewport.
    let tx = 0;
    let ty = 0;
    // Current, eased values. The custom properties the CSS reads.
    let cx = 0;
    let cy = 0;
    let open = 0;
    let core = 0;
    let coreTarget = 0;
    let bloomUntil = 0;
    let frame = 0;
    let last = 0;

    const write = () => {
      const s = el.style;
      s.setProperty("--rx", `${(-cy * maxTilt).toFixed(3)}deg`);
      s.setProperty("--ry", `${(cx * maxTilt).toFixed(3)}deg`);
      s.setProperty("--open", open.toFixed(4));
      s.setProperty("--core", core.toFixed(4));
    };

    // The loop only needs to run while something is actually moving. `settled`
    // latches once tilt, separation and glow are all within a hair of rest.
    const tick = (now: number) => {
      const dt = last ? Math.min(now - last, 64) : 16.667;
      last = now;

      const f = 1 - Math.pow(1 - ease, dt / 16.667);

      cx += (tx - cx) * f;
      cy += (ty - cy) * f;

      const nearCentre = Math.abs(cx) < CENTRE_BAND && Math.abs(cy) < CENTRE_BAND;
      const typing = now < bloomUntil;
      const openTarget = typing ? 1 : nearCentre ? 0.72 : 0;
      open += (openTarget - open) * (1 - Math.pow(1 - 0.06, dt / 16.667));

      // The heart warms as the box opens, and a keypress warms it faster than a
      // slow drift toward the centre does.
      coreTarget = typing ? 1 : nearCentre ? 0.55 : 0;
      core += (coreTarget - core) * (1 - Math.pow(1 - 0.05, dt / 16.667));

      write();

      const settled =
        Math.abs(tx - cx) < 0.0008 &&
        Math.abs(ty - cy) < 0.0008 &&
        Math.abs(openTarget - open) < 0.002 &&
        Math.abs(coreTarget - core) < 0.002;

      if (settled) {
        frame = 0;
        write();
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const onPointerMove = (e: PointerEvent) => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      tx = (e.clientX / w) * 2 - 1;
      ty = (e.clientY / h) * 2 - 1;
      start();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Modifier chords are not "writing". A person holding Cmd to zoom is not
      // addressing the box.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      bloomUntil = performance.now() + TYPING_BLOOM_MS;
      start();
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      } else {
        start();
      }
    };

    write();
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ref, maxTilt, ease, enabled]);
}