"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function GoldenCursor() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    setOk(true);
    const fn = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
      const t = e.target as HTMLElement;
      setHover(window.getComputedStyle(t).cursor === "pointer" || t.tagName === "A" || t.tagName === "BUTTON");
    };
    window.addEventListener("mousemove", fn);
    return () => window.removeEventListener("mousemove", fn);
  }, []);

  if (!ok) return null;

  return (
    <>
      <motion.div
        className="pointer-events-none fixed top-0 left-0 z-[9999] hidden rounded-full mix-blend-screen md:block"
        animate={{
          x: pos.x - (hover ? 16 : 6), y: pos.y - (hover ? 16 : 6),
          width: hover ? 32 : 12, height: hover ? 32 : 12,
          backgroundColor: hover ? "rgba(212,175,55,0.08)" : "rgba(212,175,55,0.45)",
          border: hover ? "1px solid rgba(212,175,55,0.5)" : "none",
        }}
        transition={{ type: "spring", stiffness: 180, damping: 18, mass: 0.1 }}
      />
      <motion.div
        className="pointer-events-none fixed top-0 left-0 z-[9998] hidden rounded-full bg-gold/10 blur-md md:block"
        animate={{ x: pos.x - 22, y: pos.y - 22, width: 44, height: 44 }}
        transition={{ type: "spring", stiffness: 60, damping: 22, mass: 0.4 }}
      />
    </>
  );
}
