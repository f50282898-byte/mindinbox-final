"use client";

/**
 * SpatialBox — Backward compatibility wrapper for SanctuaryCore.
 *
 * In compliance with Requirement R2, the procedural CSS 3D wireframe cube
 * (.spatial-face-near, .spatial-edge) has been eliminated and replaced by
 * SanctuaryCore — an authentic luxury sanctuary portal artifact.
 */

import { SanctuaryCore, type SanctuaryCoreProps } from "./SanctuaryCore";

export function SpatialBox(props: SanctuaryCoreProps) {
  return <SanctuaryCore {...props} />;
}

export { SanctuaryCore };
export default SpatialBox;