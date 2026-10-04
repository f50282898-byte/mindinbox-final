"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Link from "next/link";
import { useRef } from "react";
import { GreekColumns } from "@/components/GreekColumns";
import { ArtLayer } from "@/components/art/ArtLayer";
import { GoldDust } from "@/components/GoldDust";

/**
 * The landing.
 *
 * Deliberately chromeless: `CHROMELESS_ROUTES` in `lib/nav` keeps the shell off
 * this route, so there is no rail and no bottom bar. One logo, one title, one
 * line of definition, one button. A nav beside it would read as a dashboard
 * rather than an arrival.
 *
 * The horizon is procedural CSS (`.greek-column`) lit by gold dust, layered
 * three deep for parallax. No stock photography.
 *
 * The title reveals progressively: each character fades up in sequence rather
 * than the whole block fading at once, so the eye lands on the word rather than
 * on a rectangle.
 */
export function UtopiaHero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });

  // Three depths only. More layers costs paint time and reads as noise.
  const farY = useTransform(scrollYProgress, [0, 1], [0, 40]);
  const midY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const contentY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.65], [1, 0]);

  const title = "عقل في صندوق";

  return (
    <div
      ref={ref}
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden"
    >
      <div aria-hidden="true" className="absolute inset-0 void-vignette" />

      {/*
        Depth order, back to front: horizon glow (slowest) → the artwork colonnade →
        gold dust. Three layers is the budget; a fourth buys nothing visible and costs
        paint time on a mid-range phone.

        The colonnade was procedural CSS (`.greek-column`) and is now the real
        engraving. `ArtLayer` renders the CSS version as its `fallback` until
        `npm run art:build` has produced the files, so dropping the artwork in changes
        the page from "acceptable" to "intended" without ever leaving it broken — and
        without two scrims stacked over one composition.
      */}
      <motion.div aria-hidden="true" style={{ y: farY }} className="absolute inset-0">
        <div className="absolute inset-x-0 top-1/2 h-[46vh] -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,rgba(212,175,55,0.09),transparent_70%)]" />
      </motion.div>
      <motion.div aria-hidden="true" style={{ y: midY }} className="absolute inset-0">
        <ArtLayer id="colonnade" fallback={<GreekColumns />} />
      </motion.div>

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

        {/* Per-character reveal. Letters are marked aria-hidden and the word is
            exposed once to assistive tech, otherwise it reads letter by letter. */}
        <h1
          className="gold-text-glow display-arabic max-w-3xl text-5xl font-bold leading-tight text-gold-light sm:text-7xl lg:text-8xl"
          aria-label={title}
        >
          {Array.from(title).map((ch, i) => (
            <motion.span
              key={`${ch}-${i}`}
              aria-hidden="true"
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.7,
                // 90ms stagger: the word assembles left-to-right in reading
                // order without the whole line feeling slow.
                delay: 0.15 + i * 0.09,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="inline-block"
            >
              {ch === " " ? " " : ch}
            </motion.span>
          ))}
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="display-latin mt-4 text-[11px] tracking-[0.45em] text-ink-3 sm:text-xs"
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
          <Link href="/enter" className="btn-gold px-12 py-5 text-lg">
            <span className="tracking-widest">ابدأ الآن</span>
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 1.1 }}
          className="mt-16 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[10px] tracking-[0.3em] text-ink-3"
        >
          <span>AESOP</span>
          <span className="text-ink-3">—</span>
          <span>PLATO</span>
          <span className="text-ink-3">—</span>
          <span>RUMI</span>
          <span className="text-ink-3">—</span>
          <span>DOSTOEVSKY</span>
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.4 }}
        style={{ opacity: contentOpacity }}
        aria-hidden="true"
        className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-2"
      >
        <span className="h-10 w-px bg-gradient-to-b from-transparent to-gold/40" />
        <span className="text-[9px] tracking-[0.3em] text-ink-3">SCROLL</span>
      </motion.div>
    </div>
  );
}
