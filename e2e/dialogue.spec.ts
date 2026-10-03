import { expect, test, type Page } from "@playwright/test";

/**
 * Acceptance tests for /dialogue.
 *
 * The stated criteria:
 *   - the dialogue gives three rounds and a summary
 *   - a non-subscriber sees a preview only
 *   - **the server decides** which of those applies
 *
 * The third is the one that needs care. Playwright cannot intercept a
 * server-side fetch, so these run against the real route with the providers
 * pointed at `scripts/fake-upstream.mjs` (see `playwright.config.ts`). The quota,
 * the entitlement check, the round cap and the SSE framing are all the app's own
 * code under test — nothing about the entitlement is stubbed.
 *
 * "The server decides" is asserted directly: a request for round 2 as a guest
 * gets `preview_end` and *no turns*, which a client-side cap could not produce
 * on its own.
 */

async function askDialogue(page: Page) {
  await page.getByLabel("سؤالك").fill("هل الحرّية ممكنة، أم أنها أثر سببي؟");
  await page.getByRole("radio").nth(0).click();
  // Assert before the second pick, so a regression points at the click that
  // caused it rather than at the final button.
  await expect(page.getByRole("button", { name: "ابدأ الحوار" })).toBeEnabled();
  await page.getByRole("radio").nth(3).click();
  await page.getByRole("button", { name: "ابدأ الحوار" }).click();
}

test.describe("/dialogue", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("asks for a question and two philosophers before anything else", async ({ page }) => {
    await page.goto("/dialogue");

    await expect(page.getByRole("heading", { name: "الحوار" })).toBeVisible();
    await expect(page.getByLabel("سؤالك")).toBeVisible();

    // Both are required, so the start button is inert until both are given.
    const start = page.getByRole("button", { name: "ابدأ الحوار" });
    await expect(start).toBeDisabled();

    // A question alone is not enough.
    await page.getByLabel("سؤالك").fill("سؤال");
    await expect(start).toBeDisabled();

    await page.getByRole("radio").first().click();
    await expect(start).toBeEnabled();
  });

  test("names both philosophers and refuses the same one twice", async ({ page }) => {
    await page.goto("/dialogue");
    await page.getByLabel("سؤالك").fill("هل الحرّية ممكنة؟");

    await page.getByRole("radio").nth(0).click();
    // Picking the already-chosen philosopher must move the other slot rather
    // than produce a dialogue with one participant.
    await page.getByRole("radio").nth(0).click();

    const summary = page.locator("p", { hasText: "⇄" });
    await expect(summary).toBeVisible();

    const shown = (await summary.textContent())?.trim() ?? "";
    const [left, right] = shown.split("⇄").map((s) => s.trim());
    expect(left).not.toBe(right);
  });

  test("a guest gets one round and an invitation, decided by the server", async ({ page }) => {
    await page.goto("/dialogue");

    // Capture the pair from the page rather than assuming it: picking slot 0
    // then slot 3 leaves a *different* philosopher in slot 1, so the pair is not
    // the two indices that were clicked.
    await page.getByLabel("سؤالك").fill("هل الحرّية ممكنة، أم أنها أثر سببي؟");
    await page.getByRole("radio").nth(0).click();
    await page.getByRole("radio").nth(3).click();

    const pairText = (await page.locator("p", { hasText: "⇄" }).textContent()) ?? "";
    const expected = pairText
      .split("⇄")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(expected, "the chosen pair must be readable on the page").toHaveLength(2);
    expect(expected[0]).not.toBe(expected[1]);

    await page.getByRole("button", { name: "ابدأ الحوار" }).click();

    // Exactly one round: two turns, one per philosopher, named as chosen.
    // `toContainText` plus an accessible-name check rather than `toHaveText`:
    // the heading also carries the persona's geometric mark, which is
    // `aria-hidden` and so absent from the accessible name. Both matter — the
    // mark is visible to a sighted reader, the name is what a screen reader says.
    const speakers = page.locator("article h2");
    await expect(speakers).toHaveCount(2, { timeout: 30_000 });
    for (const i of [0, 1]) {
      await expect(speakers.nth(i)).toContainText(expected[i] as string);
      await expect(speakers.nth(i)).toHaveAccessibleName(expected[i] as string);
    }

    // Both actually said something.
    for (const i of [0, 1]) {
      await expect(page.locator("article").nth(i)).not.toBeEmpty({ timeout: 30_000 });
    }

    // The invitation, not a wall.
    await expect(
      page.getByRole("heading", { name: "انتهت الجولة المجانية" })
    ).toBeVisible({ timeout: 30_000 });

    // No summary for a guest: the server did not ask for one.
    await expect(page.getByRole("heading", { name: "خلاصة" })).toHaveCount(0);

    // And the dismissal is a real choice, given equal weight.
    await expect(page.getByRole("button", { name: "اكتفِ بهذا" })).toBeVisible();
    await expect(page.getByRole("link", { name: /أنشئ حسابي/ })).toBeVisible();
  });

  test("the server refuses round 2 for a guest, whatever the client asks for", async ({ page }) => {
    await page.goto("/dialogue");

    // Ask the API directly, as a crafted client would. The entitlement is not
    // something the browser can assert.
    const response = await page.evaluate(async () => {
      const res = await fetch("/api/dialogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "round",
          question: "هل الحرّية ممكنة؟",
          personas: ["plato", "aesop"],
          transcript: [],
          round: 2,
        }),
      });
      const text = await res.text();
      return { status: res.status, body: text };
    });

    expect(response.status).toBe(200);

    const frames = response.body.split("\n\n").filter(Boolean);
    const events = frames
      .filter((f) => f.startsWith("data:") && !f.includes("[DONE]"))
      .map((f) => JSON.parse(f.slice(5).trim()) as { type: string });

    const types = events.map((e) => e.type);

    // The invitation arrives...
    expect(types).toContain("preview_end");
    // ...and crucially, no turns were generated. A client-side cap cannot
    // produce this; only the server refusing can.
    expect(types).not.toContain("turn_start");
    expect(types).not.toContain("turn_delta");
  });

  test("rejects the same philosopher twice at the API", async ({ page }) => {
    await page.goto("/dialogue");

    const response = await page.evaluate(async () => {
      const res = await fetch("/api/dialogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "round",
          question: "هل الحرّية ممكنة؟",
          personas: ["plato", "plato"],
          transcript: [],
          round: 1,
        }),
      });
      return { status: res.status, body: await res.text() };
    });

    expect(response.status).toBe(400);
    expect(response.body).toContain("مختلفين");
  });

  test("rejects an unknown persona", async ({ page }) => {
    await page.goto("/dialogue");

    const response = await page.evaluate(async () => {
      const res = await fetch("/api/dialogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "round",
          question: "هل الحرّية ممكنة؟",
          personas: ["kant", "aesop"],
          transcript: [],
          round: 1,
        }),
      });
      return res.status;
    });

    expect(response).toBe(400);
  });

  test("a crisis question is answered with help, free, and never as a debate", async ({ page }) => {
    await page.goto("/dialogue");

    const response = await page.evaluate(async () => {
      const res = await fetch("/api/dialogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "round",
          question: "أريد أن أقتل نفسي",
          personas: ["plato", "aesop"],
          transcript: [],
          round: 1,
        }),
      });
      return {
        status: res.status,
        wellbeing: res.headers.get("x-wellbeing"),
        quota: res.headers.get("x-quota"),
        body: await res.text(),
      };
    });

    // Before identity, before quota, before any provider.
    expect(response.wellbeing).toBeTruthy();
    expect(response.quota).toBe("not-charged");

    // No philosopher spoke. Help resources are not a philosophical position.
    expect(response.body).not.toContain("turn_start");
    expect(response.body).toMatch(/findahelpline|988|116 123/);
  });

  test("the whole surface is reachable by keyboard", async ({ page }) => {
    await page.goto("/dialogue");

    const reached = new Set<string>();
    for (let i = 0; i < 24; i += 1) {
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

    for (const name of ["أفلاطون", "الرومي", "دوستويفسكي", "إيسوب"]) {
      expect(
        [...reached].some((r) => r.includes(name)),
        `${name} not keyboard reachable`
      ).toBe(true);
    }
  });
});

test.describe("/dialogue 360px", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("no horizontal scroll on the setup or during a dialogue", async ({ page }) => {
    await page.goto("/dialogue");

    const measure = () =>
      page.evaluate(() => {
        const de = document.documentElement;
        return de.scrollWidth - de.clientWidth;
      });

    expect(await measure(), "setup overflows").toBeLessThanOrEqual(1);

    await askDialogue(page);
    await expect(page.getByRole("heading", { name: "انتهت الجولة المجانية" })).toBeVisible({
      timeout: 30_000,
    });

    expect(await measure(), "dialogue overflows").toBeLessThanOrEqual(1);
  });
});

test.describe("/dialogue rounds", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the server refuses every round past the guest's one, not just round 2", async ({ page }) => {
    await page.goto("/dialogue");

    // Every round beyond the preview cap, checked directly against the API. A cap
    // implemented as `round === 2` would pass a round-2 test and leak round 3.
    for (const round of [2, 3]) {
      const result = await page.evaluate(async (r: number) => {
        const res = await fetch("/api/dialogue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "round",
            question: "هل الحرّية ممكنة؟",
            personas: ["plato", "aesop"],
            transcript: [],
            round: r,
          }),
        });
        return { status: res.status, body: await res.text() };
      }, round);

      expect(result.status, `round ${round}`).toBe(200);
      expect(result.body, `round ${round}`).toContain("preview_end");
      expect(result.body, `round ${round}`).not.toContain("turn_start");
      expect(result.body, `round ${round}`).not.toContain("turn_delta");
    }
  });

  test("the server refuses a summary to a guest", async ({ page }) => {
    await page.goto("/dialogue");

    // Even with a transcript that looks finished. The transcript's length is not
    // evidence of a membership.
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/dialogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "summary",
          question: "هل الحرّية ممكنة؟",
          transcript: [
            { speaker: "أفلاطون", content: "المعنى أن يخرج من الكهف." },
            { speaker: "إيسوب", content: "ومن لا يخرج، يبقى في الظل." },
          ],
        }),
      });
      return { status: res.status, quota: res.headers.get("x-quota"), body: await res.text() };
    });

    // 402 is the quota refusal, not a summary. Either way, no summary text.
    expect(result.body).not.toContain("summary_delta");
  });

  test("the three-round path is asserted by policy, not by a fake identity", async ({ page }) => {
    // No member identity exists in this environment: there is no auth emulator
    // (no JRE) and no service account. Rather than stub the entitlement — which
    // would test the stub — the round count for members is asserted where it
    // lives, in `dialogue-policy.test.ts`, and here we assert only that the
    // guest path cannot reach it.
    await page.goto("/dialogue");
    await askDialogue(page);

    await expect(page.getByRole("heading", { name: "خلاصة" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "انتهت الجولة المجانية" })).toBeVisible({
      timeout: 30_000,
    });
  });
});
