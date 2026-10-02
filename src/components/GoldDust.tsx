"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

interface Mote {
  id: number;
  left: number;
  size: number;
  duration: number;
  delay: number;
  drift: number;
  opacity: number;
}

/**
 * Suspended gold dust.
 *
 * Deterministic per-mount layout, animated purely in CSS (compositor-only
 * transforms) so hundreds of motes never block the main thread.
 */
export function GoldDust({
  count = 44,
  className = "",
}: {
  count?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [ready, setReady] = useState(false);

  // Generate after mount: avoids a hydration mismatch on Math.random().
  useEffect(() => {
    if (!reduceMotion) setReady(true);
  }, [reduceMotion]);

  const motes = useMemo<Mote[]>(() => {
    if (!ready) return [];
    return Array.from({ length: count }, (_, id) => ({
      id,
      left: Math.random() * 100,
      size: 1 + Math.random() * 2.4,
      duration: 14 + Math.random() * 22,
      delay: -Math.random() * 30,
      drift: (Math.random() - 0.5) * 90,
      opacity: 0.25 + Math.random() * 0.5,
    }));
  }, [count, ready]);

  if (reduceMotion) {
    return (
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 30%, rgba(212,175,55,0.06), transparent 70%)",
        }}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      {motes.map((mote) => (
        <span
          key={mote.id}
          className="animate-dust absolute bottom-[-8vh] rounded-full"
          style={{
            left: `${mote.left}%`,
            width: `${mote.size}px`,
            height: `${mote.size}px`,
            animationDuration: `${mote.duration}s`,
            animationDelay: `${mote.delay}s`,
            opacity: mote.opacity,
            // Consumed by the `dust-drift` keyframe in globals.css
            ["--dust-x" as string]: `${mote.drift}px`,
            background: "radial-gradient(circle, rgba(231,217,161,0.95), rgba(212,175,55,0.35))",
            boxShadow: "0 0 8px 1px rgba(212,175,55,0.35)",
          }}
        />
      ))}
    </div>
  );
}