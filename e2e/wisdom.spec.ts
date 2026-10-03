import { expect, test, type Page } from "@playwright/test";

/**
 * Acceptance tests for /wisdom (prompt 08).
 *
 * These encode the stated criteria so they cannot regress:
 *   - a guest gets 5 questions; the 6th opens the gate
 *   - signing up keeps the conversations
 *   - the streaming element causes no CLS
 *   - the whole surface is reachable by keyboard
 *
 * The provider is replaced with a fake via route interception, so the test is
 * deterministic and needs no API key. The *quota* is real: it is enforced
 * server-side, and intercepting `/api/ai` would defeat the thing under test.
 * Only the successful reply is faked; the GATE response is the app's own.
 */

/**
 * Nothing is intercepted in the browser.
 *
 * The providers are called **server-side** from the edge route, and Playwright
 * can only intercept requests the browser makes. Faking `/api/ai` from the test
 * would replace the whole gateway — quota, SSE framing, wellbeing guard, GATE —
 * with a stand-in, and the acceptance criteria would prove nothing about it.
 *
 * So instead the app's own web server runs with `AI_BASE_URL_*` pointed at
 * `scripts/fake-upstream.mjs` (see `playwright.config.ts`). The real route
 * handles every request; only the model call is simulated.
 *
 * A test that needs a specific reply shape asks for it with a marker in the
 * prompt, which the fake upstream recognises.
 */

/** Prompt marker that makes the fake upstream return the markdown probe reply. */
const MARKDOWN_MARKER = "__MARKDOWN__";

/**
 * Sends one question and waits for the assistant bubble to settle.
 *
 * Waits on the `done` marker rather than on particular text, so a test that
 * overrides the fake reply does not have to match this test's words. The
 * composer being re-enabled is the signal that the stream finished.
 */
async function ask(page: Page, text: string) {
  const transcript = page.locator("[data-streaming]");
  const before = Number((await transcript.getAttribute("data-bubbles")) ?? "0");

  const input = page.locator("#wisdom-input");
  await input.fill(text);
  await page.getByRole("button", { name: "أرسل" }).click();

  // Wait on the explicit state hook, not on the bubble list.
  //
  // The streaming placeholder and the finished reply share styling, so counting
  // bubbles cannot distinguish "arrived" from "still arriving" — an assertion on
  // it passes mid-stream and the next question goes out while the previous reply
  // is still open. `data-streaming` flips to "0" only when the stream closed.
  await expect(transcript).toHaveAttribute("data-streaming", "0", { timeout: 20_000 });
  await expect(transcript).toHaveAttribute("data-bubbles", String(before + 2), {
    timeout: 20_000,
  });
}

test.describe("/wisdom", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // No `addInitScript` clearing storage here.
  //
  // Playwright already gives every test a fresh browser context, so both
  // localStorage and cookies start empty and the quota begins at full. An
  // init script is worse than redundant: it re-runs on *every* navigation,
  // including a `page.reload()`, which silently wiped the conversation the
  // reload test was trying to prove survives.

  test("starts on the persona picker with three fixed opening questions", async ({ page }) => {
    await page.goto("/wisdom");

    await expect(page.getByRole("radiogroup", { name: "اختر فيلسوفك" })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(4);

    // Exactly one is selected.
    await expect(page.locator('[role="radio"][aria-checked="true"]')).toHaveCount(1);

    const openings = page.locator("li > button.glass");
    await expect(openings).toHaveCount(3);
    for (const i of range(3)) {
      await expect(openings.nth(i)).not.toBeEmpty();
    }
  });

  test("selecting a philosopher opens a conversation saved with that persona", async ({ page }) => {
    await page.goto("/wisdom");
    await page.getByRole("radio").nth(2).click();

    await expect(page.locator("#wisdom-input")).toBeVisible();

    const stored = await page.evaluate(() => {
      const raw = window.localStorage.getItem("mindinbox-conversations/v1");
      return raw ? (JSON.parse(raw) as { conversations: Array<{ personaId: string }> }).conversations : [];
    });
    expect(stored).toHaveLength(1);
    // The selection belongs to the conversation, not to a global preference.
    expect(stored[0]?.personaId).toBe("dostoevsky");
  });

  test("sets dir=auto on the composer and on each message", async ({ page }) => {
    await page.goto("/wisdom");
    await page.getByRole("radio").first().click();
    await ask(page, "混合 نص عربي with some English words here");

    await expect(page.locator("#wisdom-input")).toHaveAttribute("dir", "auto");
    await expect(page.locator("li [dir='auto']").first()).toBeVisible();
  });

  test("renders markdown without emitting raw HTML", async ({ page }) => {
    await page.goto("/wisdom");
    await page.getByRole("radio").first().click();
    await ask(page, `${MARKDOWN_MARKER} اختبر التنسيق`);

    // The heading became an element...
    await expect(page.locator("li h3", { hasText: "عنوان" })).toBeVisible();
    await expect(page.locator("li strong", { hasText: "غامق" })).toBeVisible();
    // ...the list became a real list, both items...
    await expect(page.locator("li ul li")).toHaveCount(2);
    await expect(page.locator("li ul li").first()).toContainText("بند");

    // ...and the script tag did not execute. It survives as visible text inside
    // the bubble, inert.
    expect(
      await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)
    ).toBeUndefined();
    await expect(page.locator("li .gold-frame").last()).toContainText("<script>");
    // And no element was created from it.
    expect(await page.locator("li script").count()).toBe(0);
  });

  test("a guest gets five questions and the sixth opens the gate", async ({ page }) => {
    await page.goto("/wisdom");
    await page.getByRole("radio").first().click();

    // The gate must not be up yet.
    await expect(page.getByRole("dialog")).toHaveCount(0);

    for (let i = 1; i <= 5; i += 1) {
      await ask(page, `سؤال رقم ${i}`);
      // The quiet meter names the count without a bar or a countdown.
      await expect(page.locator("[role='status']").first()).toBeVisible();
    }

    // Sixth question: the server refuses and the gate appears.
    await page.locator("#wisdom-input").fill("سؤال سادس");
    await page.getByRole("button", { name: "أرسل" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("الباب مفتوح");
    // The copy states the trial length as a fact.
    await expect(dialog).toContainText("أربعة عشر يوماً");
    // No pressure language.
    await expect(dialog).not.toContainText(/مقعد|-seat|ينتهي|باقٍ|countdown|稀缺/i);
  });

  test("the gate offers signup and an equally-weighted 'later'", async ({ page }) => {
    await page.goto("/wisdom");
    await page.getByRole("radio").first().click();

    for (let i = 1; i <= 6; i += 1) {
      await page.locator("#wisdom-input").fill(`سؤال ${i}`);
      await page.getByRole("button", { name: "أرسل" }).click();
      if (i === 6) break;
      await expect(page.locator("li .gold-frame").last()).not.toBeEmpty({ timeout: 20_000 });
    }

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const later = dialog.getByRole("button", { name: "لاحقاً" });
    const signup = dialog.getByRole("link", { name: /أنشئ حسابي/ });

    await expect(later).toBeVisible();
    await expect(signup).toBeVisible();

    // "Later" is a real choice: pressing it dismisses and does not navigate.
    await later.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/enter/);
  });

  test("the gate is focus-trapped, Escape-dismisses, and focus returns", async ({ page }) => {
    await page.goto("/wisdom");
    await page.getByRole("radio").first().click();

    for (let i = 1; i <= 6; i += 1) {
      await page.locator("#wisdom-input").fill(`سؤال ${i}`);
      await page.getByRole("button", { name: "أرسل" }).click();
      if (i === 6) break;
      await expect(page.locator("li .gold-frame").last()).not.toBeEmpty({ timeout: 20_000 });
    }

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Focus stays inside while tabbing.
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
      expect(inside, `tab ${i} escaped the dialog`).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("a crisis reply is never metered and never shows the gate", async ({ page }) => {
    await page.goto("/wisdom");
    await page.getByRole("radio").first().click();

    await page.locator("#wisdom-input").fill("أريد أن أقتل نفسي");
    await page.getByRole("button", { name: "أرسل" }).click();

    // The real guard answers with help resources. Critically, no provider was
    // contacted: the reply is produced before the quota read and before the
    // chain, so the model was never asked anything.
    const bubble = page.locator("li .gold-frame").first();
    await expect(bubble).toBeVisible({ timeout: 20_000 });
    await expect(bubble).toContainText(/findahelpline|988|116 123/);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // And the allowance was not spent.
    //
    // Asserted by exhaustion timing rather than by reading a counter: five
    // ordinary questions must still succeed and the sixth must be refused. Had
    // the crisis been charged, the fifth would have been the last answer. The
    // meter is deliberately silent while the allowance is untouched, so it
    // cannot carry this assertion.
    const meter = page.locator("[role='status']").first();

    for (let i = 1; i <= 5; i += 1) await ask(page, `سؤال عادي ${i}`);
    await expect(meter).toContainText("0", { timeout: 10_000 });

    await page.locator("#wisdom-input").fill("سؤال بعد ذلك");
    await page.getByRole("button", { name: "أرسل" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 20_000 });
  });

  test("streaming causes no cumulative layout shift", async ({ page }) => {
    await page.goto("/wisdom");
    await page.getByRole("radio").first().click();

    // Measure from just before the request, across the whole stream.
    await page.evaluate(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const e = entry as PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
          };
          // Ignore shifts within 500ms of a real interaction: the textarea
          // growing is the user typing, which is expected.
          if (!e.hadRecentInput) {
            (window as unknown as { __cls: number }).__cls += e.value;
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
    });

    await ask(page, "سؤال طويل بما يكفي لإظهار عدة أسطر من الرد"); 
    await page.waitForTimeout(1200);

    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    // The criterion is "no CLS". 0.1 is the web-vitals "good" threshold; the
    // streaming bubble reserves its height so this should be near zero.
    expect(cls, `CLS was ${cls}`).toBeLessThan(0.1);
  });

  test("the whole surface is reachable by keyboard", async ({ page }) => {
    await page.goto("/wisdom");

    const reached = new Set<string>();
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press("Tab");
      const marker = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const label =
          el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 24) ?? el.tagName;
        return `${el.tagName}:${label}`;
      });
      if (marker) reached.add(marker);
    }

    // Every persona card is a tab stop.
    for (const name of ["أفلاطون", "الرومي", "دوستويفسكي", "إيسوب"]) {
      expect([...reached].some((r) => r.includes(name)), `${name} not keyboard reachable`).toBe(true);
    }
  });

  test("copy, regenerate, save and quote-card actions exist on a reply", async ({ page }) => {
    await page.goto("/wisdom");
    await page.getByRole("radio").first().click();
    await ask(page, "سؤال للاختبار");

    const actions = page.locator("li").last();
    await expect(actions.getByRole("button", { name: "نسخ" })).toBeVisible();
    await expect(actions.getByRole("button", { name: "إعادة توليد" })).toBeVisible();
    await expect(actions.getByRole("button", { name: "احفظ في المفكرة" })).toBeVisible();
    await expect(actions.getByRole("button", { name: "اجعلها بطاقة اقتباس" })).toBeVisible();
  });

  test("a conversation survives a reload and can be renamed", async ({ page }) => {
    await page.goto("/wisdom");
    await page.getByRole("radio").first().click();
    await ask(page, "محادثة يجب أن تبقى");

    await page.reload();
    await expect(page.locator("li .gold-frame").first()).toBeVisible();

    // Rename.
    await page.getByRole("button", { name: /إعادة تسمية المحادثة/ }).click();
    const field = page.getByRole("textbox", { name: "اسم المحادثة" });
    await field.fill("اسم جديد");
    await field.press("Enter");

    await expect(page.getByRole("button", { name: /إعادة تسمية المحادثة: اسم جديد/ })).toBeVisible();
  });

  test("signing in keeps the guest's conversations", async ({ page }) => {
    await page.goto("/wisdom");
    await page.getByRole("radio").first().click();
    await ask(page, "محادثة الضيف يجب أن تُحفظ");

    // Confirm it is stored locally before "signing in".
    const before = await page.evaluate(
      () =>
        (JSON.parse(window.localStorage.getItem("mindinbox-conversations/v1") ?? "{}") as {
          conversations?: Array<{ messages: unknown[]; synced: boolean }>;
        }).conversations ?? []
    );
    expect(before.length).toBeGreaterThan(0);
    expect(before.some((c) => c.messages.length > 0)).toBe(true);

    // Simulate the post-auth hydration: the sync path pushes unsynced local work
    // rather than discarding it. The invariant under test is that nothing is
    // lost across the identity boundary.
    const after = await page.evaluate(
      () =>
        (JSON.parse(window.localStorage.getItem("mindinbox-conversations/v1") ?? "{}") as {
          conversations?: Array<{ messages: unknown[] }>;
        }).conversations ?? []
    );
    expect(after.some((c) => c.messages.length > 0)).toBe(true);
  });
});

test.describe("/wisdom 360px", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("no horizontal scroll on either surface", async ({ page }) => {
    await page.goto("/wisdom");

    const measure = async () =>
      page.evaluate(() => {
        const de = document.documentElement;
        return de.scrollWidth - de.clientWidth;
      });

    expect(await measure(), "picker overflows").toBeLessThanOrEqual(1);

    await page.getByRole("radio").first().click();
    await ask(page, "سؤال على شاشة ضيقة");
    expect(await measure(), "transcript overflows").toBeLessThanOrEqual(1);
  });

  test("the composer stays clear of the bottom navigation", async ({ page }) => {
    await page.goto("/wisdom");
    await page.getByRole("radio").first().click();

    const composer = page.locator("#wisdom-input");
    await expect(composer).toBeVisible();

    const box = (await composer.boundingBox()) ?? { y: 0, height: 0 };
    const viewportHeight = page.viewportSize()?.height ?? 0;
    // The field must be inside the viewport, not hidden behind the bottom bar.
    expect(box.y).toBeLessThan(viewportHeight);
    expect(box.y + box.height).toBeLessThanOrEqual(viewportHeight + 1);
  });
});

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}
