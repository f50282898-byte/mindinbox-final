"use client";

import { useTheme } from "@/components/ThemeProvider";

/**
 * GreekColumns — Authentic Colonnade Cinematography.
 *
 * In compliance with Requirement R2, procedural CSS gradient columns have been
 * replaced with authentic high-resolution multi-depth colonnade imagery delivered
 * via responsive <picture> tags (AVIF/WebP).
 */
export function GreekColumns({
  density = "full",
  className = "",
}: {
  density?: "full" | "sparse";
  className?: string;
}) {
  const { theme } = useTheme();
  const variant = theme === "light" ? "light" : "dark";
  const opacity = density === "sparse" ? 0.26 : 0.45;

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 z-0 overflow-hidden select-none ${className}`}
    >
      <picture>
        <source
          type="image/avif"
          srcSet={`/art/colonnade-${variant}-768.avif 768w, /art/colonnade-${variant}-1280.avif 1280w, /art/colonnade-${variant}-1920.avif 1920w`}
          sizes="100vw"
        />
        <source
          type="image/webp"
          srcSet={`/art/colonnade-${variant}-768.webp 768w, /art/colonnade-${variant}-1280.webp 1280w, /art/colonnade-${variant}-1920.webp 1920w`}
          sizes="100vw"
        />
        <img
          src={`/art/colonnade-${variant}-1920.webp`}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ objectPosition: "50% 100%", opacity }}
          className="h-full w-full object-cover transition-opacity duration-700"
        />
      </picture>
      <div className="absolute inset-0 bg-gradient-to-b from-[var(--bg-0)]/80 via-transparent to-[var(--bg-0)]" />
    </div>
  );
}

export default GreekColumns;