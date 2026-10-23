"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { GreekColumns } from "@/components/GreekColumns";
import { ArtLayer } from "@/components/art/ArtLayer";
import { GoldDust } from "@/components/GoldDust";
import { Logo } from "@/components/Logo";
import { SpatialBox } from "@/components/spatial/SpatialBox";
import { PhilosopherLenses } from "@/components/lenses/PhilosopherLenses";
import { lensById, type Lens } from "@/components/lenses/lensToken";
import { useAuth } from "@/lib/auth/AuthContext";

/**
 * The landing.
 *
 * Deliberately chromeless: `CHROMELESS_ROUTES` in `lib/nav` keeps the shell off
 * this route, so there is no rail and no bottom bar. One logo, one title, one
 * line of definition, one button. A nav beside it would read as a dashboard
 * rather than an arrival.
 *
 * ## What arrives from the URL
 *
 * `?philosopher=plato` preselects a lens, and `?q=…` carries an opening question
 * written on a different page. Both are read once, on mount, and both resolve
 * through `lensById` — an unrecognised value yields `null`, never a silent
 * fallback, so a stale link shows the neutral hero rather than putting someone
 * else's name on the button.
 *
 * The context is carried as **query parameters**, not `sessionStorage`. They
 * survive a paste, a refresh and a back-navigation, and they reach `/enter`
 * without the reader having to be signed in first.
 */

export function UtopiaHero() {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const params = useSearchParams();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");

  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });

  // Three depths only. More layers costs paint time and reads as noise.
  const farY = useTransform(scrollYProgress, [0, 1], [0, 40]);
  const midY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const contentY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.65], [1, 0]);

  const title = "عقل في صندوق";
  // Word-level reveal, never per-character: splitting Arabic into isolated
  // characters breaks cursive joining and the word renders disconnected.
  // Words stay intact (joining preserved); the stagger runs across words.
  const words = title.split(" ");

  // Incoming context, read once. `useSearchParams` returns a new identity on some
  // navigations, so this is keyed off the string values rather than the object.
  const incomingPhilosopher = params.get("philosopher");
  const incomingQuestion = params.get("q");

  useEffect(() => {
    if (lensById(incomingPhilosopher)) setSelectedId(incomingPhilosopher);
    if (incomingQuestion) setQuestion(incomingQuestion);
  }, [incomingPhilosopher, incomingQuestion]);

  const lens: Lens | null = lensById(selectedId);

  const { user } = useAuth();
  const isLoggedIn = Boolean(user);

  /*
    `--lens-accent` is set once, on the hero root, and inherited by every descendant.
    That is how the halo the reader chooses on the strip reaches the 3D box: no
    shared context, no prop drilling, no global — one custom property crossing the
    component boundary the way the cascade is meant to.
  */
  const accentStyle = {
    "--lens-accent": lens ? lens.accentVar : "var(--gold-antique)",
  } as React.CSSProperties;

  const targetHref = targetHrefFor(selectedId, question, isLoggedIn);

  const commit = useCallback(
    (id: string) => {
      setSelectedId(id);
      // Changing the philosopher invalidates a question written for the last one.
      setQuestion("");
    },
    []
  );

  const onAsk = useCallback(() => {
    router.push(targetHref);
  }, [targetHref, router]);

  return (
    <div
      ref={ref}
      style={accentStyle}
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden"
    >
      {/*
        Depth order, back to front: the horizon glow (slowest) → the box → the
        colonnade engraving → gold dust → grain. The box sits *behind* the text
        column and carries no content, so it can bloom open without moving a
        single glyph.
      */}
      <motion.div aria-hidden="true" style={{ y: farY }} className="absolute inset-0">
        <div className="absolute inset-x-0 top-1/2 h-[46vh] -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,rgba(212,175,55,0.09),transparent_70%)]" />
      </motion.div>

      <div className="absolute inset-0">
        <SpatialBox />
      </div>

      <motion.div aria-hidden="true" style={{ y: midY }} className="absolute inset-0">
        {/*
          `eager`: this is the largest above-the-fold asset on the landing page and
          the element the browser will attribute LCP to. Left lazy, its bytes were
          only requested once the reader started scrolling — after the metric had
          already been recorded. It is a background layer, so there is nothing below
          the fold competing with it for bandwidth.
        */}
        <ArtLayer id="colonnade" eager fallback={<GreekColumns />} />
      </motion.div>

      <GoldDust count={52} />

      {/* Breaks the banding a near-black gradient shows on any display. */}
      <div aria-hidden="true" className="film-grain absolute inset-0 z-20" />

      <motion.div
        style={{ y: contentY, opacity: contentOpacity }}
        className="relative z-10 flex w-full flex-col items-center px-5 text-center"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          className="gold-glow display-arabic mb-8 flex size-24 items-center justify-center rounded-full border border-white/10 bg-white/[0.07] text-zinc-100 backdrop-blur-xl shadow-2xl"
        >
          {/*
            `priority` because this is inside the first viewport and is the
            largest above-the-fold asset the browser can attribute. Its glow is
            the same `.gold-glow` the box core warms into, so the mark and the
            object behind it read as one light source.
          */}
          <Logo size={68} ariaLabel="شعار عقل في صندوق" priority />
        </motion.div>

        <h1
          className="gold-text-glow display-arabic max-w-3xl text-4xl font-bold leading-relaxed text-gold-light sm:text-6xl lg:text-8xl"
          aria-label={title}
        >
          {words.map((word, i) => (
            <motion.span
              key={`${word}-${i}`}
              aria-hidden="true"
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.7,
                // A short stagger across words. The previous 120ms-per-word ran
                // past a second before the last word landed, which delayed the
                // LCP element itself; 80ms assembles the line without holding
                // the largest paint hostage to its own choreography.
                delay: i * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="inline-block"
            >
              {word}
              {i < words.length - 1 ? " " : ""}
            </motion.span>
          ))}
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="display-latin mt-6 mb-3 tracking-[0.25em] text-xs md:text-sm text-amber-400/80 font-medium"
        >
          MIND IN A BOX
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, delay: 0.26, ease: [0.22, 1, 0.36, 1] }}
          className="display-arabic mt-7 max-w-xl text-base leading-loose text-gold-muted/80 sm:text-lg"
        >
          لا تسأل لتجد الإجابة، بل تساءل لترتقي بوعيك.
          <br />
          ملاذك الفلسفي للذكاء الاصطناعي، في بيئة معزولة عن ضجيج العالم.
        </motion.p>

        {/* The lenses replace the old static row of names. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.4 }}
          className="mt-12 w-full"
        >
          <PhilosopherLenses selected={selectedId} onSelect={commit} />
        </motion.div>

        {/* The opening question. Optional — the portal works without it. */}
        <motion.form
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          onSubmit={(e) => {
            e.preventDefault();
            onAsk();
          }}
          className="mt-8 flex w-full max-w-xl items-center gap-2"
        >
          <label htmlFor="hero-q" className="sr-only">
            اكتب تساؤلك الأول
          </label>
          <input
            id="hero-q"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={400}
            placeholder="اكتب تساؤلك الأول…"
            className="field flex-1 bg-white/[0.04] text-sm backdrop-blur-xl border border-white/10"
          />
          <button
            type="submit"
            disabled={!question.trim()}
            className="btn-ghost shrink-0 px-5 py-3 text-xs disabled:cursor-not-allowed disabled:opacity-40"
          >
            احمله معي
          </button>
        </motion.form>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, delay: 0.58, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10"
        >
          {/*
            The label is the selection. With a philosopher it says who waits on
            the other side; without one it stays the invitation it always was.
            The href carries the same two values the form does, so the two routes
            agree on what they carry.
          */}
          <Link href={targetHref} className="btn-gold px-10 py-5 text-base sm:px-12 sm:text-lg">
            <span className="tracking-wide">
              {lens ? `ادخل العزلة مع ${lens.nameAr}` : "ابدأ رحلة الوعي"}
            </span>
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}

/**
 * The one place the portal's query string is assembled.
 *
 * If the user is logged in, routes directly to /wisdom; otherwise to /enter.
 */
function targetHrefFor(philosopherId: string | null, question: string, isLoggedIn: boolean): string {
  const base = isLoggedIn ? "/wisdom" : "/enter";
  const params = new URLSearchParams();
  if (philosopherId) params.set("philosopher", philosopherId);
  const q = question.trim();
  if (q) params.set("q", q);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export default UtopiaHero;