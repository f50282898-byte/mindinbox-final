"use client";

import type { ReactNode } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { ART_AVAILABLE } from "@/lib/art/generated";

export type ArtId =
  | "colonnade"
  | "gate"
  | "hourglass"
  | "agora"
  | "cityscape"
  | "astrolabe";

interface ArtLayerProps {
  id?: ArtId;
  className?: string;
  eager?: boolean;
  opacity?: number;
  fallback?: ReactNode;
  children?: ReactNode;
}

const ART_SPECS: Record<
  ArtId,
  {
    widths: readonly number[];
    focal: string;
    opacity: number;
    scrim: "vertical" | "radial";
  }
> = {
  colonnade: { widths: [768, 1280, 1920], focal: "50% 100%", opacity: 0.5, scrim: "vertical" },
  gate: { widths: [640, 1280], focal: "50% 78%", opacity: 0.34, scrim: "radial" },
  hourglass: { widths: [640, 1280], focal: "50% 82%", opacity: 0.3, scrim: "radial" },
  agora: { widths: [768, 1280, 1920], focal: "50% 72%", opacity: 0.26, scrim: "vertical" },
  cityscape: { widths: [768, 1280, 1920], focal: "50% 88%", opacity: 0.28, scrim: "vertical" },
  astrolabe: { widths: [768, 1280, 1920], focal: "50% 62%", opacity: 0.24, scrim: "vertical" },
};

export function ArtLayer({
  id = "colonnade",
  className = "",
  eager = false,
  opacity,
  fallback,
  children,
}: ArtLayerProps) {
  const { theme } = useTheme();
  const variant = theme === "light" ? "light" : "dark";
  const spec = ART_SPECS[id];

  if (!spec || !ART_AVAILABLE[id]) {
    return <>{fallback ?? null}</>;
  }

  const avifSrcSet = spec.widths
    .map((w) => `/art/${id}-${variant}-${w}.avif ${w}w`)
    .join(", ");
  const webpSrcSet = spec.widths
    .map((w) => `/art/${id}-${variant}-${w}.webp ${w}w`)
    .join(", ");
  const fallbackSrc = `/art/${id}-${variant}-${spec.widths[spec.widths.length - 1]}.webp`;
  const finalOpacity = opacity ?? spec.opacity;

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden select-none ${className}`}
    >
      {fallback}
      <picture>
        <source type="image/avif" srcSet={avifSrcSet} sizes="100vw" />
        <source type="image/webp" srcSet={webpSrcSet} sizes="100vw" />
        <img
          src={fallbackSrc}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={eager ? "high" : "auto"}
          style={{
            objectPosition: spec.focal,
            opacity: finalOpacity,
          }}
          className="h-full w-full object-cover transition-opacity duration-700"
        />
      </picture>
      {spec.scrim === "radial" ? (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,var(--bg-0)_90%)]" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--bg-0)]/80 via-transparent to-[var(--bg-0)]" />
      )}
      {children}
    </div>
  );
}

export default ArtLayer;
