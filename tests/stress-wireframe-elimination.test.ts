import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import sharp from "sharp";

const ROOT = process.cwd();

/** Helper to recursively get files matching extensions */
function getFilesRecursive(dir: string, extensions: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of list) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".git") {
        results.push(...getFilesRecursive(fullPath, extensions));
      }
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Helper to strip CSS comments */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("Milestone M1 Adversarial Stress Test: Wireframe Elimination & Asset Integrity", () => {
  // ───────────────────────────────────────────────────────────────────────────
  // Tier 1: Procedural Wireframe & Colonnade Elimination Audit
  // ───────────────────────────────────────────────────────────────────────────
  describe("Tier 1: Elimination of Procedural Wireframe Cubes & CSS Colonnades", () => {
    it("T1.1: No active CSS selectors for .spatial-face, .spatial-edge, or .greek-column in src/**/*.css", () => {
      const cssFiles = getFilesRecursive(path.join(ROOT, "src"), [".css"]);
      expect(cssFiles.length).toBeGreaterThan(0);

      const forbiddenSelectors = [
        /\.spatial-face[\w-]*/i,
        /\.spatial-edge[\w-]*/i,
        /\.greek-column[\w-]*/i,
      ];

      for (const file of cssFiles) {
        const rawContent = fs.readFileSync(file, "utf8");
        const cleanContent = stripCssComments(rawContent);

        for (const pattern of forbiddenSelectors) {
          const match = cleanContent.match(pattern);
          expect(
            match,
            `File ${path.relative(ROOT, file)} contains forbidden active CSS rule: ${match?.[0]}`
          ).toBeNull();
        }
      }
    });

    it("T1.2: No compiled CSS output in .next/static/css contains .spatial-face, .spatial-edge, or .greek-column", () => {
      const nextCssDir = path.join(ROOT, ".next", "static", "css");
      if (!fs.existsSync(nextCssDir)) {
        console.warn(".next/static/css does not exist, skipping compiled CSS check.");
        return;
      }

      const compiledCssFiles = getFilesRecursive(nextCssDir, [".css"]);
      expect(compiledCssFiles.length).toBeGreaterThan(0);

      const forbiddenTerms = ["spatial-face", "spatial-edge", "greek-column"];

      for (const file of compiledCssFiles) {
        const content = fs.readFileSync(file, "utf8");
        for (const term of forbiddenTerms) {
          expect(
            content.includes(term),
            `Compiled CSS ${path.basename(file)} unexpectedly contains forbidden term "${term}"`
          ).toBe(false);
        }
      }
    });

    it("T1.3: No React TSX components declare spatial wireframe or greek-column classes in JSX", () => {
      const tsxFiles = getFilesRecursive(path.join(ROOT, "src"), [".tsx"]);
      expect(tsxFiles.length).toBeGreaterThan(0);

      // Matches className containing spatial-face, spatial-edge, or greek-column
      const forbiddenClassInJsx = /className\s*=\s*["'`][^"'`]*(spatial-face|spatial-edge|greek-column)[^"'`]*["'`]/i;

      for (const file of tsxFiles) {
        const content = fs.readFileSync(file, "utf8");
        const match = content.match(forbiddenClassInJsx);
        expect(
          match,
          `Component ${path.relative(ROOT, file)} declares forbidden className in JSX: ${match?.[0]}`
        ).toBeNull();
      }
    });

    it("T1.4: SpatialBox and SanctuaryCore use authentic pointer physics and no 3D wireframe cube faces", () => {
      const spatialBoxPath = path.join(ROOT, "src", "components", "spatial", "SpatialBox.tsx");
      const sanctuaryCorePath = path.join(ROOT, "src", "components", "spatial", "SanctuaryCore.tsx");

      expect(fs.existsSync(spatialBoxPath)).toBe(true);
      expect(fs.existsSync(sanctuaryCorePath)).toBe(true);

      const spatialBoxContent = fs.readFileSync(spatialBoxPath, "utf8");
      const sanctuaryCoreContent = fs.readFileSync(sanctuaryCorePath, "utf8");

      // Verify SpatialBox re-exports SanctuaryCore
      expect(spatialBoxContent).toContain("SanctuaryCore");
      expect(spatialBoxContent).not.toContain("<div className=\"spatial-cube\"");

      // Verify SanctuaryCore renders authentic portal canvas/layers
      expect(sanctuaryCoreContent).toContain("usePointerField");
      expect(sanctuaryCoreContent).not.toContain("spatial-face-front");
      expect(sanctuaryCoreContent).not.toContain("spatial-face-back");
      expect(sanctuaryCoreContent).not.toContain("spatial-edge");
    });

    it("T1.5: GreekColumns component renders authentic ColonnadeBackdrop with picture tag, not CSS gradient columns", () => {
      const greekColumnsPath = path.join(ROOT, "src", "components", "GreekColumns.tsx");
      expect(fs.existsSync(greekColumnsPath)).toBe(true);

      const content = fs.readFileSync(greekColumnsPath, "utf8");
      expect(content).toContain("<picture");
      expect(content).toContain("colonnade-");
      expect(content).not.toContain("className=\"greek-column\"");
      expect(content).not.toContain("background: repeating-linear-gradient");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Tier 2: Stoa SVG Vector Prohibition Audit
  // ───────────────────────────────────────────────────────────────────────────
  describe("Tier 2: Strict Prohibition of Flat Stoa SVG Vectors", () => {
    it("T2.1: UtopiaHero.tsx does not reference stoa-night.svg or stoa-day.svg", () => {
      const heroPath = path.join(ROOT, "src", "components", "UtopiaHero.tsx");
      expect(fs.existsSync(heroPath)).toBe(true);

      const heroContent = fs.readFileSync(heroPath, "utf8");
      expect(heroContent).not.toContain("stoa-night.svg");
      expect(heroContent).not.toContain("stoa-day.svg");
      expect(heroContent).not.toContain("stoa-art");

      // Assert authentic hero cinematography is used
      expect(heroContent).toContain("hero-sanctuary-640.avif");
      expect(heroContent).toContain("hero-sanctuary-1024.avif");
      expect(heroContent).toContain("hero-sanctuary-640.webp");
      expect(heroContent).toContain("hero-sanctuary-1024.webp");
    });

    it("T2.2: studio.css and globals.css have no active rules referencing stoa SVG vectors", () => {
      const studioCssPath = path.join(ROOT, "src", "app", "studio.css");
      const globalsCssPath = path.join(ROOT, "src", "app", "globals.css");

      const studioClean = stripCssComments(fs.readFileSync(studioCssPath, "utf8"));
      const globalsClean = stripCssComments(fs.readFileSync(globalsCssPath, "utf8"));

      expect(studioClean).not.toContain("stoa-night.svg");
      expect(studioClean).not.toContain("stoa-day.svg");
      expect(globalsClean).not.toContain("stoa-night.svg");
      expect(globalsClean).not.toContain("stoa-day.svg");
    });

    it("T2.3: Zero files in src/ reference stoa-night.svg or stoa-day.svg", () => {
      const srcFiles = getFilesRecursive(path.join(ROOT, "src"), [".ts", ".tsx", ".css", ".json"]);
      for (const file of srcFiles) {
        const content = fs.readFileSync(file, "utf8");
        expect(
          content.includes("stoa-night.svg") || content.includes("stoa-day.svg"),
          `File ${path.relative(ROOT, file)} unexpectedly references stoa SVG vector`
        ).toBe(false);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Tier 3: Complete Asset Integrity & HTTP 404 Audit
  // ───────────────────────────────────────────────────────────────────────────
  describe("Tier 3: Asset Integrity Audit (Manifests, Hero Images & HTTP Loading)", () => {
    let server: http.Server;
    let serverPort: number;

    beforeAll(async () => {
      // Create a local static file server serving public/ on an ephemeral port
      server = http.createServer((req, res) => {
        const decodedUrl = decodeURIComponent(req.url?.split("?")[0] ?? "");
        const filePath = path.join(ROOT, "public", decodedUrl);

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("404 Not Found");
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        let mime = "application/octet-stream";
        if (ext === ".webp") mime = "image/webp";
        else if (ext === ".avif") mime = "image/avif";
        else if (ext === ".png") mime = "image/png";
        else if (ext === ".jpg" || ext === ".jpeg") mime = "image/jpeg";
        else if (ext === ".json") mime = "application/json";

        const stat = fs.statSync(filePath);
        res.writeHead(200, {
          "Content-Type": mime,
          "Content-Length": stat.size,
        });
        fs.createReadStream(filePath).pipe(res);
      });

      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          const addr = server.address() as { port: number };
          serverPort = addr.port;
          resolve();
        });
      });
    });

    afterAll(async () => {
      if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it("T3.1: All assets declared in assets-source/manifest.json exist, are non-zero, and build into public/art/", async () => {
      const manifestPath = path.join(ROOT, "assets-source", "manifest.json");
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      expect(Array.isArray(manifest.art)).toBe(true);
      expect(manifest.art.length).toBeGreaterThan(0);

      const defaults = manifest.defaults || {};
      const formats: string[] = defaults.formats || ["webp", "avif"];
      const srcDir = path.join(ROOT, defaults.sourceDir || "assets-source");
      const outDir = path.join(ROOT, defaults.outputDir || "public/art");

      for (const entry of manifest.art) {
        // Check dark source
        const darkSrc = path.join(srcDir, entry.source);
        expect(fs.existsSync(darkSrc), `Source ${darkSrc} missing`).toBe(true);
        expect(fs.statSync(darkSrc).size, `Source ${darkSrc} empty`).toBeGreaterThan(0);

        // Check light source if themed
        if (entry.themed) {
          const lightName = entry.source.replace("-dark.", "-light.");
          const lightSrc = path.join(srcDir, lightName);
          expect(fs.existsSync(lightSrc), `Light source ${lightSrc} missing`).toBe(true);
          expect(fs.statSync(lightSrc).size, `Light source ${lightSrc} empty`).toBeGreaterThan(0);
        }

        // Check emitted files
        const themes = entry.themed ? ["dark", "light"] : ["dark"];
        const widths = entry.widths || [1280];

        for (const theme of themes) {
          for (const width of widths) {
            for (const format of formats) {
              const emittedName = `${entry.id}-${theme}-${width}.${format}`;
              const emittedPath = path.join(outDir, emittedName);

              expect(fs.existsSync(emittedPath), `Emitted artwork ${emittedName} missing on disk`).toBe(true);
              const stat = fs.statSync(emittedPath);
              expect(stat.size, `Emitted artwork ${emittedName} has 0 bytes`).toBeGreaterThan(0);

              // Empirical sharp decode validation
              const meta = await sharp(emittedPath).metadata();
              if (format === "avif") {
                expect(["avif", "heif"]).toContain(meta.format);
                if (meta.format === "heif") {
                  expect(meta.compression).toBe("av1");
                }
              } else {
                expect(meta.format).toBe(format);
              }
              expect(meta.width).toBeLessThanOrEqual(width);
            }
          }
        }
      }
    });

    it("T3.2: Every artwork path declared in public/art/art-manifest.json exists and loads via HTTP (status 200)", async () => {
      const artManifestPath = path.join(ROOT, "public", "art", "art-manifest.json");
      expect(fs.existsSync(artManifestPath)).toBe(true);

      const artManifest = JSON.parse(fs.readFileSync(artManifestPath, "utf8"));
      expect(artManifest.art).toBeDefined();

      const artKeys = Object.keys(artManifest.art);
      expect(artKeys.length).toBeGreaterThan(0);

      let totalAudited = 0;

      for (const key of artKeys) {
        const item = artManifest.art[key];
        const variants = [item.dark, item.light].filter(Boolean);

        for (const variant of variants) {
          const allUrls = [...(variant.webp || []), ...(variant.avif || [])];
          for (const url of allUrls) {
            totalAudited++;
            // 1. Check physical file on disk
            const relativePath = url.startsWith("/") ? url.slice(1) : url;
            const fullPath = path.join(ROOT, "public", relativePath);

            expect(fs.existsSync(fullPath), `Art file missing: ${fullPath}`).toBe(true);
            const stat = fs.statSync(fullPath);
            expect(stat.size, `Art file ${fullPath} is empty`).toBeGreaterThan(0);

            // 2. Empirical sharp decode
            const meta = await sharp(fullPath).metadata();
            expect(meta.width).toBeGreaterThan(0);
            expect(meta.height).toBeGreaterThan(0);

            // 3. HTTP fetch test
            const httpRes = await fetch(`http://127.0.0.1:${serverPort}${url}`);
            expect(httpRes.status, `HTTP 404 or error loading ${url}`).toBe(200);
            const arrayBuffer = await httpRes.arrayBuffer();
            expect(arrayBuffer.byteLength, `HTTP body empty for ${url}`).toBe(stat.size);
          }
        }
      }

      expect(totalAudited).toBeGreaterThanOrEqual(48);
    });

    it("T3.3: All WebP and AVIF files in public/images/hero/ physically exist, have non-zero size, and load via HTTP", async () => {
      const heroDir = path.join(ROOT, "public", "images", "hero");
      expect(fs.existsSync(heroDir)).toBe(true);

      const heroFiles = fs.readdirSync(heroDir).filter((f) => f.endsWith(".webp") || f.endsWith(".avif"));
      expect(heroFiles.length).toBeGreaterThanOrEqual(6);

      const requiredHeroFiles = [
        "hero-sanctuary-640.webp",
        "hero-sanctuary-640.avif",
        "hero-sanctuary-1024.webp",
        "hero-sanctuary-1024.avif",
        "hero-sanctuary-1280.webp",
        "hero-sanctuary-1280.avif",
      ];

      for (const reqFile of requiredHeroFiles) {
        expect(heroFiles).toContain(reqFile);
      }

      for (const file of heroFiles) {
        const fullPath = path.join(heroDir, file);
        const stat = fs.statSync(fullPath);
        expect(stat.size, `Hero file ${file} is 0 bytes`).toBeGreaterThan(1000);

        // Sharp image decode verification
        const meta = await sharp(fullPath).metadata();
        expect(meta.width).toBeGreaterThan(0);
        expect(meta.height).toBeGreaterThan(0);

        // HTTP GET check
        const url = `/images/hero/${file}`;
        const httpRes = await fetch(`http://127.0.0.1:${serverPort}${url}`);
        expect(httpRes.status, `HTTP 404 loading ${url}`).toBe(200);
        const arrayBuffer = await httpRes.arrayBuffer();
        expect(arrayBuffer.byteLength).toBe(stat.size);
      }
    });

    it("T3.4: Philosopher portrait gallery assets referenced by UtopiaHero exist and load without 404s", async () => {
      const philosophersDir = path.join(ROOT, "public", "images", "philosophers");
      expect(fs.existsSync(philosophersDir)).toBe(true);

      const coreThinkers = ["plato", "rumi", "dostoevsky", "aesop"];
      for (const thinker of coreThinkers) {
        const expectedVariants = [
          `${thinker}-160.webp`,
          `${thinker}-320.avif`,
          `${thinker}-320.webp`,
          `${thinker}.webp`,
        ];

        for (const variant of expectedVariants) {
          const filePath = path.join(philosophersDir, variant);
          expect(fs.existsSync(filePath), `Philosopher portrait ${variant} missing`).toBe(true);
          const stat = fs.statSync(filePath);
          expect(stat.size, `Philosopher portrait ${variant} empty`).toBeGreaterThan(0);

          const url = `/images/philosophers/${variant}`;
          const httpRes = await fetch(`http://127.0.0.1:${serverPort}${url}`);
          expect(httpRes.status, `HTTP 404 loading portrait ${url}`).toBe(200);
        }
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Tier 4: OpenGraph Social Image Compliance Audit
  // ───────────────────────────────────────────────────────────────────────────
  describe("Tier 4: OpenGraph Image (public/og.png) Strict Compliance", () => {
    const ogPath = path.join(ROOT, "public", "og.png");

    it("T4.1: public/og.png physically exists and has valid PNG signature", () => {
      expect(fs.existsSync(ogPath), "public/og.png does not exist").toBe(true);

      const buffer = fs.readFileSync(ogPath);
      // Check standard PNG magic bytes: \x89PNG\r\n\x1a\n
      const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      for (let i = 0; i < pngSignature.length; i++) {
        expect(buffer[i], `Byte ${i} of PNG signature mismatch`).toBe(pngSignature[i]);
      }
    });

    it("T4.2: public/og.png size is strictly <= 220 KB (225,280 bytes)", () => {
      const stat = fs.statSync(ogPath);
      const MAX_OG_BYTES = 220 * 1024; // 225,280 bytes

      expect(stat.size).toBeGreaterThan(0);
      expect(
        stat.size,
        `og.png size (${(stat.size / 1024).toFixed(2)} KB) exceeds 220 KB budget limit`
      ).toBeLessThanOrEqual(MAX_OG_BYTES);
    });

    it("T4.3: public/og.png dimensions are strictly 1200x630 pixels", async () => {
      const meta = await sharp(ogPath).metadata();
      expect(meta.format).toBe("png");
      expect(meta.width, "og.png width is not 1200").toBe(1200);
      expect(meta.height, "og.png height is not 630").toBe(630);
    });

    it("T4.4: scripts/make-og.mjs references an authentic asset and generates compliant og.png", () => {
      const scriptPath = path.join(ROOT, "scripts", "make-og.mjs");
      expect(fs.existsSync(scriptPath)).toBe(true);

      const scriptContent = fs.readFileSync(scriptPath, "utf8");
      // Must not reference missing or legacy colonnade.png
      expect(scriptContent).not.toContain("assets-source/colonnade.png");
      expect(scriptContent).toContain("colonnade-dark.webp");
    });
  });
});
