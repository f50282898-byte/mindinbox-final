"use client";

import { useEffect, useRef, useState } from "react";
import {
  isLowPowerDevice,
  prefersReducedMotion,
  usePointerField,
} from "@/components/spatial/usePointerField";

/**
 * The spatial box.
 *
 * ## Why CSS 3D and not a canvas
 *
 * Six faces and eight corners cannot tell you anything `transform: rotate3d()`
 * cannot. The difference between the two approaches is ~600KB of gzip, a second
 * GPU context competing with the page for the same compositor, and a WebGL
 * context lost every time the tab backgrounds. The geometry below lives entirely
 * in CSS custom properties, so the moment this outgrows CSS the swap is one
 * component and nothing that reads it has to change.
 *
 * ## It is atmosphere, never a target
 *
 * `pointer-events: none` and `aria-hidden`. A box that swallows a click is a
 * bug; a decorative object announced by a screen reader is noise. This is the
 * same rule `ArtLayer` follows, and it is why the whole thing is inert to
 * assistive technology rather than "role=img" with an empty label.
 *
 * ## Three gates, each for a different reason
 *
 *  1. `prefers-reduced-motion` — the reader has asked. No loop, no CSS animation.
 *  2. `hardwareConcurrency <= 4` — a six-face 3D transform on a mid-range phone
 *     competes with the scroll for the same frame budget. Better absent than
 *     janky, so this does not render at all.
 *  3. SSR safety — the gates read `window`, so the first paint must be the
 *     reduced variant and the full one may only appear after mount, or React
 *     reports a hydration mismatch.
 */

interface Face {
  /** A stable key, and a handy handle for anyone extending this. */
  readonly key: string;
  readonly transform: string;
  readonly className: string;
}

/**
 * The six faces. Each sits at `translateZ(±half)` so they meet in the middle when
 * closed; `.spatial-face` then adds `--open * --push` to that, which separates
 * them along their own normal rather than scaling the whole object.
 */
const FACES: readonly Face[] = [
  { key: "front", transform: "translateZ(calc(var(--half) + var(--open) * var(--push-near)))", className: "spatial-face-near" },
  { key: "back", transform: "translateZ(calc(var(--half) * -1 + var(--open) * var(--push-far)))", className: "spatial-face-far" },
  { key: "right", transform: "rotateY(90deg) translateZ(calc(var(--half) + var(--open) * var(--push-near)))", className: "spatial-face-near" },
  { key: "left", transform: "rotateY(-90deg) translateZ(calc(var(--half) + var(--open) * var(--push-near)))", className: "spatial-face-near" },
  { key: "top", transform: "rotateX(90deg) translateZ(calc(var(--half) + var(--open) * var(--push-near)))", className: "spatial-face-near" },
  { key: "bottom", transform: "rotateX(-90deg) translateZ(calc(var(--half) + var(--open) * var(--push-near)))", className: "spatial-face-near" },
];

export function SpatialBox() {
  const ref = useRef<HTMLDivElement>(null);

  // `null` means "not yet decided" — the first paint, on either the server or the
  // client, is the inert version. Deciding after mount keeps the two trees equal.
  const [active, setActive] = useState<boolean | null>(null);

  useEffect(() => {
    setActive(!isLowPowerDevice() && !prefersReducedMotion());
  }, []);

  usePointerField(ref, { enabled: active === true });

  return (
    <div aria-hidden="true" className="spatial-stage">
      <div ref={ref} className={`spatial-cube ${active ? "spatial-breathe" : ""}`}>
        <div className="spatial-core" />

        {FACES.map((face) => (
          <div
            key={face.key}
            className={`spatial-face ${face.className}`}
            style={{ transform: face.transform }}
          />
        ))}

        {/* The three lit axes. Not a full wireframe: twelve edges is a cage, and a
            cage reads as "debug view". Three reads as light catching a form. */}
        <div
          className="spatial-edge"
          style={{ left: "50%", top: 0, width: "1px", height: "100%", translate: "-50% 0" }}
        />
        <div
          className="spatial-edge"
          style={{ top: "50%", left: 0, height: "1px", width: "100%", translate: "0 -50%" }}
        />
        <div
          className="spatial-edge"
          style={{
            left: "50%",
            top: "50%",
            width: "1px",
            height: "72%",
            translate: "-50% -50%",
            rotate: "28deg",
          }}
        />
      </div>
    </div>
  );
}

export default SpatialBox;