#!/usr/bin/env node
/**
 * Generates the static Open Graph image: public/og.png (1200x630).
 *
 * Deliberately pure geometry — colonnade, horizon glow, gold rule — with **no
 * text of any script**. The brief warns against relying on next/og for Arabic
 * until letter-joining is verified visually, and a social preview is the worst
 * place to ship broken Arabic: it is the one image every share shows. Geometry
 * has no such failure mode, and it stays on-brand.
 *
 * Runs at build-prep time on a developer machine; never imported by app code.
 *
 * Usage: node scripts/make-og.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const W = 1200;
const H = 630;
const OUT = resolve(process.cwd(), "public/og.png");

/** Gold, matching --brand-gold. */
const GOLD = "#d4af37";
const GOLD_LIGHT = "#e7d9a1";
const VOLCANIC = "#050505";

/**
 * Colonnade silhouette: chunky fluted columns on a horizon line.
 *
 * Tuned for legibility at thumbnail size — a social preview is often rendered
 * at ~300px wide, so the columns are wide enough to survive downscaling and
 * bright enough to read against the near-black ground.
 */
function colonnade() {
  const horizon = H * 0.80;
  const colW = 52;
  const gap = 22;
  const count = 13;
  const total = count * colW + (count - 1) * gap;
  let x = (W - total) / 2;

  let out = "";

  // Entablature resting on the columns.
  out += `<rect x="${(W - total - 46) / 2}" y="${horizon - 208}" width="${total + 46}" height="26" fill="url(#gold)" opacity="0.72"/>`;
  out += `<rect x="${(W - total - 70) / 2}" y="${horizon - 226}" width="${total + 70}" height="12" fill="url(#gold)" opacity="0.52"/>`;

  for (let i = 0; i < count; i += 1) {
    const h = 170 + ((i * 53) % 34);
    const top = horizon - h;
    // Alternate so the rhythm reads even, but never so dark it disappears.
    const shade = i % 2 === 0 ? 0.46 : 0.34;
    out += `<rect x="${x}" y="${top}" width="${colW}" height="${h}" fill="url(#col)" opacity="${shade}"/>`;
    // Capital: a wider block crowning each shaft.
    out += `<rect x="${x - 5}" y="${top}" width="${colW + 10}" height="13" fill="url(#col)" opacity="${(shade + 0.2).toFixed(2)}"/>`;
    // Two flutes: the gold linework the pipeline is tuned to preserve.
    out += `<rect x="${x + 15}" y="${top + 13}" width="3" height="${h - 13}" fill="${GOLD_LIGHT}" opacity="0.30"/>`;
    out += `<rect x="${x + 34}" y="${top + 13}" width="3" height="${h - 13}" fill="${GOLD_LIGHT}" opacity="0.30"/>`;
    x += colW + gap;
  }

  // Stylobate, kept inside the frame with margin below it.
  out += `<rect x="0" y="${horizon}" width="${W}" height="3" fill="url(#gold)" opacity="0.85"/>`;
  out += `<rect x="${(W - total - 110) / 2}" y="${horizon + 3}" width="${total + 110}" height="30" fill="url(#gold)" opacity="0.42"/>`;
  return out;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${GOLD_LIGHT}"/>
      <stop offset="100%" stop-color="${GOLD}"/>
    </linearGradient>
    <linearGradient id="col" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${GOLD}" stop-opacity="0.30"/>
      <stop offset="40%" stop-color="${GOLD_LIGHT}" stop-opacity="0.62"/>
      <stop offset="100%" stop-color="${GOLD}" stop-opacity="0.30"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="58%" r="55%">
      <stop offset="0%" stop-color="${GOLD}" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
    <!-- Light vignette only: it must seat the composition, not erase it. -->
    <linearGradient id="vig" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${VOLCANIC}" stop-opacity="0.72"/>
      <stop offset="38%" stop-color="${VOLCANIC}" stop-opacity="0.08"/>
      <stop offset="78%" stop-color="${VOLCANIC}" stop-opacity="0.30"/>
      <stop offset="100%" stop-color="${VOLCANIC}" stop-opacity="0.85"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${VOLCANIC}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${colonnade()}
  <rect width="${W}" height="${H}" fill="url(#vig)"/>

  <!-- Gold hairline frame: the same edge the UI uses. -->
  <rect x="28" y="28" width="${W - 56}" height="${H - 56}" fill="none" stroke="${GOLD}" stroke-opacity="0.30" stroke-width="1"/>
  <rect x="34" y="34" width="${W - 68}" height="${H - 68}" fill="none" stroke="${GOLD}" stroke-opacity="0.12" stroke-width="1"/>
</svg>`;

mkdirSync(resolve(process.cwd(), "public"), { recursive: true });

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(OUT);

const { size } = await import("node:fs").then((fs) => fs.statSync(OUT));
console.log(`og image written: public/og.png  ${W}x${H}  ${(size / 1024).toFixed(1)} KB`);
if (size > 220 * 1024) {
  console.warn("⚠ over the 220 KB budget");
  process.exitCode = 1;
}
