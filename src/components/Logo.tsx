"use client";

import Image from "next/image";

export interface LogoProps {
  /** Visual size of the logo mark. */
  size?: number;
  /** Whether to show the wordmark next to the mark. */
  withWordmark?: boolean;
  /** Additional className. */
  className?: string;
  /** aria-label override. */
  ariaLabel?: string;
  /**
   * Eager-load and de-prioritise the preload scanner.
   *
   * Only for a logo inside the first viewport. `next/image` lazy-loads by default,
   * which means a hero logo asks for its own bytes *after* the browser has already
   * been told what the LCP element is — the image arrives one round trip late for
   * a 1.7KB file. Off everywhere else, where it would only compete with real
   * content for bandwidth.
   */
  priority?: boolean;
}

/**
 * Official supplied mark. The artwork includes its ivory ground, so it remains
 * legible in both themes without recolouring the source.
 */
export function Logo({
  size = 32,
  withWordmark = false,
  className = "",
  ariaLabel,
  priority = false,
}: LogoProps) {
  const defaultAriaLabel = `عقل في صندوق${withWordmark ? " — Mind in a Box" : ""}`;

  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`}
      aria-hidden={withWordmark ? "true" : undefined}
    >
      <Image
        src="/images/logo-128.webp"
        alt={withWordmark ? "" : ariaLabel ?? defaultAriaLabel}
        width={size}
        height={size}
        sizes={`${size}px`}
        unoptimized
        priority={priority}
        className="shrink-0 rounded-full bg-[#f8f4e8] object-contain"
      />

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