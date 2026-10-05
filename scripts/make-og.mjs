#!/usr/bin/env node
/** Builds the social preview from the supplied brand mark and academy art. */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const WIDTH = 1200;
const HEIGHT = 630;
const OUTPUT = resolve(process.cwd(), "public/og.png");
const BACKGROUND = resolve(
  process.cwd(),
  "public/images/Philosophical_academy_with_pillars_2K_20260920021618.webp"
);
const LOGO = resolve(
  process.cwd(),
  "public/images/Logo_representing_philosophical___2K_20260922065211.webp"
);

for (const file of [BACKGROUND, LOGO]) {
  if (!existsSync(file)) {
    console.error(`og:make — required supplied image is missing: ${file}`);
    process.exit(1);
  }
}

const background = await sharp(BACKGROUND)
  .resize(WIDTH, HEIGHT, { fit: "contain", background: "#050505" })
  .png()
  .toBuffer();
const logo = await sharp(LOGO)
  .resize(184, 184, { fit: "contain" })
  .png()
  .toBuffer();

await sharp(background)
  .composite([{ input: logo, left: Math.round((WIDTH - 184) / 2), top: 36 }])
  .png({ compressionLevel: 9, palette: true, colours: 128, effort: 10 })
  .toFile(OUTPUT);

const metadata = await sharp(OUTPUT).metadata();
const stat = (await import("node:fs/promises")).stat;
const bytes = (await stat(OUTPUT)).size;
console.log(`og image written: public/og.png ${metadata.width}x${metadata.height} (${(bytes / 1024).toFixed(1)} KB)`);
if (bytes > 220 * 1024) {
  console.error("og:make — output exceeds the 220 KB social image budget.");
  process.exitCode = 1;
}