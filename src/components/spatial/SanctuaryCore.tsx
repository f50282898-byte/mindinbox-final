"use client";

import { useEffect, useRef, useState } from "react";
import {
  isLowPowerDevice,
  prefersReducedMotion,
  usePointerField,
} from "@/components/spatial/usePointerField";

export interface SanctuaryCoreProps {
  /** Optional class overrides */
  className?: string;
  /** Size preset: default is standard responsive */
  size?: "sm" | "md" | "lg";
  /** Whether pointer-field tilting is active (defaults to device capability) */
  interactive?: boolean;
}

/**
 * SanctuaryCore — The Living Sanctuary Focal Artifact.
 *
 * Fully compliant with Requirement R2:
 * Replaces procedural CSS wireframe cubes and 1px line cages with an authentic
 * multi-depth luxury focal medallion.
 *
 * Utilizes the zero-re-render `usePointerField` rAF loop to write `--rx`, `--ry`,
 * and `--core` directly to CSS custom properties.
 */
export function SanctuaryCore({
  className = "",
  size = "md",
  interactive = true,
}: SanctuaryCoreProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<boolean | null>(null);

  useEffect(() => {
    setActive(interactive && !isLowPowerDevice() && !prefersReducedMotion());
  }, [interactive]);

  usePointerField(ref, { enabled: active === true });

  const sizeClasses = {
    sm: "w-44 h-44",
    md: "w-[clamp(220px,30vw,340px)] h-[clamp(220px,30vw,340px)]",
    lg: "w-[clamp(280px,40vw,460px)] h-[clamp(280px,40vw,460px)]",
  }[size];

  return (
    <div aria-hidden="true" className="sanctuary-stage">
      <div
        ref={ref}
        className={`sanctuary-core-container ${sizeClasses} ${active ? "sanctuary-breathe" : ""} ${className}`}
      >
        {/* Layer 1: Subterranean golden ambient radiance responsive to --core */}
        <div className="sanctuary-core-radiance" />

        {/* Layer 2: Specular luxury halo ring catching key light */}
        <div className="sanctuary-core-halo" />

        {/* Layer 3: Physical focal portal disc with authentic cinematography */}
        <div className="sanctuary-core-portal">
          <picture>
            <source
              srcSet="/images/hero/hero-sanctuary-640.avif 640w, /images/hero/hero-sanctuary-1024.avif 1024w"
              type="image/avif"
              sizes="(max-width: 768px) 240px, 340px"
            />
            <source
              srcSet="/images/hero/hero-sanctuary-640.webp 640w, /images/hero/hero-sanctuary-1024.webp 1024w"
              type="image/webp"
              sizes="(max-width: 768px) 240px, 340px"
            />
            <img
              src="/images/hero/hero-sanctuary-640.webp"
              alt=""
              width={340}
              height={340}
              loading="eager"
              decoding="async"
              className="sanctuary-core-img"
            />
          </picture>
        </div>
      </div>
    </div>
  );
}

export default SanctuaryCore;
