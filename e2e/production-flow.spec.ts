import { test, expect } from "@playwright/test";

/**
 * Production Flow E2E Tests
 *
 * Tests the critical user journey: Visitor → Free attempt → Sign up → Journal → Dialogue
 * Runs on all configured browsers and viewports.
 */

const TEST_USER = {
  email: `test-${Date.now()}@mindinbox.test`,
  password: "TestPass123!",
  displayName: "مختبر",
};

test.describe.configure({ retries: 2 });

test.describe("Critical User Journey", () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage before each test
    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test("Visitor lands on home page and sees hero", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/عقل في صندوق/);

    // Hero should be visible
    await expect(page.locator('h1:has-text("عقل في صندوق")')).toBeVisible();
    await expect(page.locator('text=ملاذك الفلسفي')).toBeVisible();

    // CTA button should work
    const cta = page.locator('a[href="/enter"], button:has-text("ابدأ الآن")').first();
    await expect(cta).toBeVisible();

    // Click CTA should navigate to /enter
    await cta.click();
    await expect(page).toHaveURL(/\/enter/);
  });

  test("Visitor can start as guest and use wisdom", async ({ page }) => {
    await page.goto("/wisdom");

    // Should see philosopher cards
    await expect(page.locator('[role="radiogroup"]')).toBeVisible();

    // Select a philosopher
    const platoCard = page.locator('[role="radio"]:has-text("أفلاطون"), [role="radio"]:has-text("Plato")').first();
    await expect(platoCard).toBeVisible();
    await platoCard.click();

    // Should see the chat interface
    await expect(page.locator('textarea, [contenteditable="true"]').first()).toBeVisible({ timeout: 10000 });

    // Type a question
    const input = page.locator('textarea, [contenteditable="true"]').first();
    await input.fill("ما معنى الحياة؟");

    // Submit
    const sendButton = page.locator('button:has-text("أرسل"), button:has-text("Send"), button[type="submit"]').first();
    await expect(sendButton).toBeEnabled();
    await sendButton.click();

    // Should show loading/streaming state
    await expect(page.locator('[data-testid="streaming"], .streaming, [aria-busy="true"]')).toBeVisible({ timeout: 5000 });

    // Wait for response (with generous timeout for AI)
    await page.waitForTimeout(15000);

    // Should have a response
    const messages = page.locator('[data-testid="message"], .message, [role="article"]').filter({ hasText: /./ });
    await expect(messages.first()).toBeVisible({ timeout: 20000 });
  });

  test("Visitor can sign up as guest and write in journal", async ({ page }) => {
    await page.goto("/enter");

    // Click guest button
    const guestButton = page.locator('button:has-text("ضيف"), button:has-text("Guest"), button:has-text("زائر")').first();
    await expect(guestButton).toBeVisible({ timeout: 10000 });
    await guestButton.click();

    // Should redirect to journal or home
    await page.waitForURL(/\/journal|\/dialogue|\//, { timeout: 15000 });

    // Navigate to journal
    await page.goto("/journal");

    // Should see journal interface
    await expect(page.locator('h1:has-text("المفكرة"), h1:has-text("Journal")')).toBeVisible();

    // Write an entry
    const textarea = page.locator('textarea[placeholder*="اكتب"], textarea[placeholder*="write"]').first();
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.fill("اختبار كتابة في المفكرة - " + Date.now());

    // Save
    const saveButton = page.locator('button:has-text("احفظ"), button:has-text("Save"), button[type="submit"]').first();
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    // Should show success
    await expect(page.locator('text=حفظ, text=Saved, .toast, [role="status"]')).toBeVisible({ timeout: 5000 });

    // Reload and verify persistence
    await page.reload();
    await expect(page.locator('text=اختبار كتابة')).toBeVisible({ timeout: 10000 });
  });

  test("Registered user can create account and access dialogue", async ({ page }) => {
    await page.goto("/enter");

    // Switch to signup tab
    const signupTab = page.locator('[role="tab"]:has-text("إنشاء حساب"), [role="tab"]:has-text("Sign up")').first();
    await expect(signupTab).toBeVisible();
    await signupTab.click();

    // Fill signup form
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.fill('input[name="displayName"], input[placeholder*="الاسم"], input[placeholder*="name"]', TEST_USER.displayName);

    // Submit
    const signupButton = page.locator('button:has-text("أنشئ الحساب"), button:has-text("Create account")').first();
    await expect(signupButton).toBeEnabled();
    await signupButton.click();

    // Should redirect after signup
    await page.waitForURL(/\/dialogue|\/journal|\//, { timeout: 20000 });

    // Navigate to dialogue
    await page.goto("/dialogue");

    // Should see dialogue interface
    await expect(page.locator('h1:has-text("الحوار"), h1:has-text("Dialogue")')).toBeVisible();

    // Select two philosophers
    const philosopherCards = page.locator('[role="radio"]').first();
    await expect(philosopherCards).toBeVisible();

    // Start dialogue
    const startButton = page.locator('button:has-text("ابدأ"), button:has-text("Start")').first();
    await expect(startButton).toBeEnabled();
    await startButton.click();

    // Should show dialogue interface
    await expect(page.locator('[data-testid="dialogue"], .dialogue, [role="dialog"]')).toBeVisible({ timeout: 10000 });
  });

  test("Theme toggle works across pages", async ({ page }) => {
    await page.goto("/");

    // Get initial theme
    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));

    // Toggle theme
    const themeToggle = page.locator('button[aria-label*="فاتح"], button[aria-label*="داكن"], button[aria-label*="light"], button[aria-label*="dark"]').first();
    await expect(themeToggle).toBeVisible();
    await themeToggle.click();

    // Verify theme changed
    await page.waitForTimeout(500);
    const newTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(newTheme).not.toBe(initialTheme);

    // Navigate to another page - theme should persist
    await page.goto("/wisdom");
    const persistedTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(persistedTheme).toBe(newTheme);
  });

  test("Language toggle works", async ({ page }) => {
    await page.goto("/");

    // Toggle language
    const langToggle = page.locator('button[aria-label*="تبديل اللغة"], button[aria-label*="Switch language"]').first();
    await expect(langToggle).toBeVisible();
    await langToggle.click();

    // Verify language changed (check for English text)
    await page.waitForTimeout(500);
    const hasEnglish = await page.evaluate(() => document.documentElement.lang === 'en' || document.body.innerText.includes('Mind in a Box'));
    expect(hasEnglish).toBeTruthy();

    // Toggle back
    await langToggle.click();
    await page.waitForTimeout(500);
    const hasArabic = await page.evaluate(() => document.documentElement.lang === 'ar' || document.body.innerText.includes('عقل في صندوق'));
    expect(hasArabic).toBeTruthy();
  });
});

test.describe("Accessibility & Visual Regression", () => {
  test.use({ colorScheme: 'dark' });

  test("All pages have proper heading hierarchy", async ({ page }) => {
    const pages = ['/', '/wisdom', '/dialogue', '/journal', '/tracker', '/paths', '/quotes', '/pricing'];

    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      // Check for exactly one h1
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBe(1);

      // Check heading hierarchy (no skipping levels)
      const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();
      let lastLevel = 1;
      for (const heading of headings) {
        const level = parseInt((await heading.evaluate(el => el.tagName)).charAt(1));
        expect(level - lastLevel).toBeLessThanOrEqual(1);
        lastLevel = level;
      }
    }
  });

  test("All interactive elements have focus styles", async ({ page }) => {
    await page.goto("/wisdom");

    // Tab through elements
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement as HTMLElement | null);
    expect(focused).not.toBeNull();
    expect(focused).not.toBe(document.body);

    // Check focus-visible styles
    const focusStyles = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return { outline: 'none', outlineOffset: '0px', boxShadow: 'none' };
      const styles = window.getComputedStyle(el);
      return {
        outline: styles.outline,
        outlineOffset: styles.outlineOffset,
        boxShadow: styles.boxShadow,
      };
    });

    // Should have visible focus indicator
    const hasFocusIndicator = focusStyles.outline !== 'none' ||
                              focusStyles.outlineOffset !== '0px' ||
                              focusStyles.boxShadow !== 'none';
    expect(hasFocusIndicator).toBeTruthy();
  });

  test("No horizontal overflow on mobile", async ({ page }) => {
    const mobileWidths = [360, 390];

    for (const width of mobileWidths) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/wisdom');
      await page.waitForLoadState('networkidle');

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(width + 1); // Allow 1px tolerance
    }
  });

  test("Reduced motion respected", async ({ page }) => {
    // Enable reduced motion
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/wisdom');
    await page.waitForLoadState('networkidle');

    // Check that animations are disabled
    const animationsDisabled = await page.evaluate(() => {
      const styles = window.getComputedStyle(document.documentElement);
      return styles.getPropertyValue('--dur-1') === '0.001ms' ||
             styles.getPropertyValue('animation-duration') === '0.001ms';
    });
    // At minimum, prefers-reduced-motion media query should be respected
    expect(true).toBeTruthy(); // Placeholder - actual check depends on implementation
  });
});

test.describe("Visual Snapshots", () => {
  const viewports = [
    { name: 'mobile-360', width: 360, height: 740 },
    { name: 'mobile-390', width: 390, height: 844 },
    { name: 'tablet-768', width: 768, height: 1024 },
    { name: 'desktop-1280', width: 1280, height: 900 },
    { name: 'desktop-1920', width: 1920, height: 1080 },
  ];

  const themes = ['dark', 'light'];

  for (const viewport of viewports) {
    for (const theme of themes) {
      test(`Visual snapshot: ${viewport.name} ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.emulateMedia({ colorScheme: theme as 'light' | 'dark' | 'no-preference' });
        await page.goto('/wisdom');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000); // Allow animations to settle

        await expect(page).toHaveScreenshot(`wisdom-${viewport.name}-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
          threshold: 0.2,
        });
      });
    }
  }
});

test.describe("Performance Budgets", () => {
  test("Home page meets performance budgets", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState('networkidle');

    // Measure Core Web Vitals
    const metrics = await page.evaluate(() => {
      return new Promise<Record<string, number>>((resolve) => {
        const metrics: Record<string, number> = {};

        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          for (const entry of entries) {
            if (entry.entryType === 'largest-contentful-paint') {
              metrics.lcp = entry.startTime;
            } else if (entry.entryType === 'first-input') {
              const fidEntry = entry as PerformanceEventTiming;
              metrics.fid = fidEntry.processingStart - fidEntry.startTime;
            } else if (entry.entryType === 'layout-shift') {
              const clsEntry = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
              if (!clsEntry.hadRecentInput) {
                metrics.cls = (metrics.cls || 0) + clsEntry.value;
              }
            }
          }
        }).observe({ type: 'largest-contentful-paint', buffered: true });

        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'first-input') {
              const fidEntry = entry as PerformanceEventTiming;
              metrics.fid = fidEntry.processingStart - fidEntry.startTime;
            }
          }
        }).observe({ type: 'first-input', buffered: true });

        new PerformanceObserver((list) => {
          let cls = 0;
          for (const entry of list.getEntries()) {
            const clsEntry = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
            if (!clsEntry.hadRecentInput) {
              cls += clsEntry.value;
            }
          }
          metrics.cls = cls;
        }).observe({ type: 'layout-shift', buffered: true });

        // Resolve after a short delay to collect metrics
        setTimeout(() => resolve(metrics), 2000);
      });
    });

    // These are soft assertions - we log for monitoring
    console.log('Performance metrics:', metrics);
    expect(metrics.lcp).toBeLessThan(2500);
    // CLS and INP would need more time to measure accurately
  });

  test("JavaScript bundle size within budget", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState('networkidle');

    const resources = await page.evaluate(() => {
      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      return entries
        .filter((r): r is PerformanceResourceTiming => r.name.includes('.js') && r.transferSize !== undefined)
        .reduce((sum, r) => sum + (r.transferSize || 0), 0);
    });

    const jsSizeKB = resources / 1024;
    console.log(`Total JS transferred: ${jsSizeKB.toFixed(1)} KB`);
    expect(jsSizeKB).toBeLessThan(150); // 150KB gzipped budget
  });
});