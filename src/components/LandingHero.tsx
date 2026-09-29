"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useState, type PointerEvent } from "react";

export function LandingHero() {
  const [lightPosition, setLightPosition] = useState({ x: 72, y: 38 });

  const moveLight = (event: PointerEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setLightPosition({
      x: ((event.clientX - bounds.left) / bounds.width) * 100,
      y: ((event.clientY - bounds.top) / bounds.height) * 100,
    });
  };

  return (
    <section
      onPointerMove={moveLight}
      className="relative mx-auto flex min-h-screen max-w-6xl items-center overflow-hidden px-6 py-24 lg:px-12"
      style={{
        background: `radial-gradient(ellipse at ${lightPosition.x}% ${lightPosition.y}%, rgba(212,175,55,0.16), transparent 42%)`,
      }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden w-[48%] items-end justify-center gap-3 opacity-60 lg:flex">
        <div className="absolute bottom-[34%] right-[18%] h-24 w-[58%] border-x border-t border-gold/30 bg-gradient-to-b from-gold/10 to-transparent" />
        <div className="absolute bottom-[calc(34%+6rem)] right-[14%] h-0 w-[66%] border-b-[22px] border-l-[18px] border-r-[18px] border-b-gold/35 border-l-transparent border-r-transparent" />
        <div className="absolute bottom-[29%] right-[12%] h-px w-[70%] bg-gold/40" />
        {[0, 1, 2, 3, 4].map((column) => (
          <div
            key={column}
            className="relative z-10 mb-[29%] h-[31%] w-8 border-x border-gold/25 bg-gradient-to-r from-gold/10 via-gold/5 to-transparent shadow-[0_0_28px_rgba(212,175,55,0.08)]"
            style={{ transform: `translateY(${column % 2 === 0 ? 0 : -12}px)` }}
          >
            <span className="absolute -top-2 -left-1 h-2 w-10 border border-gold/30 bg-obsidian/80" />
            <span className="absolute -bottom-1 -left-1 h-1 w-10 bg-gold/25" />
          </div>
        ))}
        <div className="absolute bottom-[29%] right-[7%] h-[15%] w-[82%] bg-gradient-to-t from-obsidian via-obsidian/80 to-transparent" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
        className="relative z-20 w-full"
      >
        <p className="mb-8 inline-flex items-center rounded-full border border-gold/30 bg-obsidian/80 px-5 py-2 text-[11px] uppercase tracking-[0.35em] text-gold-light backdrop-blur">
          Mind in a Box
        </p>

        <h1 className="max-w-3xl text-5xl font-bold leading-[1.15] tracking-tight text-gold-light md:text-6xl lg:text-7xl">
          \u0645\u0644\u0627\u0630\u0643 \u0627\u0644\u0641\u0644\u0633\u0641\u064A
          <br />
          <span className="gold-text-glow text-gold">\u0627\u0644\u0622\u0645\u0646.</span>
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-8 text-gold-muted/70 font-serif">
          \u0645\u0633\u0627\u062D\u0629 \u0631\u0627\u0642\u064A\u0629 \u0644\u0644\u062A\u0623\u0645\u0651\u0644 \u0648\u0627\u0644\u0628\u0635\u064A\u0631\u0629 \u0648\u0628\u0646\u0627\u0621 \u0627\u0644\u0639\u0627\u062F\u0627\u062A \u2014 \u0645\u062F\u0639\u0648\u0645\u0629 \u0628\u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A\u060C \u0645\u0635\u0645\u0651\u0645\u0629 \u0644\u0644\u0639\u0642\u0648\u0644 \u0627\u0644\u062A\u064A \u062A\u0631\u0641\u0636 \u0627\u0644\u0633\u0637\u062D\u064A\u0629.
        </p>

        <div className="mt-12 flex flex-wrap gap-4">
          <Link
            href="/utopia"
            className="gold-glow inline-flex items-center rounded-full bg-gold px-10 py-4 text-sm font-bold text-obsidian transition hover:scale-[1.03] active:scale-[0.98]"
          >
            \u0627\u062F\u062E\u0644 \u0627\u0644\u0645\u062F\u064A\u0646\u0629 \u0627\u0644\u0641\u0627\u0636\u0644\u0629
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
