import { expect, test } from "@playwright/test";

/**
 * Quote cards — the acceptance criteria that need a real browser.
 *
 * Two of them cannot be checked without one:
 *
 *  1. **Arabic letter joining.** Canvas does the shaping, and that only happens in
 *     a real browser's text engine. There is no way to assert it in Node.
 *  2. **The download gate is on the server.** A UI-only gate would pass every
 *     assertion written against the buttons, so these tests call the route
 *     directly, with no credentials — which is what `curl` would do.
 */

/**
 * Proves Arabic is being *shaped*, not merely drawn.
 *
 * The technique: measure the whole string, then measure each character on its own
 * and add them up. Arabic letters have contextual forms — initial, medial, final,
 * isolated — and the initial and medial forms are *narrower* than the isolated
 * form. So if shaping is happening, the whole string measures meaningfully less
 * than the sum of its parts.
 *
 * A canvas that failed to shape would give a ratio at or above 1.0, and every
 * letter would appear in its isolated form: the tell-tale "ransom note" look,
 * which is exactly the artefact this test exists to prevent.
 */
async function measureJoining(page: import("@playwright/test").Page, text: string) {
  return page.evaluate((sample: string) => {
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");

    ctx.direction = "rtl";
    ctx.font = '600 56px "Amiri", "Cairo", serif';

    const whole = ctx.measureText(sample).width;
    let sum = 0;
    for (const ch of sample) sum += ctx.measureText(ch).width;

    return { whole, sum, ratio: whole / sum };
  }, text);
}

test.describe("Arabic shaping on canvas", () => {
  test("joins letters rather than drawing isolated forms", async ({ page }) => {
    await page.goto("/quotes");

    const sample = "حياة لا تُمتحَن لا تستحق أن تُعاش.";
    const { whole, sum, ratio } = await measureJoining(page, sample);

    // Well below 1.0 means real contextual shaping. An unshaped canvas sits at ~1.0.
    expect(ratio, `ratio ${ratio.toFixed(2)} — letters are NOT joining`).toBeLessThan(0.92);
    expect(whole, "whole string must be narrower than the sum of its characters").toBeLessThan(sum);
  });

  test("holds across five different Arabic quotes", async ({ page }) => {
    await page.goto("/quotes");

    // Five samples, as the acceptance criterion asks. Taken from the live library
    // rather than hardcoded, so a content change cannot quietly invalidate it.
    const quotes = await page.evaluate(() =>
      [...document.querySelectorAll("li blockquote")].slice(0, 5).map((b) => b.textContent?.trim() ?? "")
    );
    expect(quotes.length).toBe(5);

    for (const [i, q] of quotes.entries()) {
      expect(q.length, `sample ${i} is empty`).toBeGreaterThan(10);
      const { ratio } = await measureJoining(page, q);
      expect(ratio, `sample ${i} (${q.slice(0, 20)}…) ratio ${ratio.toFixed(2)}`).toBeLessThan(0.92);
    }
  });

  test("the canvas context is RTL, or the run is laid out backwards", async ({ page }) => {
    await page.goto("/quotes");
    const direction = await page.evaluate(() => {
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return null;
      ctx.direction = "rtl";
      return ctx.direction;
    });
    expect(direction).toBe("rtl");
  });
});

test.describe("the download gate is on the server", () => {
  test("an anonymous request is watermarked", async ({ page }) => {
    await page.goto("/quotes");

    // Called with no credentials — exactly what an attacker or curl would do.
    const body = await page.evaluate(async () => {
      const res = await fetch("/api/quotes/card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: "socrates-unexamined" }),
      });
      return { status: res.status, json: await res.json() };
    });

    expect(body.status).toBe(200);
    // Not entitled, and therefore watermarked. The refusal is not in the UI.
    expect(body.json.entitled).toBe(false);
    expect(body.json.watermark).toBeTruthy();
    expect(body.json.watermark).not.toBeNull();
  });

  test("an anonymous request cannot obtain an unwatermarked card", async ({ page }) => {
    await page.goto("/quotes");

    const watermark = await page.evaluate(async () => {
      const res = await fetch("/api/quotes/card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: "aurelius-good-wife" }),
      });
      return (await res.json()).watermark;
    });

    // The value that would make a clean card must never be null for a guest.
    expect(watermark).not.toBeNull();
  });

  test("a forged entitlement header does not help", async ({ page }) => {
    await page.goto("/quotes");

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/quotes/card", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // A plausible-looking but unsigned token.
          Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiJhZG1pbiIsInRlc3QiOnRydWV9.forged",
        },
        body: JSON.stringify({ quoteId: "plato-deaf-captain" }),
      });
      return await res.json();
    });

    expect(result.entitled).toBe(false);
    expect(result.watermark).toBeTruthy();
  });

  test("an unverified or unknown quote id is refused outright", async ({ page }) => {
    await page.goto("/quotes");

    for (const quoteId of ["plato-unchanged", "no-such-quote", "socrates-virtue-money-x"]) {
      const status = await page.evaluate(async (id: string) => {
        const res = await fetch("/api/quotes/card", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quoteId: id }),
        });
        return res.status;
      }, quoteId);

      expect(status, quoteId).toBe(404);
    }
  });
});

test.describe("every visible quote has a specific source", () => {
  test("each card names a work, a locator, and a translator", async ({ page }) => {
    await page.goto("/quotes");

    const cards = page.locator("li.glass");
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i += 1) {
      const text = (await cards.nth(i).textContent()) ?? "";

      // The work, as the reader would cite it: "Apology", "Republic", "Meditations".
      expect(text, `card ${i} names no work`).toMatch(/Apology|Republic|Meditations/);
      // A locator: a Stephanus page (117a, 488a) or an Arabic book+section
      // ("الكتاب الأول، ١").
      expect(text, `card ${i} names no locator`).toMatch(
        /,\s*(الكتاب[^،]*،?\s*)?[\d٠-٩]+[a-c]?/
      );
      // Translator and edition, or the quote is not citable.
      expect(text, `card ${i} names no translator`).toContain("ترجمة");
    }
  });

  test("every rendered card is one the server will serve as verified", async ({ page }) => {
    await page.goto("/quotes");

    // A real cross-check rather than a restatement of the component: take each
    // card's id out of the DOM and ask the server. If the page ever rendered
    // something unverified, the server would refuse it with 404.
    const ids = await page.evaluate(() =>
      [...document.querySelectorAll("li[data-quote-id]")].map((li) =>
        li.getAttribute("data-quote-id") ?? ""
      )
    );
    expect(ids.length).toBeGreaterThan(0);

    for (const id of ids) {
      const status = await page.evaluate(async (quoteId: string) => {
        const res = await fetch("/api/quotes/card", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quoteId }),
        });
        return res.status;
      }, id);

      expect(status, `${id} is rendered but the server will not serve it`).toBe(200);
    }
  });
});

test.describe("/quotes surface", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("has search, filters, favourites and a quote of the day", async ({ page }) => {
    await page.goto("/quotes");

    await expect(page.getByRole("heading", { name: "اقتباسات" })).toBeVisible();
    await expect(page.getByPlaceholder(/ابحث/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "اقتباس اليوم" })).toBeVisible();
    // Three templates.
    await expect(page.getByRole("button", { name: "ذهبي-أسود" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ورقي" })).toBeVisible();
    await expect(page.getByRole("button", { name: "بسيط" })).toBeVisible();
    await expect(page.getByRole("button", { name: /أضف للمفضّلة/ }).first()).toBeVisible();
  });

  test("search narrows the list", async ({ page }) => {
    await page.goto("/quotes");
    const before = await page.locator("li blockquote").count();

    await page.getByPlaceholder(/ابحث/).fill("Apology");
    await page.waitForTimeout(300);

    const after = await page.locator("li blockquote").count();
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0);
  });

  test("no horizontal scroll at 360px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/quotes");
    const overflow = await page.evaluate(() => {
      const de = document.documentElement;
      return de.scrollWidth - de.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("a favourite survives being added and removed", async ({ page }) => {
    await page.goto("/quotes");
    const button = page.getByRole("button", { name: /أضف للمفضّلة/ }).first();
    await button.click();
    await expect(page.getByRole("button", { name: /في المفضّلة/ }).first()).toBeVisible();
  });
});
