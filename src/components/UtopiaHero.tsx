"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Link from "next/link";
import { useRef } from "react";
import { GreekColumns } from "@/components/GreekColumns";
import { GoldDust } from "@/components/GoldDust";

/**
 * Start Now — the single-button cinematic landing.
 *
 * The colonnade is procedural CSS (see `.greek-column`), lit by gold dust, and
 * reacts to scroll through Framer Motion parallax. No stock imagery.
 */
export function UtopiaHero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const contentY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.65], [1, 0]);

  return (
    <div ref={ref} className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      <div aria-hidden="true" className="absolute inset-0 void-vignette" />
      <GreekColumns />
      <GoldDust count={52} />

      <motion.div
        style={{ y: contentY, opacity: contentOpacity }}
        className="relative z-10 flex flex-col items-center px-5 text-center"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          className="gold-glow display-arabic mb-10 flex size-24 items-center justify-center rounded-full border border-gold/30 bg-black/70 text-gold-light backdrop-blur-md"
        >
          <span className="text-4xl font-bold leading-none">ع</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="gold-text-glow display-arabic max-w-3xl text-5xl font-bold leading-tight text-gold-light sm:text-7xl lg:text-8xl"
        >
          عقل في صندوق
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="display-latin mt-4 text-[11px] tracking-[0.45em] text-gold-muted/55 sm:text-xs"
        >
          MIND IN A BOX
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, delay: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="display-arabic mt-9 max-w-xl text-base leading-loose text-gold-muted/80 sm:text-lg"
        >
          لا تسأل لتجد الإجابة، بل تساءل لترتقي بوعيك.
          <br />
          ملاذك الفلسفي للذكاء الاصطناعي، في بيئة معزولة عن ضجيج العالم.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mt-12"
        >
          <Link href="/wisdom" className="btn-gold px-12 py-5 text-lg">
            <span className="tracking-widest">ابدأ الآن</span>
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 1.1 }}
          className="mt-16 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[10px] tracking-[0.3em] text-gold-muted/35"
        >
          <span>AESOP</span>
          <span className="text-gold/25">—</span>
          <span>PLATO</span>
          <span className="text-gold/25">—</span>
          <span>RUMI</span>
          <span className="text-gold/25">—</span>
          <span>DOSTOEVSKY</span>
        </motion.div>
      </motion.div>

      {/* Scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.4 }}
        style={{ opacity: contentOpacity }}
        aria-hidden="true"
        className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-2"
      >
        <span className="h-10 w-px bg-gradient-to-b from-transparent to-gold/40" />
        <span className="text-[9px] tracking-[0.3em] text-gold-muted/30">SCROLL</span>
      </motion.div>
    </div>
  );
}