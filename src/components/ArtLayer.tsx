"use client";

import Image from "next/image";

interface ArtLayerProps {
  id: "gate" | "pillars" | "city" | "journal" | "agora";
  className?: string;
  opacity?: number;
}

export function ArtLayer({ id, className = "", opacity = 1 }: ArtLayerProps) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} style={{ opacity }}>
      {/* Light mode image */}
      <Image
        src={`/art/${id}-light.jpg`}
        alt={`${id} artwork`}
        fill
        quality={85}
        priority
        className="object-cover object-bottom transition-opacity duration-1000 opacity-100 dark:opacity-0"
      />
      {/* Dark mode image */}
      <Image
        src={`/art/${id}-dark.jpg`}
        alt={`${id} artwork`}
        fill
        quality={85}
        priority
        className="object-cover object-bottom transition-opacity duration-1000 opacity-0 dark:opacity-100"
      />
      
      {/* A delicate fade to transparent at the top so it blends into the page */}
      <div className="absolute inset-0 bg-gradient-to-b from-[var(--bg-0)] via-transparent to-transparent opacity-80" />
    </div>
  );
}
