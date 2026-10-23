"use client";

import type { ReactNode } from "react";

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

/**
 * The artwork layer — image-free.
 *
 * All orange/blurred `.webp`/`.avif` background images are removed so they can
 * never compete with or blur the text. The component now only ever renders the
 * caller's pure-CSS geometric `fallback` (e.g. `GreekColumns`) or `null`; it
 * never loads artwork regardless of what `build-art.mjs` produced.
 */
export function ArtLayer({
  className = "",
  fallback,
  children,
}: ArtLayerProps) {
  return <>{fallback ?? null}</>;
}

export default ArtLayer;
