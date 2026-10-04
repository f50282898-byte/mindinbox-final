import { expect, test } from "@playwright/test";

/**
 * The riddle — the acceptance criterion is a negative one.
 *
 * "Nothing in the client reveals an answer or the odds" cannot be proved by reading
 * the code. It is proved by fetching what a browser actually receives and asserting
 * the absence of the right strings. That is what these tests do, against the raw
 * response bodies rather than the rendered DOM.
 *
 * ## Why these do not sign in
 *
 * A signed-in e2e would need live Firebase credentials and a real Firestore, so it
 * would not run in CI. Everything below is provable without an identity, and it is
 * the half that matters: a reader who is not signed in must get nothing, and the
 * shipped document must not contain the game.
 */

/** Distinctive acceptance phrases. Three, one per philosopher, from the bank. */
const ANSWER_PHRASES = [
  "الأثر ينطبع في النفس",
  "العجز لا يعفيك",
  "داخل الإناء نفسه",
];

/** Distinctive resolution openings. */
const RESOLUTION_PHRASES = [
  "الأثر يخبر النفس",
  "أن تعرف الشر وتريد",
  "من يطلب الشيء من غير مموعه",
];

/** Anything that would publish the odds or the budget. */
const ODDS_PHRASES = [
  "probability",
  "dailyGrantCeiling",
  "monthlyGrantCeiling",
  "prizeDays",
  "ipDailyRolls",
  "cooldownDays",
];

/** The routes whose server-rendered HTML a reader receives without running JS. */
const PAGES = ["/", "/wisdom", "/dialogue", "/quotes", "/journal"];

test.describe("the client is told nothing about the game", () => {
  for (const path of PAGES) {
    test(`the initial HTML of ${path} names no answer`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status(), `${path} should render`).toBe(200);
      const html = await res.text();

      for (const phrase of ANSWER_PHRASES) {
        expect(html.includes(phrase), `${path} leaked "${phrase}"`).toBe(false);
      }
      for (const phrase of RESOLUTION_PHRASES) {
        expect(html.includes(phrase), `${path} leaked "${phrase}"`).toBe(false);
      }
      for (const phrase of ODDS_PHRASES) {
        expect(html.includes(phrase), `${path} leaked "${phrase}"`).toBe(false);
      }
    });
  }

  test("no page ships the golden token in its HTML", async ({ request }) => {
    // The token is inserted by a client-side effect, after the server has confirmed a
    // win. If the label is in the initial document, the feature has leaked upstream of
    // the draw.
    for (const path of PAGES) {
      const html = await (await request.get(path)).text();
      expect(html.includes("رمز غامض"), `${path} shipped the token`).toBe(false);
    }
  });

  test("no page ships the riddle prompt", async ({ request }) => {
    // The prompt only exists server-side until a token is redeemed.
    const html = await (await request.get("/wisdom")).text();
    expect(html.includes("رأيت الأشياء على الجدار")).toBe(false);
  });
});

test.describe("every riddle endpoint refuses an unidentified caller", () => {
  test("GET /api/riddle/roll is not readable", async ({ request }) => {
    // There is no GET. A readable roll endpoint would let anyone poll the odds.
    const res = await request.get("/api/riddle/roll");
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("POST /api/riddle/roll without a token is refused", async ({ request }) => {
    const res = await request.post("/api/riddle/roll");
    expect(res.status()).toBe(401);

    const body = await res.text();
    for (const phrase of ODDS_PHRASES) {
      expect(body.includes(phrase), `the 401 leaked "${phrase}"`).toBe(false);
    }
    expect(body.includes("0.004"), "the 401 leaked the default probability").toBe(false);
  });

  test("POST /api/riddle/open without a token is refused", async ({ request }) => {
    const res = await request.post("/api/riddle/open", {
      data: { token: "a.b.c", turnstileToken: "x" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/riddle/answer without a token is refused", async ({ request }) => {
    const res = await request.post("/api/riddle/answer", {
      data: { token: "a.b.c", answer: "الأثر ينطبع في النفس" },
    });
    expect(res.status()).toBe(401);
  });

  test("a forged win token is refused, and no riddle comes back", async ({ request }) => {
    // A syntactically plausible token with an attacker-chosen payload. Without a
    // valid signature it must fail, and the failure must not include the prompt.
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ uid: "attacker", sub: "attacker", philosopher: "plato", riddle: 1 })
    ).toString("base64url");

    const res = await request.post("/api/riddle/open", {
      data: { token: `${header}.${payload}.deadbeef`, turnstileToken: "x" },
    });

    expect(res.status()).toBeGreaterThanOrEqual(400);
    const body = await res.text();
    expect(body.includes("رأيت الأشياء على الجدار")).toBe(false);
  });
});

test.describe("the roll is not attempted for a reader with no identity", () => {
  test("an anonymous visitor triggers no roll request", async ({ page }) => {
    let rolls = 0;
    page.on("request", (r) => {
      if (r.url().includes("/api/riddle/roll")) rolls += 1;
    });

    await page.goto("/wisdom");
    await page.getByRole("radio").first().click();
    await page.locator("#wisdom-input").fill("ما معنى الحياة؟");
    await page.getByRole("button", { name: "أرسل" }).click();
    await page.waitForTimeout(1200);

    // Even if a request were made it would be refused. Asserting it is never made
    // catches the cheaper bug: a request that burns a roller's rate limit for nothing.
    expect(rolls, "an anonymous visitor caused a roll").toBe(0);
  });
});
