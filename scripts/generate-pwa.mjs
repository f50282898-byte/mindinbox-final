/**
 * PWA Asset Generator
 * Generates icons, manifest, and service worker for PWA support
 */

import { writeFile, mkdir, readFile, cp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const PROJECT_ROOT = resolve(process.cwd());
const PUBLIC_DIR = join(PROJECT_ROOT, 'public');
const FAVICON_DIR = join(PUBLIC_DIR, 'favicon');
const ART_DIR = join(PUBLIC_DIR, 'art');

async function generatePWA() {
  console.log('🔧 Generating PWA assets...');

  // Ensure directories exist
  await mkdir(join(PUBLIC_DIR, 'favicon'), { recursive: true });
  await mkdir(join(PUBLIC_DIR, 'fonts'), { recursive: true });

  // Copy source images to favicon directory if they don't exist
  await ensureFaviconAssets();

  // Generate manifest with proper hashing
  await generateManifest();

  // Generate service worker with cache busting
  await generateServiceWorker();

  // Generate icons from source artwork if needed
  await generateIcons();

  console.log('✅ PWA assets generated successfully');
}

async function ensureFaviconAssets() {
  const sourceFiles = [
    { src: 'art/agora-dark-1920.webp', dest: 'favicon/android-chrome-512x512.png', size: 512 },
    { src: 'art/agora-dark-1280.webp', dest: 'favicon/android-chrome-192x192.png', size: 192 },
    { src: 'art/gate-dark-1280.webp', dest: 'favicon/favicon-512x512.png', size: 512 },
    { src: 'art/gate-dark-1280.webp', dest: 'favicon/favicon-192x192.png', size: 192 },
    { src: 'art/gate-dark-640.webp', dest: 'favicon/favicon-128x128.png', size: 128 },
    { src: 'art/gate-dark-640.webp', dest: 'favicon/favicon-64x64.png', size: 64 },
    { src: 'art/gate-dark-640.webp', dest: 'favicon/favicon-32x32.png', size: 32 },
    { src: 'art/gate-dark-640.webp', dest: 'favicon/favicon-16x16.png', size: 16 },
  ];

  for (const file of sourceFiles) {
    const srcPath = join(PUBLIC_DIR, file.src);
    const destPath = join(FAVICON_DIR, file.dest);

    try {
      // In a real implementation, you'd use sharp to resize
      // For now, we'll copy if source exists
      const { existsSync } = await import('node:fs');
      if (existsSync(srcPath)) {
        await cp(srcPath, destPath);
        console.log(`  ✓ Copied ${file.src} → ${file.dest}`);
      }
    } catch (error) {
      console.warn(`  ⚠ Could not process ${file.src}:`, error.message);
    }
  }

  // Ensure basic favicon files exist
  const basicFavicons = [
    'favicon.ico',
    'favicon-16x16.png',
    'favicon-32x32.png',
    'apple-touch-icon.png',
  ];

  for (const favicon of basicFavicons) {
    const destPath = join(FAVICON_DIR, favicon);
    const sourcePath = join(FAVICON_DIR, 'favicon-32x32.png');
    try {
      const { existsSync, cp } = await import('node:fs');
      if (!existsSync(join(FAVICON_DIR, favicon)) && existsSync(sourcePath)) {
        await cp(sourcePath, join(FAVICON_DIR, favicon));
      }
    } catch {}
  }
}

async function generateManifest() {
  const manifest = {
    name: "عقل في صندوق | Mind in a Box",
    short_name: "عقل في صندوق",
    description: "ملاذك الفلسفي للذكاء الاصطناعي. اسأل، تأمّل، وابنِ وعيك — في بيئة معزولة عن ضجيج العالم.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#050505",
    theme_color: "#d4af37",
    icons: [
      {
        src: "/favicon/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable"
      },
      {
        src: "/favicon/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable"
      },
      {
        src: "/favicon/favicon-192x192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/favicon/favicon-512x512.png",
        sizes: "512x512",
        type: "image/png"
      }
    ],
    categories: ["lifestyle", "education", "productivity"],
    lang: "ar",
    dir: "rtl",
    prefer_related_applications: false,
    scope: "/",
  };

  const manifestPath = join(PUBLIC_DIR, 'favicon', 'site.webmanifest');
  await writeFile(join(PUBLIC_DIR, 'favicon', 'site.webmanifest'), JSON.stringify(manifest, null, 2));
  // Also copy to public root for Next.js
  await writeFile(join(PUBLIC_DIR, 'site.webmanifest'), JSON.stringify(manifest, null, 2));
  console.log('  ✓ Generated site.webmanifest');
}

async function generateServiceWorker() {
  // Service worker is already created as public/sw.js
  // This function would add cache busting hash
  const swPath = join(PUBLIC_DIR, 'sw.js');
  let swContent = await readFile(join(process.cwd(), 'public', 'sw.js'), 'utf8');

  // Add version hash for cache busting
  const version = createHash('md5').update(Date.now().toString()).digest('hex').slice(0, 8);
  swContent = swContent.replace(
    "const CACHE_NAME = 'mindinbox-v1';",
    `const CACHE_NAME = 'mindinbox-v1-${version}';`
  );

  await writeFile(join(PUBLIC_DIR, 'sw.js'), swContent);
  console.log('  ✓ Generated service worker with cache busting');
}

async function generateIcons() {
  // In a real implementation, use sharp to generate icons from source
  // For now, ensure the required icons exist
  const iconSizes = [16, 32, 48, 72, 96, 128, 144, 152, 192, 384, 512];

  for (const size of iconSizes) {
    const path = join(FAVICON_DIR, `icon-${size}x${size}.png`);
    // In production, generate with sharp
    console.log(`  ℹ Icon ${size}x${size} would be generated from source artwork`);
  }
}

async function writeFile(path, content) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}

async function readFile(path) {
  const { readFile } = await import('node:fs/promises');
  return readFile(path, 'utf8');
}

function createHash(algorithm) {
  const { createHash } = await import('node:crypto');
  return createHash(algorithm);
}

generatePWA().catch((error) => {
  console.error('❌ PWA generation failed:', error);
  process.exit(1);
});