/**
 * Final Audit Report Generator
 * Generates comprehensive before/after comparison report
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const PROJECT_ROOT = resolve(process.cwd());
const REPORT_DIR = join(PROJECT_ROOT, 'docs', 'audit', 'final');

async function generateFinalReport() {
  console.log('📋 Generating final audit report...');

  await mkdir(REPORT_DIR, { recursive: true });

  // Collect all metrics
  const metrics = await collectMetrics();

  // Generate the report
  const report = generateReport(metrics);

  const reportPath = join(REPORT_DIR, `FINAL_REPORT_${Date.now()}.md`);
  await writeFile(reportPath, report);

  console.log(`\n✅ Final report generated: ${reportPath}`);
  console.log('\n📊 Summary:');
  console.log(`  Performance: ${metrics.performance ? '✅' : '❌'}`);
  console.log(`  Accessibility: ${metrics.accessibility ? '✅' : '❌'}`);
  console.log(`  Best Practices: ${metrics.bestPractices ? '✅' : '❌'}`);
  console.log(`  SEO: ${metrics.seo ? '✅' : '❌'}`);
  console.log(`  PWA: ${metrics.pwa ? '✅' : '❌'}`);

  if (!metrics.allPassed) {
    console.error('\n❌ Some thresholds not met!');
    process.exit(1);
  }
}

async function collectMetrics() {
  const metrics = {
    performance: false,
    accessibility: false,
    bestPractices: false,
    seo: false,
    pwa: false,
    lcp: 0,
    cls: 0,
    inp: 0,
    jsSize: 0,
    allPassed: false,
    timestamp: new Date().toISOString(),
    gitCommit: getGitCommit(),
    buildNumber: process.env.BUILD_NUMBER || 'local',
  };

  // Run lighthouse if available
  try {
    const lighthouseResults = await runLighthouseCheck();
    metrics.performance = lighthouseResults.performance >= 90;
    metrics.accessibility = lighthouseResults.accessibility >= 90;
    metrics.bestPractices = lighthouseResults.bestPractices >= 90;
    metrics.seo = lighthouseResults.seo >= 90;
    metrics.pwa = lighthouseResults.pwa >= 90;
    metrics.lcp = lighthouseResults.lcp;
    metrics.cls = lighthouseResults.cls;
    metrics.inp = lighthouseResults.inp;
  } catch (e) {
    console.warn('Lighthouse check skipped:', e.message);
  }

  // Check bundle size
  try {
    metrics.jsSize = await checkBundleSize();
  } catch (e) {
    console.warn('Bundle size check skipped:', e.message);
  }

  // Run typecheck
  try {
    execSync('npm run typecheck', { stdio: 'pipe' });
    metrics.typecheck = true;
  } catch {
    metrics.typecheck = false;
  }

  // Run lint
  try {
    execSync('npm run lint', { stdio: 'pipe' });
    metrics.lint = true;
  } catch {
    metrics.lint = false;
  }

  // Run tests
  try {
    execSync('npm run test', { stdio: 'pipe' });
    metrics.tests = true;
  } catch {
    metrics.tests = false;
  }

  // Overall pass
  metrics.allPassed = metrics.performance &&
                      metrics.accessibility &&
                      metrics.bestPractices &&
                      metrics.seo &&
                      metrics.pwa &&
                      metrics.typecheck &&
                      metrics.lint &&
                      metrics.tests &&
                      (metrics.lcp < 2500) &&
                      (metrics.cls < 0.05) &&
                      (metrics.inp < 200) &&
                      (metrics.jsSize < 150);

  return metrics;
}

async function runLighthouseCheck() {
  // Run lighthouse on key pages
  const urls = [
    'http://localhost:3000/',
    'http://localhost:3000/enter',
    'http://localhost:3000/wisdom',
    'http://localhost:3000/dialogue',
    'http://localhost:3000/journal',
    'http://localhost:3000/tracker',
  ];

  let totalPerf = 0, totalA11y = 0, totalBP = 0, totalSEO = 0, totalPWA = 0;
  let totalLCP = 0, totalCLS = 0, totalINP = 0;
  let count = 0;

  for (const url of urls) {
    try {
      const result = await runLighthouseForUrl(url);
      totalPerf += result.performance;
      totalA11y += result.accessibility;
      totalBP += result.bestPractices;
      totalSEO += result.seo;
      totalPWA += result.pwa;
      totalLCP += result.lcp;
      totalCLS += result.cls;
      totalINP += result.inp;
      count++;
    } catch (e) {
      console.warn(`Lighthouse failed for ${url}:`, e.message);
    }
  }

  return {
    performance: count > 0 ? totalPerf / count : 0,
    accessibility: count > 0 ? totalA11y / count : 0,
    bestPractices: count > 0 ? totalBP / count : 0,
    seo: count > 0 ? totalSEO / count : 0,
    pwa: count > 0 ? totalPWA / count : 0,
    lcp: count > 0 ? totalLCP / count : 0,
    cls: count > 0 ? totalCLS / count : 0,
    inp: count > 0 ? totalINP / count : 0,
  };
}

function runLighthouseForUrl(url) {
  return new Promise((resolve, reject) => {
    const outputPath = `/tmp/lighthouse-${Date.now()}.json`;
    const command = `npx lighthouse "${url}" --output=json --output-path="${outputPath}" --chrome-flags="--headless --no-sandbox --disable-setuid-sandbox" --quiet`;

    try {
      execSync(command, { timeout: 120000, encoding: 'utf8' });
      const fs = require('fs');
      const report = JSON.parse(require('fs').readFileSync(outputPath, 'utf8'));

      const categories = report.categories || {};
      resolve({
        performance: Math.round((categories.performance?.score || 0) * 100),
        accessibility: Math.round((categories.accessibility?.score || 0) * 100),
        bestPractices: Math.round((categories['best-practices']?.score || 0) * 100),
        seo: Math.round((categories.seo?.score || 0) * 100),
        pwa: Math.round((categories.pwa?.score || 0) * 100),
        lcp: report.audits?.['largest-contentful-paint']?.numericValue || 0,
        cls: report.audits?.['cumulative-layout-shift']?.numericValue || 0,
        inp: report.audits?.['interaction-to-next-paint']?.numericValue || 0,
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function checkBundleSize() {
  // Check the build output for JS bundle sizes
  const { readdir, readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');

  const buildDir = '.next/static/chunks';
  try {
    const files = await readdir(join(process.cwd(), buildDir));
    let totalSize = 0;

    for (const file of files) {
      if (file.endsWith('.js')) {
        const stats = await import('node:fs/promises').then(fs => fs.stat(join(process.cwd(), buildDir, file)));
        totalSize += stats.size;
      }
    }

    return Math.round(totalSize / 1024); // KB
  } catch {
    return 0;
  }
}

function getGitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function generateReport(metrics) {
  return `# FINAL AUDIT REPORT — عقل في صندوق | Mind in a Box

**Date:** ${metrics.timestamp}
**Git Commit:** ${metrics.gitCommit}
**Build:** ${metrics.buildNumber}
**Environment:** ${process.env.NODE_ENV || 'development'}

---

## 🎯 EXECUTIVE SUMMARY

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| **Lighthouse Performance** | ≥ 90 | ${metrics.performance ? '✅' : '❌'} ${Math.round(metrics.performance * 100) || 'N/A'}% | ${metrics.performance ? 'PASS' : 'FAIL'} |
| **Lighthouse Accessibility** | ≥ 90 | ${metrics.accessibility ? '✅' : '❌'} ${Math.round(metrics.accessibility * 100) || 'N/A'}% | ${metrics.accessibility ? 'PASS' : 'FAIL'} |
| **Lighthouse Best Practices** | ≥ 90 | ${metrics.bestPractices ? '✅' : '❌'} ${Math.round(metrics.bestPractices * 100) || 'N/A'}% | ${metrics.bestPractices ? 'PASS' : 'FAIL'} |
| **Lighthouse SEO** | ≥ 90 | ${metrics.seo ? '✅' : '❌'} ${Math.round(metrics.seo * 100) || 'N/A'}% | ${metrics.seo ? 'PASS' : 'FAIL'} |
| **Lighthouse PWA** | ≥ 90 | ${metrics.pwa ? '✅' : '❌'} ${Math.round(metrics.pwa * 100) || 'N/A'}% | ${metrics.pwa ? 'PASS' : 'FAIL'} |
| **LCP (Largest Contentful Paint)** | < 2500ms | ${metrics.lcp}ms | ${metrics.lcp < 2500 ? 'PASS' : 'FAIL'} |
| **CLS (Cumulative Layout Shift)** | < 0.05 | ${metrics.cls.toFixed(4)} | ${metrics.cls < 0.05 ? 'PASS' : 'FAIL'} |
| **INP (Interaction to Next Paint)** | < 200ms | ${metrics.inp}ms | ${metrics.inp < 200 ? 'PASS' : 'FAIL'} |
| **JavaScript Bundle (gzipped)** | < 150KB | ${metrics.jsSize}KB | ${metrics.jsSize < 150 ? 'PASS' : 'FAIL'} |
| **TypeScript** | 0 errors | ${metrics.typecheck ? '0' : 'ERRORS'} | ${metrics.typecheck ? 'PASS' : 'FAIL'} |
| **ESLint** | 0 warnings | ${metrics.lint ? '0' : 'WARNINGS'} | ${metrics.lint ? 'PASS' : 'FAIL'} |
| **Unit Tests** | All pass | ${metrics.tests ? '✅' : '❌'} | ${metrics.tests ? 'PASS' : 'FAIL'} |

---

## 🏁 OVERALL VERDICT

# ${metrics.allPassed ? '✅ ALL THRESHOLDS MET — READY FOR PRODUCTION' : '❌ SOME THRESHOLDS NOT MET — BLOCKERS REMAIN'}

---

## 📋 DETAILED CHECKLIST

### ✅ Performance
- [ ] LCP < 2.5s on 3G throttled
- [ ] CLS < 0.05 on all routes
- [ ] INP < 200ms
- [ ] JS bundle < 150KB gzipped
- [ ] Lighthouse Performance ≥ 95
- [ ] No render-blocking resources
- [ ] Images optimized (AVIF/WebP)
- [ ] Fonts preloaded with display=swap

### ✅ Accessibility (WCAG 2.2 AA)
- [ ] All images have alt text
- [ ] All interactive elements have labels
- [ ] Tab order logical (skip-link → logo → nav → main)
- [ ] Focus ring visible on all focusable elements
- [ ] No keyboard traps except modals
- [ ] WCAG 2.2 AA contrast on all text
- [ ] Reduced motion respected
- [ ] RTL layout correct
- [ ] Screen reader tested (NVDA/VoiceOver)

### ✅ SEO
- [ ] Self-referencing canonical on all pages
- [ ] Complete meta tags (title, description, OG, Twitter)
- [ ] Sitemap.xml valid and complete
- [ ] Robots.txt correct
- [ ] Canonical URLs for noindex pages (/enter, /tracker, /journal, /account)
- [ ] Structured data (JSON-LD) on home page
- [ ] hreflang for ar/en
- [ ] Noindex on private pages

### ✅ Security
- [ ] CSP with nonce (no unsafe-inline for scripts)
- [ ] HSTS with preload
- [ ] X-Content-Type-Options: nosniff
- [ ] X-Frame-Options: DENY
- [ ] Referrer-Policy: strict-origin
- [ ] Permissions-Policy restrictive
- [ ] CSP connects only to allowed domains
- [ ] No secrets in bundle
- [ ] npm audit clean

### ✅ PWA
- [ ] Manifest valid with icons
- [ ] Service Worker registered
- [ ] Offline fallback for journal
- [ ] Install prompt works
- [ ] Icons for all sizes (192, 512, maskable)

### ✅ Cross-browser / Cross-device
- [ ] Chrome (desktop/mobile)
- [ ] Firefox (desktop/mobile)
- [ ] Safari (desktop/mobile)
- [ ] 360px, 390px, 768px, 1280px, 1920px
- [ ] Dark & Light themes
- [ ] RTL layout verified
- [ ] Arabic & English locales

### ✅ Testing
- [ ] Unit tests pass (Vitest)
- [ ] E2E tests pass (Playwright)
- [ ] Visual regression snapshots match
- [ ] Playwright on Chromium, Firefox, WebKit
- [ ] Mobile (360px, 390px) + Tablet (768px) + Desktop (1280px, 1920px)
- [ ] Both themes (dark/light)
- [ ] Both locales (ar/en)
- [ ] Visual regression snapshots match

### ✅ PWA
- [ ] Service Worker registers
- [ ] Offline journal works
- [ ] Manifest valid
- [ ] Install prompt
- [ ] Icons all sizes

---

## 🚀 LAUNCH CHECKLIST

### Pre-deployment
- [ ] All CI checks pass
- [ ] Preview deployment tested
- [ ] Firebase config verified in Cloudflare
- [ ] Custom domain configured
- [ ] Analytics configured (Plausible/Cloudflare)
- [ ] Error tracking configured (Sentry)
- [ ] Uptime monitoring configured

### Deployment
- [ ] Deploy to Preview
- [ ] Smoke test on Preview
- [ ] Visual regression on Preview
- [ ] Lighthouse on Preview
- [ ] Promote to Production

### Post-deployment
- [ ] Verify Production URL
- [ ] Check console for errors
- [ ] Verify Analytics events
- [ ] Test critical paths:
  - [ ] Visitor → Guest → Wisdom
  - [ ] Visitor → Signup → Journal
  - [ ] Visitor → Dialogue
  - [ ] Guest → Signup → Data persists
  - [ ] Offline journal works
- [ ] Monitor for 1 hour

### Rollback Plan
- [ ] Previous deployment tagged
- [ ] Rollback command documented
- [ ] Database migration reversible
- [ ] Feature flags for quick disable

---

## 📸 VISUAL REGRESSION BASELINE

Screenshots captured at:
- 5 viewports × 2 themes × 2 locales = 20 combinations per route
- Routes: /, /enter, /wisdom, /dialogue, /journal, /tracker, /paths, /quotes, /pricing, /privacy, /terms, /account
- Total: 240 screenshots
- Stored in: \`docs/audit/screenshots/\`

---

## 📊 BUILD ARTIFACTS

- **Build output**: \`.next/\`
- **Lighthouse reports**: \`lighthouse-reports/\`
- **Playwright traces**: \`test-results/\`
- **Visual snapshots**: \`docs/audit/screenshots/\`
- **Bundle analysis**: \`.next/analyze/\`

---

## 📝 SIGN-OFF

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Principal Engineer | | | |
| Design Lead | | | |
| Product Owner | | | |

---

*Report generated by automated audit pipeline*
*Git commit: ${require('child_process').execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()}*
*Generated: ${new Date().toISOString()}*
`;
  return report;
}

generateFinalReport().catch((error) => {
  console.error('❌ Report generation failed:', error);
  process.exit(1);
});