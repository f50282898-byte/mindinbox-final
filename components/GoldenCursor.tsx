"use client";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function GoldenCursor() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isPointer, setIsPointer] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
      const target = e.target as HTMLElement;
      setIsPointer(
        window.getComputedStyle(target).cursor === "pointer" || 
        target.tagName.toLowerCase() === "a" ||
        target.tagName.toLowerCase() === "button"
      );
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <>
      <motion.div
        className="pointer-events-none fixed top-0 left-0 z-[9999] hidden md:block rounded-full mix-blend-screen"
        animate={{
          x: position.x - (isPointer ? 16 : 8),
          y: position.y - (isPointer ? 16 : 8),
          width: isPointer ? 32 : 16,
          height: isPointer ? 32 : 16,
          backgroundColor: isPointer ? "rgba(212,175,55,0.1)" : "rgba(212,175,55,0.4)",
          border: isPointer ? "1px solid rgba(212,175,55,0.5)" : "none",
        }}
        transition={{ type: "spring", stiffness: 150, damping: 15, mass: 0.1 }}
      />
      <motion.div
        className="pointer-events-none fixed top-0 left-0 z-[9998] hidden md:block rounded-full bg-gold/10 blur-md"
        animate={{
          x: position.x - 24,
          y: position.y - 24,
          width: 48,
          height: 48,
        }}
        transition={{ type: "spring", stiffness: 50, damping: 20, mass: 0.5 }}
      />
    </>
  );
}
