"use client";

import { useReducedMotion } from "framer-motion";
import { motion, useScroll, useTransform } from "framer-motion";
import { useMemo, useRef } from "react";

interface ColumnSpec {
  /** Percent of viewport width. */
  width: number;
  /** Percent of container height. */
  height: number;
  /** Scroll parallax depth: higher = slower = further away. */
  depth: number;
  /** Horizontal offset from the nearest edge, in percent. */
  inset: number;
  opacity: number;
}

/**
 * Procedurally drawn colonnade.
 *
 * Built entirely from CSS gradients (see `.greek-column` in globals.css) plus
 * Framer Motion parallax. No photography, no image assets — the fluting,
 * capital and base are all gradients, so the columns stay crisp at any DPR.
 *
 * `opacity` is depth fog: distant columns are dimmer. Because it multiplies
 * the gradient alpha inside `.greek-column`, values here must stay high
 * enough for the shafts to actually read as columns.
 */
const COLUMN_LAYOUT: ColumnSpec[] = [
  { width: 7, height: 60, depth: 0.9, inset: 2, opacity: 0.55 },
  { width: 9, height: 76, depth: 0.65, inset: 11, opacity: 0.75 },
  { width: 12, height: 92, depth: 0.4, inset: 21, opacity: 0.9 },
  { width: 8, height: 68, depth: 0.72, inset: 34, opacity: 0.68 },
  { width: 14, height: 100, depth: 0.25, inset: 47, opacity: 1 },
  { width: 8, height: 68, depth: 0.72, inset: 60, opacity: 0.68 },
  { width: 12, height: 90, depth: 0.42, inset: 70, opacity: 0.9 },
  { width: 9, height: 74, depth: 0.66, inset: 80, opacity: 0.75 },
  { width: 7, height: 58, depth: 0.92, inset: 91, opacity: 0.55 },
];

export function GreekColumns({ density = "full" }: { density?: "full" | "sparse" }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const columns = useMemo(
    () => (density === "sparse" ? COLUMN_LAYOUT.filter((_, i) => i % 2 === 0) : COLUMN_LAYOUT),
    [density]
  );

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      {/* Deep veil behind the colonnade.

          `var(--gold)` rather than the literal #D4AF37: that literal is the dark
          theme's accent, and in Parchment the accent is a different colour. */}
      <div className="animate-veil absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_50%_28%,rgb(var(--gold)/0.10),transparent_70%)]" />

      <div className="absolute inset-x-0 bottom-0 h-full">
        {columns.map((col, index) => (
          <ColumnItem
            key={index}
            spec={col}
            progress={scrollYProgress}
            reduceMotion={reduceMotion === true}
          />
        ))}
      </div>

      {/* Readability scrim: darkens the band the copy sits in, and the very top
          and bottom, so the colonnade reads as depth rather than content.

          Built from `var(--volcanic)` — #050505 in the dark theme, #f4efe4 in
          Parchment — so one declaration serves both: a dark scrim over dark art, a
          pale scrim over pale art. The two lines below already did this with
          `from-volcanic`; this gradient hardcoded `rgba(5,5,5,…)` instead, which in
          Parchment painted a near-black ellipse over cream paper and dropped the
          hero to 1.95:1. The sibling `art/ArtLayer` carries the same rule, and the
          reasoning, in its header comment. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_58%_44%_at_50%_50%,rgb(var(--volcanic)/0.86),rgb(var(--volcanic)/0.35)_62%,transparent_85%)]" />
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-volcanic to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-volcanic to-transparent" />

      {/* Horizon glow at the column base */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-gold/[0.05] to-transparent" />
    </div>
  );
}

function ColumnItem({
  spec,
  progress,
  reduceMotion,
}: {
  spec: ColumnSpec;
  progress: ReturnType<typeof useScroll>["scrollYProgress"];
  reduceMotion: boolean;
}) {
  // Each column drifts at its own rate: distant columns move less.
  const y = useTransform(
    progress,
    [0, 1],
    [reduceMotion ? 0 : 60, reduceMotion ? 0 : -60 * spec.depth]
  );
  const scaleY = useTransform(progress, [0, 0.5, 1], [1, 1.04, 1]);

  return (
    // Positioning lives in `style`, not in JSX attributes: motion components
    // forward `style` verbatim, whereas layout attributes passed alongside it
    // can be dropped, collapsing the column to zero size.
    <motion.div
      style={{
        y,
        scaleY,
        // RTL: the first column sits at the inline start, i.e. the right edge.
        right: `${spec.inset}%`,
        width: `${spec.width}%`,
        height: `${spec.height}%`,
      }}
      className="absolute bottom-0"
    >
      <div className="greek-column h-full w-full" style={{ opacity: spec.opacity }} />
      {/* Soft ground shadow anchoring the column to the floor */}
      <div className="absolute inset-x-[-40%] bottom-0 h-10 bg-[radial-gradient(ellipse_at_center,rgb(var(--gold)/0.18),transparent_70%)] blur-md" />
    </motion.div>
  );
}