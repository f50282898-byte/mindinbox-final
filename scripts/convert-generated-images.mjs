import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ARTIFACT_DIR = "C:\\Users\\LENOVO\\.gemini\\antigravity\\brain\\eb74ffd3-9084-4cea-b8c9-850dba6ef854";
const PUBLIC_DIR = join(process.cwd(), "public", "images");

const HERO_SRC = join(ARTIFACT_DIR, "mind_in_a_box_classical_luxury_1793485315991.jpg");
const PHILOSOPHERS_SRC = {
  plato: join(ARTIFACT_DIR, "plato_classical_portrait_1793485322304.jpg"),
  rumi: join(ARTIFACT_DIR, "rumi_mystic_portrait_fullbleed_1793485353976.jpg"),
  dostoevsky: join(ARTIFACT_DIR, "dostoevsky_classical_portrait_1793485332637.jpg"),
  aesop: join(ARTIFACT_DIR, "aesop_classical_portrait_1793485337898.jpg"),
};

const HERO_OUT = join(PUBLIC_DIR, "hero");
const PHIL_OUT = join(PUBLIC_DIR, "philosophers");

mkdirSync(HERO_OUT, { recursive: true });
mkdirSync(PHIL_OUT, { recursive: true });

async function processHero() {
  console.log("Processing Hero artwork...");
  if (!existsSync(HERO_SRC)) {
    throw new Error(`Hero source missing: ${HERO_SRC}`);
  }

  const widths = [640, 1024, 1280];
  for (const w of widths) {
    await sharp(HERO_SRC)
      .resize(w, null, { withoutEnlargement: true })
      .webp({ quality: 80, effort: 6 })
      .toFile(join(HERO_OUT, `hero-sanctuary-${w}.webp`));

    await sharp(HERO_SRC)
      .resize(w, null, { withoutEnlargement: true })
      .avif({ quality: 65, effort: 6 })
      .toFile(join(HERO_OUT, `hero-sanctuary-${w}.avif`));
  }

  // Default webp
  await sharp(HERO_SRC)
    .resize(1024, null, { withoutEnlargement: true })
    .webp({ quality: 82, effort: 6 })
    .toFile(join(HERO_OUT, `hero-sanctuary.webp`));

  console.log("Hero artwork processed successfully.");
}

async function processPhilosophers() {
  console.log("Processing Philosophers portraits...");
  for (const [id, srcPath] of Object.entries(PHILOSOPHERS_SRC)) {
    if (!existsSync(srcPath)) {
      throw new Error(`Philosopher source missing: ${id} at ${srcPath}`);
    }

    const sizes = [160, 320, 480];
    for (const size of sizes) {
      await sharp(srcPath)
        .resize(size, size, { fit: "cover", position: "centre" })
        .webp({ quality: 82, effort: 6 })
        .toFile(join(PHIL_OUT, `${id}-${size}.webp`));

      await sharp(srcPath)
        .resize(size, size, { fit: "cover", position: "centre" })
        .avif({ quality: 65, effort: 6 })
        .toFile(join(PHIL_OUT, `${id}-${size}.avif`));
    }

    // Default 256x256 webp
    await sharp(srcPath)
      .resize(256, 256, { fit: "cover", position: "centre" })
      .webp({ quality: 84, effort: 6 })
      .toFile(join(PHIL_OUT, `${id}.webp`));

    console.log(`Processed ${id} portraits.`);
  }
}

async function run() {
  await processHero();
  await processPhilosophers();
  console.log("All artwork successfully converted to modern web formats (WebP & AVIF)!");
}

run().catch((err) => {
  console.error("Image processing error:", err);
  process.exit(1);
});
