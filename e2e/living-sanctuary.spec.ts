import { test, expect, type Page } from "@playwright/test";

/**
 * The Living Sanctuary — Comprehensive 4-Tier Opaque-Box E2E Test Suite
 *
 * Implements the full test hierarchy for the Apple-grade digital overhaul:
 * - Tier 1: Feature Coverage (>=5 test cases per primary feature area)
 *   * App Shell Architecture & Accessibility Contracts
 *   * Editorial Home Page (UtopiaHero, Reading Table, Argument Lab, Portrait Screening)
 *   * All 11 Primary Pages (/wisdom, /dialogue, /journal, /tracker, /quotes, /paths, /pricing, /oracle, /sanctum, /enter, /account)
 * - Tier 2: Boundary & Corner Cases
 *   * Mobile viewports (390px, 430px) vs Ultra-wide Desktop (1440px, 1920px)
 *   * Dark Mode (Luminous Obsidian) vs Light Mode (Modern Parchment) toggle & persistence
 *   * RTL Layout Direction & Arabic Typography Rendering
 *   * Keyboard Shortcuts & Focus Ring Accessibility
 * - Tier 3: Cross-Feature Interactions
 *   * Multi-route state & theme retention
 *   * AI dialogue turn sequence & guest quota preservation
 *   * Home philosopher lens query parameter deep-linking
 *   * Quotes template customization & favorites state
 * - Tier 4: Real-World Sanctuary Workflows
 *   * End-to-End Sanctuary Pilgrim Journey (Home -> Wisdom -> Quotes -> Pricing -> Account)
 *   * Visitor to Member Gateway Exploration Flow
 */

const PRIMARY_11_ROUTES = [
  "/wisdom",
  "/dialogue",
  "/journal",
  "/tracker",
  "/quotes",
  "/paths",
  "/pricing",
  "/oracle",
  "/sanctum",
  "/enter",
  "/account",
] as const;

/**
 * Navigate to path and wait until client hydration is established.
 * AppShell signals hydration by setting document.documentElement.dataset.hydrated = "1".
 */
async function gotoHydrated(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.documentElement.dataset.hydrated === "1",
    null,
    { timeout: 25_000 }
  );
  return response;
}

// ============================================================================
// TIER 1: FEATURE COVERAGE (>=5 test cases per primary feature area)
// ============================================================================

test.describe("Tier 1: Primary Area 1 — App Shell Architecture & Accessibility Contracts", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("T1.1.1: Single <main id=\"main\"> landmark integrity across routes", async ({ page }) => {
    for (const route of ["/", "/wisdom", "/pricing", "/paths"]) {
      await gotoHydrated(page, route);
      const mains = page.locator("main#main");
      await expect(mains).toHaveCount(1);
      await expect(mains).toBeVisible();
    }
  });

  test("T1.1.2: Client hydration handshake data-hydrated='1' contract", async ({ page }) => {
    await gotoHydrated(page, "/");
    const hydrated = await page.evaluate(
      () => document.documentElement.dataset.hydrated
    );
    expect(hydrated).toBe("1");
  });

  test("T1.1.3: Skip-link keyboard bypass is first focus and resolves to #main", async ({ page }) => {
    await gotoHydrated(page, "/pricing");
    await page.keyboard.press("Tab");
    const activeClass = await page.evaluate(
      () => document.activeElement?.className ?? ""
    );
    expect(activeClass).toContain("skip-link");

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });

  test("T1.1.4: Desktop header renders primary navigation links and brand link", async ({ page }) => {
    await gotoHydrated(page, "/pricing");
    const header = page.locator("header.studio-header.hidden.md\\:block");
    await expect(header).toBeVisible();

    const nav = header.locator('nav[aria-label="التنقل الرئيسي"], nav[aria-label="Main navigation"]');
    await expect(nav).toBeVisible();

    // Must link to the 4 primary practices
    const hrefs = await nav.locator("a").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    expect(hrefs).toContain("/wisdom");
    expect(hrefs).toContain("/dialogue");
    expect(hrefs).toContain("/journal");
    expect(hrefs).toContain("/tracker");
  });

  test("T1.1.5: Appearance controls render accessible language and theme switches", async ({ page }) => {
    await gotoHydrated(page, "/pricing");
    const controls = page.locator(".appearance-controls").first();
    await expect(controls).toBeVisible();

    const langBtn = controls.locator("button").first();
    const themeBtn = controls.locator("button").nth(1);

    await expect(langBtn).toHaveAttribute("aria-label", /English|العربية/);
    await expect(themeBtn).toHaveAttribute("aria-label", /فاتح|داكن|light|dark/i);
  });

  test("T1.1.6: Mobile bottom bar renders 5-slot navigation grid on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHydrated(page, "/pricing");

    const bottomNav = page.locator('nav.studio-bottom-nav[aria-label="التنقل السريع"], nav.studio-bottom-nav[aria-label="Quick navigation"]');
    await expect(bottomNav).toBeVisible();

    const items = bottomNav.locator("li");
    await expect(items).toHaveCount(5);

    // Each item satisfies minimum touch target
    for (let i = 0; i < 5; i++) {
      const box = await items.nth(i).boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(40);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    }
  });
});

test.describe("Tier 1: Primary Area 2 — Editorial Home Page & UtopiaHero Experience", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("T1.2.1: UtopiaHero masthead, brand logo and philosophical display H1", async ({ page }) => {
    await gotoHydrated(page, "/");

    const masthead = page.locator(".home-masthead");
    await expect(masthead).toBeVisible();
    await expect(masthead.locator(".home-brand")).toContainText("عقل في صندوق");

    const eyebrow = page.locator(".home-eyebrow").first();
    await expect(eyebrow).toContainText("مساحة هادئة. أسئلة كبيرة.");

    const heading = page.locator("h1#home-heading");
    await expect(heading).toBeVisible();
    await expect(heading).toHaveAttribute("aria-label", "عقل في صندوق");
  });

  test("T1.2.2: Philosopher lenses interactive selection updates portal and caption", async ({ page }) => {
    await gotoHydrated(page, "/");

    const lenses = page.locator(".home-lenses button");
    const count = await lenses.count();
    expect(count).toBeGreaterThanOrEqual(4);

    // Select first lens (Plato)
    const firstLens = lenses.first();
    await firstLens.click();
    await expect(firstLens).toHaveAttribute("aria-pressed", "true");

    // Caption updates politely
    const caption = page.locator(".home-art-caption");
    await expect(caption).toBeVisible();
    await expect(caption).not.toBeEmpty();

    // Portal artwork renders responsive picture
    const portalPic = page.locator(".home-portal-artwork picture");
    await expect(portalPic).toBeVisible();
    const portalImg = portalPic.locator("img");
    await expect(portalImg).toBeVisible();
  });

  test("T1.2.3: Three practices editorial cards render numbered links (01, 02, 03)", async ({ page }) => {
    await gotoHydrated(page, "/");

    const practices = page.locator(".home-practices a.home-practice");
    await expect(practices).toHaveCount(3);

    const hrefs = await practices.evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    expect(hrefs).toEqual(["/wisdom", "/dialogue", "/journal"]);

    await expect(practices.nth(0).locator(".home-practice-number")).toHaveText("01");
    await expect(practices.nth(1).locator(".home-practice-number")).toHaveText("02");
    await expect(practices.nth(2).locator(".home-practice-number")).toHaveText("03");
  });

  test("T1.2.4: Reading Table exercise in choosing populates question composer", async ({ page }) => {
    await gotoHydrated(page, "/");

    const readingTable = page.locator(".reading-table");
    await expect(readingTable).toBeVisible();
    await expect(readingTable.locator("h2#reading-table-title")).toHaveText("تمرين في فنّ الاختيار");

    const cards = readingTable.locator(".reading-cards button");
    await expect(cards).toHaveCount(3);

    // Click second card ("اختبر افتراضك")
    await cards.nth(1).click();

    // Verify textarea is populated with the prompt
    const textarea = page.locator("#hero-q");
    const val = await textarea.inputValue();
    expect(val).toContain("ما الدليل الذي قد يجعلني أغيّر رأيي");

    // Textarea should receive focus
    const isFocused = await page.evaluate(() => document.activeElement?.id === "hero-q");
    expect(isFocused).toBe(true);
  });

  test("T1.2.5: Argument Lab (ArgumentGame) interactive 3-round logic and feedback", async ({ page }) => {
    await gotoHydrated(page, "/");

    const game = page.locator(".argument-game");
    await expect(game).toBeVisible();
    await expect(game.locator("#argument-title")).toHaveText("أيّ سؤال يختبر الفكرة؟");

    // Round 1 claim should be visible
    await expect(game.locator("blockquote")).toBeVisible();

    const choices = game.locator(".argument-choices button");
    await expect(choices).toHaveCount(2);

    // Click a choice
    await choices.nth(0).click();

    // Status feedback is displayed with philosophical reason
    const status = game.locator('div[role="status"]');
    await expect(status).toBeVisible();
    await expect(status).not.toBeEmpty();

    // Next round button appears
    const nextBtn = game.locator("button.home-primary", { hasText: /الجولة التالية|Next round/ });
    await expect(nextBtn).toBeVisible();
  });

  test("T1.2.6: Portrait screening video gallery with posters and accessible captions", async ({ page }) => {
    await gotoHydrated(page, "/");

    const screening = page.locator("details.portrait-screening");
    await expect(screening).toBeVisible();

    const summary = screening.locator("summary");
    await expect(summary).toContainText("معرض الوجوه · فيلمان قصيران");

    // Open screening details
    await summary.click();

    const films = screening.locator(".portrait-films figure");
    await expect(films).toHaveCount(2);

    const firstVideo = films.first().locator("video");
    await expect(firstVideo).toBeVisible();
    await expect(firstVideo).toHaveAttribute("controls", "");
    await expect(firstVideo).toHaveAttribute("poster", /\/images\/philosophers\/.*\.webp/);
  });
});

test.describe("Tier 1: Primary Area 3 — All 11 Primary Pages Coverage", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("T1.3.1: Core intelligence pages render #main and essential landmarks (/wisdom, /dialogue, /journal, /tracker)", async ({ page }) => {
    // 1. /wisdom
    await gotoHydrated(page, "/wisdom");
    await expect(page.locator("#main")).toBeVisible();
    const pickerTrigger = page.locator("button:has-text('غيّر الحكيم'), button:has-text('اختر فيلسوفك')");
    if (await pickerTrigger.isVisible()) {
      await pickerTrigger.click();
    }
    const radiogroup = page.locator('[role="group"][aria-label="اختر فيلسوفك"], [role="radiogroup"][aria-label="اختر فيلسوفك"], [aria-label="اختر فيلسوفك"]');
    if (await radiogroup.count() > 0) {
      await expect(radiogroup.first()).toBeVisible();
    } else {
      await expect(page.locator("#wisdom-input")).toBeVisible();
    }

    // 2. /dialogue
    await gotoHydrated(page, "/dialogue");
    await expect(page.locator("#main")).toBeVisible();
    await expect(page).toHaveTitle(/الحوار/);
    await expect(page.locator('#dialogue-question, textarea[aria-label="سؤالك"]')).toBeVisible();

    // 3. /journal
    await gotoHydrated(page, "/journal");
    await expect(page.locator("#main")).toBeVisible();
    await expect(page).toHaveTitle(/المفكرة/);

    // 4. /tracker
    await gotoHydrated(page, "/tracker");
    await expect(page.locator("#main")).toBeVisible();
    await expect(page).toHaveTitle(/متتبع الوعي/);
  });

  test("T1.3.2: Contemplation and guidance pages render #main and features (/quotes, /paths)", async ({ page }) => {
    // 5. /quotes
    await gotoHydrated(page, "/quotes");
    await expect(page.locator("#main")).toBeVisible();
    await expect(page).toHaveTitle(/اقتباسات/);
    await expect(page.locator("button:has-text('ذهبي-أسود'), button:has-text('ورقي')").first()).toBeVisible();

    // 6. /paths
    await gotoHydrated(page, "/paths");
    await expect(page.locator("#main")).toBeVisible();
    await expect(page).toHaveTitle(/المسارات/);
    await expect(page.locator("h1:has-text('المسارات')")).toBeVisible();
    await expect(page.locator("a[href='/oracle']").first()).toBeVisible();
    await expect(page.locator("a[href='/sanctum']").first()).toBeVisible();
  });

  test("T1.3.3: Commerce and member chamber pages render #main and tiers (/pricing, /oracle, /sanctum)", async ({ page }) => {
    // 7. /pricing
    await gotoHydrated(page, "/pricing");
    await expect(page.locator("#main")).toBeVisible();
    await expect(page).toHaveTitle(/العضويات/);
    await expect(page.locator("h1, h2").filter({ hasText: /الزائر|العرّاف|المحراب/ }).first()).toBeVisible();

    // 8. /oracle
    await gotoHydrated(page, "/oracle");
    await expect(page.locator("#main")).toBeVisible();
    await expect(page).toHaveTitle(/العرّاف/);

    // 9. /sanctum
    await gotoHydrated(page, "/sanctum");
    await expect(page.locator("#main")).toBeVisible();
    await expect(page).toHaveTitle(/المحراب/);
  });

  test("T1.3.4: Gateway and identity pages render #main and account actions (/enter, /account)", async ({ page }) => {
    // 10. /enter
    await gotoHydrated(page, "/enter");
    await expect(page.locator("#main")).toBeVisible();
    await expect(page).toHaveTitle(/المدخل/);

    // 11. /account
    await gotoHydrated(page, "/account");
    await expect(page.locator("#main")).toBeVisible();
    await expect(page).toHaveTitle(/الحساب/);
  });

  test("T1.3.5: Zero broken images across all 11 primary pages and landing page", async ({ page }) => {
    const pagesToCheck = ["/", ...PRIMARY_11_ROUTES];
    for (const route of pagesToCheck) {
      await gotoHydrated(page, route);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const brokenImages = await page.evaluate(async () => {
        const imgs = Array.from(document.querySelectorAll("img"));
        await Promise.all(
          imgs.map((img) => {
            if (img.complete) return Promise.resolve();
            return new Promise((resolve) => {
              img.addEventListener("load", () => resolve(true), { once: true });
              img.addEventListener("error", () => resolve(false), { once: true });
              setTimeout(resolve, 3000);
            });
          })
        );
        return imgs
          .filter((img) => img.complete && img.naturalWidth === 0)
          .map((img) => img.src);
      });
      expect(brokenImages, `Broken images on ${route}`).toEqual([]);
    }
  });
});

// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES
// ============================================================================

test.describe("Tier 2: Boundary & Corner Cases", () => {
  test("T2.1: Mobile viewports (390px iPhone & 430px iPhone Pro Max) have zero horizontal scroll", async ({ page }) => {
    for (const width of [390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      for (const route of ["/", "/wisdom", "/dialogue", "/journal", "/pricing"]) {
        await gotoHydrated(page, route);
        const overflow = await page.evaluate(() => {
          const de = document.documentElement;
          return de.scrollWidth - de.clientWidth;
        });
        expect(overflow, `Overflow on ${route} at ${width}px`).toBeLessThanOrEqual(1);
      }
    }
  });

  test("T2.2: Ultra-wide desktop viewports (1440px & 1920px) maintain structural layout bounds", async ({ page }) => {
    for (const width of [1440, 1920]) {
      await page.setViewportSize({ width, height: 1080 });
      await gotoHydrated(page, "/");
      const heroWidth = await page.locator(".home-hero").evaluate((el) => el.clientWidth);
      expect(heroWidth).toBeLessThanOrEqual(width);

      await gotoHydrated(page, "/pricing");
      const mainWidth = await page.locator("#main").evaluate((el) => el.clientWidth);
      expect(mainWidth).toBeLessThanOrEqual(width);
    }
  });

  test("T2.3: Theme toggle (Luminous Obsidian vs Modern Parchment) and storage persistence", async ({ page }) => {
    await gotoHydrated(page, "/pricing");

    // Initially dark
    const initialTheme = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(initialTheme).toBe("dark");

    // Toggle theme button
    const themeBtn = page.locator(".appearance-controls button").nth(1);
    await themeBtn.click();

    // Should become light
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe("light");

    // Verify localStorage persistence
    const storedTheme = await page.evaluate(
      () => localStorage.getItem("miab-theme") || localStorage.getItem("mindinbox-theme")
    );
    expect(storedTheme).toBe("light");

    // Reload page — theme must persist as light
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");
    const reloadedTheme = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(reloadedTheme).toBe("light");
  });

  test("T2.4: RTL layout direction and Arabic typography rendering parity", async ({ page }) => {
    await gotoHydrated(page, "/");

    const htmlAttrs = await page.evaluate(() => ({
      dir: document.documentElement.dir,
      lang: document.documentElement.lang,
    }));
    expect(htmlAttrs.dir).toBe("rtl");
    expect(htmlAttrs.lang).toBe("ar");

    // Font stack check
    const headingFont = await page.locator("h1#home-heading").evaluate((el) => {
      return window.getComputedStyle(el).fontFamily;
    });
    expect(headingFont).toMatch(/Amiri|IBM Plex Sans Arabic|sans-serif/i);
  });

  test("T2.5: Resilient keyboard shortcuts and visible focus rings", async ({ page }) => {
    await gotoHydrated(page, "/pricing");

    // Language toggle shortcut Ctrl+Shift+L
    const initialLang = await page.evaluate(() => document.documentElement.lang);
    await page.keyboard.press("Control+Shift+L");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.lang))
      .not.toBe(initialLang);

    // Visible focus ring on tabbed interactive element
    await page.keyboard.press("Tab");
    const hasFocusIndicator = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return false;
      const s = window.getComputedStyle(el);
      return (
        (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) ||
        (s.boxShadow !== "none" && s.boxShadow !== "")
      );
    });
    expect(hasFocusIndicator).toBe(true);
  });
});

// ============================================================================
// TIER 3: CROSS-FEATURE INTERACTIONS
// ============================================================================

test.describe("Tier 3: Cross-Feature Interactions", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("T3.1: Cross-route navigation maintains state and theme selection", async ({ page }) => {
    await gotoHydrated(page, "/wisdom");

    // Switch to light theme
    const themeBtn = page.locator(".appearance-controls button").nth(1);
    await themeBtn.click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe("light");

    // Navigate to /journal via header
    const journalLink = page.locator("header.studio-header nav a[href='/journal']");
    await journalLink.click();
    await page.waitForURL(/\/journal$/);
    await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");

    // Light theme must still be preserved
    const themeOnJournal = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(themeOnJournal).toBe("light");

    // Active state aria-current="page" on header link
    await expect(page.locator("header.studio-header nav a[href='/journal']")).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  test("T3.2: AI dialogue turn sequence and visitor quota preservation", async ({ page }) => {
    await gotoHydrated(page, "/dialogue");

    // Direct check of API round cap to ensure server-side quota boundary
    const response = await page.evaluate(async () => {
      const res = await fetch("/api/dialogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "round",
          question: "ما هو أصل العدالة؟",
          personas: ["plato", "rumi"],
          transcript: [],
          round: 1,
        }),
      });
      return { status: res.status, body: await res.text() };
    });

    expect(response.status).toBe(200);
    // Guest gets turn events and terminates with preview_end
    expect(response.body).toContain("turn_start");
    expect(response.body).toContain("preview_end");
  });

  test("T3.3: Home page lens selection deep-links into /wisdom with pre-filled query", async ({ page }) => {
    await gotoHydrated(page, "/");

    // Fill question in home hero
    await page.locator("#hero-q").fill("ما هي فضيلة الصمت؟");

    // Select second lens
    const lensBtns = page.locator(".home-lenses button");
    await lensBtns.nth(1).click();

    // Click submit "ابدأ التأمل"
    const submitBtn = page.locator("button.home-primary", { hasText: /ابدأ التأمل|Start reflecting/ });
    await submitBtn.click();

    // Should navigate to /wisdom (or /enter if guest gate triggers)
    await page.waitForURL(/\/(wisdom|enter)\?/);
    expect(page.url()).toContain("philosopher=");
  });

  test("T3.4: Quotes card template customization and favorites toggle interaction", async ({ page }) => {
    await gotoHydrated(page, "/quotes");

    // Toggle template button
    const parchmentBtn = page.locator("button:has-text('ورقي'), button:has-text('Parchment')").first();
    if (await parchmentBtn.isVisible()) {
      await parchmentBtn.click();
      await expect(parchmentBtn).toHaveAttribute("aria-pressed", "true");
    }

    // Toggle favorite on first quote
    const quoteCards = page.locator("li[data-quote-id]");
    if ((await quoteCards.count()) > 0) {
      const favBtn = quoteCards.first().locator("button").first();
      await favBtn.click();
      await expect(favBtn).toHaveText(/في المفضّلة/);
    }
  });
});

// ============================================================================
// TIER 4: REAL-WORLD SANCTUARY WORKFLOWS
// ============================================================================

test.describe("Tier 4: Real-World Sanctuary Workflows", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("T4.1: Comprehensive End-to-End Pilgrim Sanctuary Journey", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));

    // Step 1: Land on Home Page and interact with Reading Table
    await gotoHydrated(page, "/");
    await expect(page.locator("h1#home-heading")).toBeVisible();
    const readingCard = page.locator(".reading-cards button").first();
    await readingCard.click();
    await expect(page.locator("#hero-q")).not.toBeEmpty();

    // Step 2: Transition into Wisdom Chat Sanctuary
    await gotoHydrated(page, "/wisdom");
    await expect(page.locator("#main")).toBeVisible();
    const wisdomInput = page.locator("#wisdom-input");
    if (!(await wisdomInput.isVisible())) {
      const promptBtn = page.locator("ul li button").first();
      if (await promptBtn.isVisible()) {
        await promptBtn.click();
      }
    }
    await expect(page.locator("#wisdom-input")).toBeVisible();

    // Step 3: Transition to Quotes Sanctuary
    await gotoHydrated(page, "/quotes");
    await expect(page.locator("#main")).toBeVisible();
    await expect(page.locator("li[data-quote-id]").first()).toBeVisible();

    // Step 4: Transition to Pricing Sanctuary
    await gotoHydrated(page, "/pricing");
    await expect(page.locator("#main")).toBeVisible();
    await expect(page.locator("text=الزائر").first()).toBeVisible();
    await expect(page.locator("text=العرّاف").first()).toBeVisible();
    await expect(page.locator("text=المحراب").first()).toBeVisible();

    // Step 5: Transition to Account Sanctuary
    await gotoHydrated(page, "/account");
    await expect(page.locator("#main")).toBeVisible();

    // Clean execution check — ignore known harmless Firebase unconfigured notices
    const unexpectedErrors = consoleErrors.filter(
      (e) => !/Firebase|firebase|not configured|مُهيأ|مهيأ/i.test(e)
    );
    expect(unexpectedErrors, "Zero unexpected console errors during sanctuary pilgrim journey").toEqual([]);
  });

  test("T4.2: Visitor to Member Gateway Exploration Flow", async ({ page }) => {
    await gotoHydrated(page, "/enter");
    await expect(page.locator("#main")).toBeVisible();

    // Guest continuation button or tab
    const guestAction = page.locator("button, a").filter({ hasText: /متابعة كزائر|تابع كزائر|زائر|Guest/ }).first();
    if (await guestAction.isVisible()) {
      await expect(guestAction).toBeEnabled();
    }
  });
});
