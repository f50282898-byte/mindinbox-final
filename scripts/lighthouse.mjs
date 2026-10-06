/**
 * Lighthouse CI Runner
 * Runs Lighthouse performance audits against local or deployed site
 */

import { execSync } from 'node:child_process';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const PROJECT_ROOT = resolve(process.cwd());
const REPORT_DIR = join(PROJECT_ROOT, 'lighthouse-reports');

async function runLighthouse() {
  console.log('🚀 Starting Lighthouse CI audit...');

  // Ensure report directory exists
  await mkdir(join(PROJECT_ROOT, 'lighthouse-reports'), { recursive: true });

  const baseUrl = process.env.LHCI_BASE_URL || 'http://localhost:3000';
  const isLocal = baseUrl.includes('localhost');

  if (isLocal) {
    console.log(`📍 Running against local server: ${baseUrl}`);
    // Ensure local server is running
    await ensureLocalServer();
  } else {
    console.log(`📍 Running against deployed URL: ${baseUrl}`);
  }

  const urls = [
    '/',
    '/enter',
    '/wisdom',
    '/dialogue',
    '/journal',
    '/tracker',
    '/paths',
    '/quotes',
    '/pricing',
    '/privacy',
    '/terms',
  ];

  const results = [];

  for (const path of urls) {
    const url = `${baseUrl}${path}`;
    console.log(`\n🔍 Auditing ${url}...`);

    try {
      const result = await runLighthouseForUrl(url, path);
      results.push({ path, ...result });
      console.log(`  ✅ ${path}: Perf=${result.performance}, A11y=${result.accessibility}, BP=${result['best-practices']}, SEO=${result.seo}`);
    } catch (error) {
      console.error(`  ❌ ${path}: ${error.message}`);
      results.push({ path, error: error.message });
    }
  }

  // Generate summary report
  await generateReport(results);

  // Check thresholds
  const passed = checkThresholds(results);
  if (!passed) {
    console.error('\n❌ Performance thresholds not met!');
    process.exit(1);
  }

  console.log('\n✅ All performance thresholds met!');
}

async function ensureLocalServer() {
  // Check if server is running
  try {
    const response = await fetch('http://localhost:3000', { method: 'HEAD', timeout: 5000 });
    if (response.ok) {
      console.log('  ✓ Local server is running');
      return;
    }
  } catch {
    // Server not running
  }

  console.log('  ⚠ Local server not running. Starting...');
  // In CI, the webServer in playwright.config.ts handles this
  // For local runs, we assume the server is already started
}

async function runLighthouseForUrl(url, path) {
  const safePath = path.replace(/\//g, '_') || 'home';
  const outputPath = `./lighthouse-reports/${path.replace(/\//g, '_') || 'home'}.json`;

  const command = `npx lhci autorun --url="${url}" --output="${outputPath}" --preset=desktop --config=lighthouserc.json 2>&1`;

  try {
    const output = execSync(command, { encoding: 'utf8', timeout: 120000, maxBuffer: 10 * 1024 * 1024 });

    // Parse the JSON output
    const reportPath = `./lighthouse-reports/${path.replace(/\//g, '_') || 'home'}.json`;
    const report = JSON.parse(await import('node:fs/promises').then(fs => fs.readFile(reportPath, 'utf8')));

    const categories = report.categories || {};
    return {
      performance: Math.round((categories.performance?.score || 0) * 100),
      accessibility: Math.round((categories.accessibility?.score || 0) * 100),
      'best-practices': Math.round((categories['best-practices']?.score || 0) * 100),
      seo: Math.round((categories.seo?.score || 0) * 100),
      pwa: Math.round((categories.pwa?.score || 0) * 100),
      lcp: report.audits?.['largest-contentful-paint']?.numericValue || 0,
      cls: report.audits?.['cumulative-layout-shift']?.numericValue || 0,
      inp: report.audits?.['interaction-to-next-paint']?.numericValue || 0,
      fcp: report.audits?.['first-contentful-paint']?.numericValue || 0,
      tbt: report.audits?.['total-blocking-time']?.numericValue || 0,
    };
  } catch (error) {
    throw new Error(`Lighthouse failed: ${error.message}`);
  }
}

async function generateReport(results) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = join(process.cwd(), 'lighthouse-reports', `report-${Date.now()}.md`);

  let markdown = `# Lighthouse Performance Report\n\n`;
  markdown += `**Date:** ${new Date().toISOString()}\n`;
  markdown += `**Environment:** ${process.env.LHCI_BASE_URL || 'local'}\n\n`;

  markdown += `## Summary\n\n`;
  markdown += `| Page | Performance | Accessibility | Best Practices | SEO | PWA | LCP (ms) | CLS | INP (ms) |\n`;
  markdown += `|------|-------------|---------------|----------------|-----|-----|----------|-----|----------|\n`;

  let allPassed = true;

  for (const result of results) {
    if (result.error) {
      markdown += `| ${result.path} | ❌ Error | - | - | - | - | - | - | - |\n`;
      allPassed = false;
      continue;
    }

    const perf = result.performance >= 90 ? '✅' : result.performance >= 50 ? '⚠️' : '❌';
    const a11y = result.accessibility >= 90 ? '✅' : result.accessibility >= 50 ? '⚠️' : '❌';
    const bp = result['best-practices'] >= 90 ? '✅' : result['best-practices'] >= 50 ? '⚠️' : '❌';
    const seo = result.seo >= 90 ? '✅' : result.seo >= 50 ? '⚠️' : '❌';
    const pwa = result.pwa >= 90 ? '✅' : result.pwa >= 50 ? '⚠️' : '❌';

    const lcpPass = result.lcp <= 2500 ? '✅' : '❌';
    const clsPass = result.cls <= 0.1 ? '✅' : '❌';
    const inpPass = result.inp <= 200 ? '✅' : '❌';

    if (result.performance < 90 || result.accessibility < 90 || result['best-practices'] < 90 || result.seo < 90) {
      allPassed = false;
    }
    if (result.lcp > 2500 || result.cls > 0.1 || result.inp > 200) {
      allPassed = false;
    }

    markdown += `| ${result.path} | ${perf} ${result.performance} | ${a11y} ${result.accessibility} | ${bp} ${result['best-practices']} | ${seo} ${result.seo} | ${pwa} ${result.pwa} | ${lcpPass} ${result.lcp} | ${clsPass} ${result.cls.toFixed(4)} | ${inpPass} ${result.inp} |\n`;
  }

  markdown += `\n## Thresholds\n\n`;
  markdown += `- Performance: ≥ 90\n`;
  markdown += `- Accessibility: ≥ 90\n`;
  markdown += `- Best Practices: ≥ 90\n`;
  markdown += `- SEO: ≥ 90\n`;
  markdown += `- PWA: ≥ 90\n`;
  markdown += `- LCP: ≤ 2500ms\n`;
  markdown += `- CLS: ≤ 0.1\n`;
  markdown += `- INP: ≤ 200ms\n\n`;

  markdown += allPassed ? `## ✅ ALL THRESHOLDS MET\n` : `## ❌ SOME THRESHOLDS NOT MET\n`;

  await writeFile(`./lighthouse-reports/report-${Date.now()}.md`, markdown);
  console.log(`\n📄 Report saved to lighthouse-reports/`);
}

function checkThresholds(results) {
  for (const result of results) {
    if (result.error) return false;
    if (result.performance < 90) return false;
    if (result.accessibility < 90) return false;
    if (result['best-practices'] < 90) return false;
    if (result.seo < 90) return false;
    if (result.lcp > 2500) return false;
    if (result.cls > 0.05) return false;
    if (result.inp > 200) return false;
  }
  return true;
}

async function writeFile(path, content) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await import('node:fs/promises').then(fs => fs.mkdir(require('node:path').dirname(path), { recursive: true }));
  await import('node:fs/promises').then(fs => fs.writeFile(path, content, 'utf8'));
}

runLighthouse().catch((error) => {
  console.error('❌ Lighthouse CI failed:', error);
  process.exit(1);
});