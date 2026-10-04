"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";

/**
 * The artwork layer.
 *
 * ## Decorative means decorative
 *
 * Background art is `aria-hidden` and `pointer-events-none`. It carries no information
 * that is not also in the text, so a screen reader announcing "image" is noise, and a
 * decorative element that intercepts a tap is a bug. The one non-decorative role is
 * `mark`, where the artwork *is* the logo — and even there the accessible name comes
 * from the product name, never from the filename.
 *
 * ## The scrim is not optional, and it needs no theme branch
 *
 * Text sits on top of this, and contrast cannot be guaranteed by the artwork — the
 * artwork is not ours to re-grade per theme, and the pixels under a line of text change
 * with the viewport width. So a scrim is always composited between image and content.
 *
 * It is built from the `volcanic` token, which is `#050505` in the dark theme and
 * `#f4efe4` in Parchment. One declaration therefore serves both themes: a dark scrim
 * over dark art, a pale scrim over pale art. An earlier version carried a
 * `[html[data-theme='light']_&]` override, which was redundant *and* would have broken
 * the moment a third theme appeared.
 *
 * `scripts/verify-contrast.mjs` measures text against the tokens. The scrim is what
 * makes that measurement true over an image rather than only over a flat colour.
 *
 * ## No layout shift, ever
 *
 * The wrapper carries an explicit `aspect-ratio` from the manifest, so the space is
 * reserved before the image arrives. `contain: paint` keeps the scroll-driven transform
 * off the main thread's layout path.
 *
 * ## The variant follows the toggle, not the OS
 *
 * The product has a theme control, so `prefers-color-scheme` would show the Parchment
 * artwork to a reader who explicitly chose dark. Two `<img>` elements with CSS
 * visibility would download both. One `<img>` whose `src` comes from `useTheme()`
 * downloads exactly one.
 *
 * ## Absent artwork is not an error at runtime
 *
 * `useArtAvailable()` checks for the generated `art-manifest.json`. Until the source
 * files are supplied it is absent, and the layer renders `null` — so a surface shows
 * its token background rather than a broken-image icon. The **build** is what fails on
 * missing art (`scripts/build-art.mjs`); the runtime degrades quietly by design.
 */

export type ArtId =
  | "emblem"
  | "colonnade"
  | "gate"
  | "hourglass"
  | "agora"
  | "cityscape"
  | "astrolabe";

interface ArtEntry {
  widths: number[];
  aspect: string;
  fit: "cover" | "contain";
  focal: string;
  opacity: number;
  scrim: "none" | "vertical" | "radial";
  parallax: number;
  role: "background" | "mark";
  /** `false` for artwork drawn once on black and used on both themes. */
  themed: boolean;
}

/**
 * The emitted set.
 *
 * Widths mirror `assets-source/manifest.json` and `scripts/build-art.mjs`'s naming.
 * `scripts/check-art.mjs` asserts all three agree — a width built but not listed here
 * would 404, and a missing background is silent.
 */
const ART: Record<ArtId, ArtEntry> = {
  emblem: { widths: [160, 320, 640], aspect: "1:1", fit: "contain", focal: "50% 50%", opacity: 1, scrim: "none", parallax: 0, role: "mark", themed: false },
  colonnade: { widths: [768, 1280, 1920], aspect: "21:9", fit: "cover", focal: "50% 100%", opacity: 0.5, scrim: "vertical", parallax: 0.22, role: "background", themed: true },
  gate: { widths: [640, 1280], aspect: "16:9", fit: "cover", focal: "50% 78%", opacity: 0.34, scrim: "radial", parallax: 0, role: "background", themed: true },
  hourglass: { widths: [640, 1280], aspect: "16:9", fit: "cover", focal: "50% 82%", opacity: 0.3, scrim: "radial", parallax: 0, role: "background", themed: true },
  agora: { widths: [768, 1280, 1920], aspect: "16:9", fit: "cover", focal: "50% 72%", opacity: 0.26, scrim: "vertical", parallax: 0.14, role: "background", themed: true },
  cityscape: { widths: [768, 1280, 1920], aspect: "32:9", fit: "cover", focal: "50% 88%", opacity: 0.28, scrim: "vertical", parallax: 0.18, role: "background", themed: true },
  astrolabe: { widths: [768, 1280, 1920], aspect: "21:9", fit: "cover", focal: "50% 62%", opacity: 0.24, scrim: "vertical", parallax: 0.1, role: "background", themed: true },
};

/** `{id}-{theme}-{width}.{ext}` — the exact name `build-art.mjs` writes. */
function pathFor(id: ArtId, theme: "dark" | "light", width: number, ext: "webp" | "avif") {
  return `/art/${id}-${theme}-${width}.${ext}`;
}

/** Whether `public/art/art-manifest.json` exists, i.e. whether the art was built. */
function useArtAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/art/art-manifest.json", { cache: "force-cache" })
      .then((res) => {
        if (!cancelled) setAvailable(res.ok);
      })
      .catch(() => {
        /* Offline or absent — the layer stays hidden, which is correct. */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return available;
}

export function ArtLayer({
  id,
  className = "",
  eager = false,
  /** Overrides the manifest opacity for a placement that must sit quieter. */
  opacity,
  /**
   * The placeholder shown until `npm run art:build` has run.
   *
   * Owned here rather than stacked behind the art in CSS, because two scrims over one
   * composition is a different picture than one. This component is the only thing that
   * knows whether the artwork exists, so it is the only place that can decide which of
   * the two to show.
   */
  fallback,
  children,
}: {
  id: ArtId;
  className?: string;
  eager?: boolean;
  opacity?: number;
  fallback?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const entry = ART[id];
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion() === true;
  const available = useArtAvailable();
  const ref = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);

  // Unthemed artwork is drawn once on black and used on both themes.
  const variant: "dark" | "light" = entry.themed ? theme : "dark";

  /* ── Parallax, by scroll position rather than by a library ────────────────
     One `transform: translateY` on a rAF-throttled scroll listener. No animation
     library: the effect is a single property, and framer-motion would be the largest
     thing in the bundle for it.

     Removed entirely under `prefers-reduced-motion`, not shortened. */
  useEffect(() => {
    if (reduceMotion || entry.parallax === 0) return;
    let frame = 0;

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const node = ref.current;
        if (!node) return;
        // Positive when the layer's top is below the viewport top.
        const progress = node.getBoundingClientRect().top / Math.max(1, window.innerHeight);
        // Clamped so a fast flick cannot fling the art off-screen.
        setShift(Math.round(Math.max(-40, Math.min(40, progress * entry.parallax * 100))));
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [reduceMotion, entry.parallax]);

  const srcSets = useMemo(
    () => ({
      avif: entry.widths.map((w) => `${pathFor(id, variant, w, "avif")} ${w}w`).join(", "),
      webp: entry.widths.map((w) => `${pathFor(id, variant, w, "webp")} ${w}w`).join(", "),
    }),
    [entry.widths, id, variant]
  );

  /** The `src` for browsers with no `<picture>` support — the largest width. */
  const fallbackSrc = pathFor(
    id,
    variant,
    entry.widths[entry.widths.length - 1] as number,
    "webp"
  );

  if (!available) {
    // The placeholder the caller supplied, if any. Rendered bare rather than inside
    // the positioned wrapper: the placeholders are themselves absolutely positioned,
    // so nesting them would offset them by one inset.
    return <>{fallback ?? null}</>;
  }

  return (
    <div
      ref={ref}
      aria-hidden={entry.role === "background" || undefined}
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      style={{ aspectRatio: entry.aspect, contain: "paint" }}
    >
      <picture>
        <source type="image/avif" srcSet={srcSets.avif} sizes="100vw" />
        <source type="image/webp" srcSet={srcSets.webp} sizes="100vw" />
        <img
          src={fallbackSrc}
          alt=""
          loading={eager ? "eager" : "lazy"}
          // Only meaningful for the LCP element; elsewhere it just competes with
          // real content for bandwidth.
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full"
          style={{
            objectFit: entry.fit,
            objectPosition: entry.focal,
            opacity: opacity ?? entry.opacity,
            transform: shift === 0 ? undefined : `translate3d(0, ${shift}px, 0)`,
          }}
        />
      </picture>

      {/* The scrim. `volcanic` is #050505 on dark and #f4efe4 on Parchment, so this one
          declaration is correct in both themes. See the note at the top. */}
      {entry.scrim === "vertical" && (
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-volcanic/85 via-volcanic/45 to-volcanic/95" />
      )}
      {entry.scrim === "radial" && (
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_62%_58%_at_50%_50%,rgb(var(--volcanic)/0.82),rgb(var(--volcanic)/0.4)_65%,transparent_88%)]" />
      )}

      {children}
    </div>
  );
}
