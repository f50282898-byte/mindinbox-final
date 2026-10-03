#!/usr/bin/env node
/**
 * Generates the gate illustration: public/gate.png (900x900).
 *
 * Pure geometry — no text of any script. The gate copy carries the meaning; the
 * image only has to feel like an open door rather than a locked one, because the
 * brief asks for an *invitation*, not a wall. Drawing type here would put Arabic
 * glyph-joining at risk for no benefit.
 *
 * Developer/CI machine only; never imported by app code.
 *
 * Usage: node scripts/make-gate.mjs
 */

import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const SIZE = 900;
const OUT = resolve(process.cwd(), "public/gate.png");

const GOLD = "#d4af37";
const GOLD_LIGHT = "#e7d9a1";
const VOLCANIC = "#050505";

/**
 * Concentric archways receding into light, with a path leading in.
 * Reads as "there is a way through" from a glance, which is the whole job.
 */
function arches() {
  const cx = SIZE / 2;
  const baseY = SIZE * 0.82;
  let out = "";

  // Outermost to innermost: each smaller and brighter, so the eye travels inward.
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const halfWidth = SIZE * (0.40 - t * 0.26);
    const height = SIZE * (0.62 - t * 0.24);
    const opacity = (0.10 + t * 0.16).toFixed(3);

    // A rounded arch: vertical sides plus a semicircular head.
    const headR = halfWidth;
    const shoulderY = baseY - height + headR;
    const d = [
      `M ${cx - halfWidth} ${baseY}`,
      `L ${cx - halfWidth} ${shoulderY}`,
      `A ${headR} ${headR} 0 0 1 ${cx + halfWidth} ${shoulderY}`,
      `L ${cx + halfWidth} ${baseY}`,
      "Z",
    ].join(" ");

    out += `<path d="${d}" fill="none" stroke="${t > 0.55 ? GOLD_LIGHT : GOLD}" stroke-width="${(2.5 - t).toFixed(2)}" opacity="${opacity}"/>`;
  }

  // The light at the far end. Small, warm, and the only bright thing.
  out += `<circle cx="${cx}" cy="${baseY - SIZE * 0.16}" r="${SIZE * 0.028}" fill="${GOLD_LIGHT}" opacity="0.85"/>`;
  out += `<circle cx="${cx}" cy="${baseY - SIZE * 0.16}" r="${SIZE * 0.07}" fill="url(#halo)" opacity="0.55"/>`;

  // Threshold line: you are at the edge, not outside it.
  out += `<rect x="${cx - SIZE * 0.34}" y="${baseY}" width="${SIZE * 0.68}" height="2" fill="${GOLD}" opacity="0.5"/>`;

  // A few grains of gold dust rising through the archway.
  for (let i = 0; i < 26; i++) {
    const x = cx + (((i * 97) % 100) / 100 - 0.5) * SIZE * 0.5;
    const y = baseY - (((i * 61) % 100) / 100) * SIZE * 0.5;
    const r = 0.8 + (((i * 13) % 10) / 10) * 2.2;
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${GOLD}" opacity="${(0.15 + ((i * 7) % 20) / 100).toFixed(2)}"/>`;
  }

  return out;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${GOLD_LIGHT}" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="ground" cx="50%" cy="82%" r="60%">
      <stop offset="0%" stop-color="${GOLD}" stop-opacity="0.13"/>
      <stop offset="100%" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${SIZE}" height="${SIZE}" fill="${VOLCANIC}"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#ground)"/>
  ${arches()}

  <rect x="16" y="16" width="${SIZE - 32}" height="${SIZE - 32}" fill="none" stroke="${GOLD}" stroke-opacity="0.14" stroke-width="1"/>
</svg>`;

mkdirSync(resolve(process.cwd(), "public"), { recursive: true });
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(OUT);

const size = statSync(OUT).size;
console.log(`gate image written: public/gate.png  ${SIZE}x${SIZE}  ${(size / 1024).toFixed(1)} KB`);

if (!existsSync(OUT)) process.exit(1);
void writeFileSync;
