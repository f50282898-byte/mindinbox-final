"use client";

import { useTheme } from "@/components/ThemeProvider";

export interface LogoProps {
  /** Visual size of the logo mark. */
  size?: number;
  /** Whether to show the wordmark next to the mark. */
  withWordmark?: boolean;
  /** Additional className. */
  className?: string;
  /** aria-label override. */
  ariaLabel?: string;
}

/**
 * Brand logo — a geometric mark derived from the "box" concept.
 *
 * The mark is a square with an inner glow suggesting "mind in a box".
 * Two colour variants:
 * - Dark theme: gold mark on dark surface
 * - Light (Parchment) theme: dark mark on gold surface
 *
 * This replaces the temporary Arabic letter "ع" that was used as a placeholder.
 * When a finalised SVG/WebP logo lands in `assets-source/logo-{dark,light}.svg`,
 * swap this component to render `<Image>` instead.
 */
export function Logo({
  size = 32,
  withWordmark = false,
  className = "",
  ariaLabel,
}: LogoProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const markColor = isDark ? "#D4AF37" : "#050505";
  const bgColor = isDark ? "#050505" : "#D4AF37";
  const glowColor = isDark ? "rgba(212, 175, 55, 0.6)" : "rgba(5, 5, 5, 0.4)";

  const defaultAriaLabel = `عقل في صندوق${withWordmark ? " — Mind in a Box" : ""}`;

  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`}
      aria-hidden={withWordmark ? "true" : undefined}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={ariaLabel ?? defaultAriaLabel}
        className="shrink-0"
      >
        {/* Outer box */}
        <rect
          x="4"
          y="4"
          width="56"
          height="56"
          rx="10"
          stroke={markColor}
          strokeWidth="3"
          fill="none"
        />
        {/* Inner glow square */}
        <rect
          x="16"
          y="16"
          width="32"
          height="32"
          rx="6"
          fill={markColor}
          filter="url(#innerGlow)"
        />
        {/* Central dot - the "mind" */}
        <circle
          cx="32"
          cy="32"
          r="6"
          fill={bgColor}
        />
        <defs>
          <filter id="innerGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feFlood floodColor={glowColor} result="glow" />
            <feComposite in="glow" in2="blur" operator="in" result="glow" />
            <feComposite in="SourceGraphic" in2="glow" operator="over" />
          </filter>
        </defs>
      </svg>

      {withWordmark && (
        <span className="display-arabic font-bold text-lg leading-none text-gold-light">
          عقل في صندوق
        </span>
      )}
    </span>
  );
}

/**
 * Favicon / app icon generator.
 *
 * Returns a data URL for an SVG favicon that adapts to the colour scheme
 * via `prefers-color-scheme` media query inside the SVG itself.
 * This single file serves both themes without JS.
 */
export function generateFaviconSVG(): string {
  return `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    @media (prefers-color-scheme: dark) {
      .mark { stroke: #D4AF37; }
      .inner { fill: #D4AF37; }
      .dot { fill: #050505; }
    }
    @media (prefers-color-scheme: light) {
      .mark { stroke: #050505; }
      .inner { fill: #050505; }
      .dot { fill: #D4AF37; }
    }
  </style>
  <rect class="mark" x="4" y="4" width="56" height="56" rx="10" stroke-width="3" fill="none"/>
  <rect class="inner" x="16" y="16" width="32" height="32" rx="6"/>
  <circle class="dot" cx="32" cy="32" r="6"/>
</svg>`;
}