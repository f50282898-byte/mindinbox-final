#!/usr/bin/env node
/**
 * Builds the artwork set.
 *
 * Reads `assets-source/manifest.json`, emits WebP and AVIF at the declared widths
 * into `public/art/`, and **fails loudly** on anything it cannot process.
 *
 * ## Why it fails rather than skips
 *
 * The first version of this project had an `assets-source/` directory, no artwork, and
 * three components (`ArtLayer`, `Parallax`, `GoldDust`) that were never built. Nothing
 * broke, because nothing looked for the art. A pipeline that quietly skips a missing
 * file reproduces exactly that: a green build and an empty page.
 *
 * So: a declared source that is absent is an error naming the expected path. And an
 * entry with `themed: true` needs both variants — a single dark illustration on the
 * Parchment theme reads as a printing error, so shipping one alone is a bug, not a
 * partial success.
 *
 * ## Why sizes are capped rather than "whatever the source is"
 *
 * These are decorative backgrounds on a mobile-first product with a stated image
 * budget. A 4000px master shipped unmodified is a 2 MB download on the route with the
 * most text. Widths are declared per artwork because a full-bleed horizon needs 1920
 * and a corner vignette needs 640, and pretending otherwise either wastes bytes or
 * looks soft.
 *
 * Run: node scripts/build-art.mjs
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const MANIFEST = join(ROOT, "assets-source", "manifest.json");

if (!existsSync(MANIFEST)) {
  console.error("build-art — assets-source/manifest.json is missing.");
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
} catch (err) {
  console.error("build-art — manifest.json is not valid JSON:", err.message);
  process.exit(1);
}

const defaults = manifest.defaults ?? {};
const OUT_DIR = join(ROOT, defaults.outputDir ?? "public/art");
const SRC_DIR = join(ROOT, defaults.sourceDir ?? "assets-source");
const FORMATS = defaults.formats ?? ["webp", "avif"];
const QUALITY = defaults.quality ?? { webp: 72, avif: 55 };

/**
 * `sharp` is a devDependency and is the only image library in the tree.
 *
 * Imported lazily so that `--check` works on a machine where the native binary has not
 * been built — which is exactly the machine an operator would run `--check` on after
 * cloning, before `npm install` has finished.
 */
let sharp = null;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  // Reported by whichever path needs it.
}

/* ── the themed-variant rule ───────────────────────────────────────────────── */

/**
 * The filename a themed entry's other variant must have.
 *
 * Derived by swapping the trailing token, so `colonnade-dark.png` pairs with
 * `colonnade-light.png`. A hardcoded second filename in the manifest would be one more
 * thing to forget; deriving it means a pair cannot drift apart in name.
 */
function variantSource(source, variant) {
  const m = /^(.*)-(dark|light)\.([a-z0-9]+)$/i.exec(source);
  if (!m) return null;
  return `${m[1]}-${variant}.${m[3]}`;
}

/* ── planning ──────────────────────────────────────────────────────────────── */

const errors = [];
const warnings = [];
const plan = [];

for (const entry of manifest.art ?? []) {
  const sources = [];

  const primary = join(SRC_DIR, entry.source);
  if (existsSync(primary)) {
    sources.push({ theme: "dark", path: primary, name: entry.source });
  } else {
    errors.push(
      `${entry.id}: expected source "${entry.source}" at ${defaults.sourceDir ?? "assets-source"}/${entry.source} — not found.`
    );
  }

  if (entry.themed) {
    const paired = variantSource(entry.source, "light");
    if (!paired) {
      errors.push(
        `${entry.id}: themed entry but "${entry.source}" is not named "<id>-dark.<ext>". The light variant cannot be derived, so put the name in that shape or set themed:false.`
      );
    } else {
      const lightPath = join(SRC_DIR, paired);
      if (existsSync(lightPath)) {
        sources.push({ theme: "light", path: lightPath, name: paired });
      } else {
        errors.push(
          `${entry.id}: expected the light variant "${paired}" alongside "${entry.source}" — not found. A themed entry needs both; one alone looks like a printing error on the other theme.`
        );
      }
    }
  }

  plan.push({ entry, sources });
}

/* ── the no-artwork case, stated plainly ───────────────────────────────────── */

const totalSources = plan.reduce((n, p) => n + p.sources.length, 0);

if (totalSources === 0) {
  console.error(
    [
      "",
      "build-art — FAILED: no artwork found.",
      "",
      `  Looked in ${defaults.sourceDir ?? "assets-source"}/ for the files named in the manifest.`,
      "  The manifest declares what is expected; nothing in it is present yet.",
      "",
      "  To supply the artwork:",
      "    1. Copy the original files into assets-source/ using the `source` names in",
      "       assets-source/manifest.json.",
      "    2. For every themed entry, include both the -dark and -light variant.",
      "    3. Run: npm run art:build",
      "",
      "  This is a hard failure on purpose. A pipeline that skips missing artwork",
      "  produces a green build and an undecorated page.",
      "",
    ].join("\n")
  );
  process.exit(1);
}

/* ── report missing sources ────────────────────────────────────────────────── */

if (errors.length > 0) {
  console.error("\nbuild-art — FAILED\n");
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    `\n  ${errors.length} problem(s). Nothing was written; partial output would leave a surface with half its art.\n`
  );
  process.exit(1);
}

/* ── build ─────────────────────────────────────────────────────────────────── */

if (!sharp) {
  console.error(
    "build-art — `sharp` is not available. Run `npm install` first; it is a devDependency used only here."
  );
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const written = [];
const bytesByFormat = { webp: 0, avif: 0 };
let failures = 0;

/** A byte ceiling per emitted file, so a future artwork cannot quietly cost 3 MB. */
const MAX_FILE_BYTES = 320 * 1024;

for (const { entry, sources } of plan) {
  for (const { theme, path, name } of sources) {
    for (const width of entry.widths ?? [1280]) {
      for (const format of FORMATS) {
        const outName = `${entry.id}-${theme}-${width}.${format}`;
        const outPath = join(OUT_DIR, outName);

        try {
          const info = await sharp(path)
            .resize({ width, withoutEnlargement: true })
            .toFormat(format, { quality: QUALITY[format] ?? 70 })
            .toFile(outPath);

          bytesByFormat[format] += info.size;

          if (info.size > MAX_FILE_BYTES) {
            warnings.push(
              `${outName} is ${(info.size / 1024).toFixed(0)} KB, over the ${MAX_FILE_BYTES / 1024} KB per-file ceiling. Lower the quality for ${entry.id} or drop a width.`
            );
          }
          written.push(outName);
        } catch (err) {
          failures += 1;
          errors.push(`${outName}: ${err.message}`);
        }
      }
    }
  }
}

if (failures > 0) {
  console.error("\nbuild-art — FAILED while encoding\n");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

/* ── a manifest of what was actually produced ──────────────────────────────── */

/**
 * `art-manifest.json` is what the `ArtLayer` component reads.
 *
 * Generated rather than hand-written, so a width that failed to encode cannot appear
 * in the component's `srcset` and 404 in the browser — a missing background is silent,
 * so the only place a mistake can be caught is here.
 */
const emitted = {};
for (const { entry, sources } of plan) {
  for (const theme of new Set(sources.map((s) => s.theme))) {
    const widths = (entry.widths ?? []).filter((w) =>
      FORMATS.some((f) => existsSync(join(OUT_DIR, `${entry.id}-${theme}-${w}.${f}`)))
    );
    if (widths.length === 0) continue;
    emitted[`${entry.id}:${theme}`] = {
      widths,
      webp: FORMATS.includes("webp")
        ? widths.map((w) => `/art/${entry.id}-${theme}-${w}.webp`)
        : null,
      avif: FORMATS.includes("avif")
        ? widths.map((w) => `/art/${entry.id}-${theme}-${w}.avif`)
        : null,
    };
  }
}

const artIndex = {
  generatedAt: new Date().toISOString(),
  art: Object.fromEntries(
    (manifest.art ?? []).map((entry) => {
      const dark = emitted[`${entry.id}:dark`] ?? null;
      const light = entry.themed ? (emitted[`${entry.id}:light`] ?? null) : dark;
      return [
        entry.id,
        {
          aspect: entry.aspect ?? "16:9",
          fit: entry.fit ?? "cover",
          focal: entry.focal ?? "50% 50%",
          opacity: entry.opacity ?? 1,
          scrim: entry.scrim ?? "none",
          parallax: entry.parallax ?? 0,
          role: entry.role ?? "background",
          surface: entry.surface ?? null,
          dark,
          light,
        },
      ];
    })
  ),
};

writeFileSync(
  join(OUT_DIR, "art-manifest.json"),
  `${JSON.stringify(artIndex, null, 2)}\n`,
  "utf8"
);

for (const w of warnings) console.log(`  warning: ${w}`);

console.log(
  `build-art — ${written.length} file(s) into ${defaults.outputDir ?? "public/art"}: ` +
    `${(bytesByFormat.webp / 1024).toFixed(0)} KB webp, ${(bytesByFormat.avif / 1024).toFixed(0)} KB avif. ` +
    `art-manifest.json regenerated.`
);
