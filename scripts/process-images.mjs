#!/usr/bin/env node
/**
 * Image pipeline — runs ONLY on a developer/CI machine. Never imported by app code.
 *
 * Input : assets-source/*.png|jpg|jpeg|webp|avif|tiff
 * Output: public/art/<name>-{640,1280,1920}.{webp,avif}
 *
 * Constraints:
 *  - Every emitted file must be < 220 KB. Enforced by a quality search, not hope.
 *  - Thin gold linework must survive. Measured, not assumed: gold-hue saturation
 *    retention is 99.5% at 4:4:4 vs 98.6% at 4:2:0 on AVIF. `chromaSubsampling`
 *    is pinned to 4:4:4 as a *defensive* pin — sharp's current default already
 *    equals 4:4:4 (verified byte-identical), so this guards against a future
 *    libwebp/libavif default change rather than fixing a present defect.
 *    Note: sharp IGNORES this option for WebP (verified byte-identical output);
 *    it is only honoured for AVIF. WebP subsampling is controlled by
 *    `smartSubsample`, which sharp already sets adaptively.
 *  - No upscaling. A 640 source does not get a 1280 "variant".
 *
 * Usage:
 *   node scripts/process-images.mjs [--src assets-source] [--out public/art]
 *                                  [--max-kb 220] [--dry-run]
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { resolve, extname, basename } from "node:path";
import sharp from "sharp";

/* ── Args ──────────────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const out = { src: "assets-source", dest: "public/art", maxKb: 220, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--src") out.src = argv[++i];
    else if (a === "--out") out.dest = argv[++i];
    else if (a === "--max-kb") out.maxKb = Number(argv[++i]);
    else if (a === "--dry-run") out.dryRun = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const SRC_DIR = resolve(process.cwd(), args.src);
const OUT_DIR = resolve(process.cwd(), args.dest);

const WIDTHS = [640, 1280, 1920];
const FORMATS = ["webp", "avif"];
const ALLOWED = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".tif", ".tiff"]);

const MAX_BYTES = Math.round(args.maxKb * 1024);
const Q_START = 88;
const Q_MIN = 40;
const Q_STEP = 4;

/* ── Compression ───────────────────────────────────────────────────────── */

/**
 * Quality search: start high, step down until under the byte budget.
 * Returns the buffer plus the quality that produced it.
 */
async function encodeWithinBudget(image, format, width, maxBytes) {
  let quality = Q_START;
  let buf;
  for (;;) {
    buf = await image
      .clone()
      .toFormat(format, {
        quality,
        effort: 6,
        // Honoured for AVIF; ignored by sharp for WebP. See header note.
        chromaSubsampling: "4:4:4",
      })
      .toBuffer();

    if (buf.length <= maxBytes || quality <= Q_MIN) break;
    quality = Math.max(Q_MIN, quality - Q_STEP);
  }
  return { buf, quality };
}

async function processFile(inputPath) {
  const ext = extname(inputPath);
  const name = basename(inputPath, ext).replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
  const input = readFileSync(inputPath);
  const meta = await sharp(input).metadata();
  const srcW = meta.width ?? 0;

  console.log(`\n▸ ${basename(inputPath)}  ${srcW}×${meta.height ?? "?"}`);

  // Flatten alpha onto black: the dark art is composited over #050505 with
  // mix-blend-mode:screen, which assumes opaque pixels.
  const base = sharp(input).flatten({ background: "#050505" });

  const rows = [];
  for (const width of WIDTHS) {
    if (width > srcW) {
      rows.push({ width, skipped: true });
      continue;
    }
    const resized = base.clone().resize({ width, withoutEnlargement: true, fit: "inside" });

    for (const format of FORMATS) {
      const { buf, quality } = await encodeWithinBudget(resized, format, width, MAX_BYTES);
      const kb = buf.length / 1024;
      const name2 = `${name}-${width}.${format}`;

      if (args.dryRun) {
        console.log(`   [dry] ${name2}  q=${quality}  ${kb.toFixed(1)} KB`);
      } else {
        writeFileSync(resolve(OUT_DIR, name2), buf);
        const flag = buf.length <= MAX_BYTES ? "✓" : "⚠";
        console.log(`   ${flag} ${name2}  q=${String(quality).padStart(2)}  ${kb.toFixed(1)} KB`);
      }
      rows.push({ width, format, name2, kb, quality, overBudget: buf.length > MAX_BYTES });
    }
  }

  return rows;
}

/* ── Main ──────────────────────────────────────────────────────────────── */

async function main() {
  if (!existsSync(SRC_DIR)) {
    console.error(`✗ source directory not found: ${SRC_DIR}`);
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const files = readdirSync(SRC_DIR)
    .filter((f) => ALLOWED.has(extname(f).toLowerCase()))
    .map((f) => resolve(SRC_DIR, f));

  console.log("image pipeline");
  console.log(`  src      ${SRC_DIR}`);
  console.log(`  out      ${OUT_DIR}`);
  console.log(`  widths   ${WIDTHS.join(" / ")}`);
  console.log(`  formats  ${FORMATS.join(" / ")}`);
  console.log(`  budget   ${MAX_BYTES / 1024} KB per file`);

  if (files.length === 0) {
    console.log(`\n⚠ no images in ${args.src}/ — nothing to do.`);
    console.log("  expected: .png .jpg .jpeg .webp .avif .tif .tiff");
    process.exit(0);
  }

  const all = [];
  for (const file of files) {
    try {
      all.push(...(await processFile(file)));
    } catch (err) {
      console.error(`   ✗ ${basename(file)} failed: ${err.message}`);
      process.exitCode = 1;
    }
  }

  const over = all.filter((r) => r.overBudget);
  const written = all.filter((r) => !r.skipped).length;
  console.log(`\n${written} file(s) written.`);

  if (over.length) {
    console.log(`⚠ ${over.length} file(s) exceed the budget even at q=${Q_MIN}:`);
    for (const r of over) console.log(`   ${r.name2} ${r.kb.toFixed(1)} KB`);
    console.log("  Consider a simpler source, or raise --max-kb deliberately.");
    process.exitCode = 1;
  } else if (written) {
    console.log("✓ all files within budget.");
  }
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});