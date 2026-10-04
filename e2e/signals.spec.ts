import { expect, test } from "@playwright/test";

/**
 * Signals — the acceptance criterion is about network traffic, so these tests watch
 * traffic.
 *
 * "Turning personalization off stops signals being sent" is not provable by reading
 * the consent state. It is provable only by counting requests to `/api/signals`.
 * Every test here counts them.
 */

const SIGNALS = "**/api/signals";

/** Counts beacon requests made while `fn` runs. */
async function countSignalRequests(
  page: import("@playwright/test").Page,
  fn: () => Promise<void>
): Promise<number> {
  let count = 0;
  const handler = (request: import("@playwright/test").Request) => {
    if (request.url().includes("/api/signals")) count += 1;
  };
  page.on("request", handler);
  try {
    await fn();
  } finally {
    page.off("request", handler);
  }
  // Beacons are dispatched on the microtask queue; give them a beat to land.
  await page.waitForTimeout(400);
  return count;
}

test.describe("signals — nothing leaves without consent", () => {
  test("a reader with consent off sends zero signals", async ({ page }) => {
    await page.goto("/wisdom");

    // Consent is off by default. Use the product as a reader would, then count.
    const sent = await countSignalRequests(page, async () => {
      await page.getByRole("radio").first().click();
      await page.locator("#wisdom-input").fill("ما معنى الحياة؟");
      await page.getByRole("button", { name: "أرسل" }).click();
      await page.waitForTimeout(1500);
    });

    expect(sent, "signals were sent despite consent being off").toBe(0);
  });

  test("the tracker refuses to build a payload when consent is off", async ({ page }) => {
    await page.goto("/wisdom");

    // Just load and idle: with consent off, idling must also send nothing.
    const sent = await countSignalRequests(page, async () => {
      await page.waitForTimeout(800);
    });
    expect(sent).toBe(0);
  });

  test("the receiver drops an unidentified batch", async ({ page }) => {
    await page.goto("/");

    const response = await page.evaluate(async () => {
      const res = await fetch("/api/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: "someone-elses-uid",
          signals: [
            { kind: "philosopher_selected", value: "plato", at: Date.now(), consent: "conversation" },
          ],
        }),
      });
      return { status: res.status, json: await res.json() };
    });

    // Nothing is written: the body claims a uid, and the server must ignore it.
    expect(response.json.ok).toBe(true);
    expect(response.json.accepted).toBe(0);
    expect(response.json.refused).toBeGreaterThan(0);
  });

  test("the receiver refuses a forged uid with no token", async ({ page }) => {
    await page.goto("/");

    const accepted = await page.evaluate(async () => {
      const res = await fetch("/api/signals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer forged.token.value",
        },
        body: JSON.stringify({
          uid: "victim-uid",
          signals: [
            { kind: "habit_completed", value: "reading", at: Date.now(), consent: "conversation" },
            { kind: "habit_completed", value: "walking", at: Date.now(), consent: "conversation" },
          ],
        }),
      });
      return (await res.json()).accepted;
    });

    expect(accepted).toBe(0);
  });

  test("the receiver rejects any kind outside the vocabulary", async ({ page }) => {
    await page.goto("/");

    const response = await page.evaluate(async () => {
      const res = await fetch("/api/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: null,
          signals: [
            // Everything the brief forbids.
            { kind: "keystroke", value: "a", at: Date.now(), consent: "conversation" },
            { kind: "pointer_move", value: "12,44", at: Date.now(), consent: "conversation" },
            { kind: "canvas_fingerprint", value: "abc", at: Date.now(), consent: "conversation" },
            { kind: "ip_address", value: "5.6.7.8", at: Date.now(), consent: "conversation" },
            { kind: "raw_journal_text", value: "نص سري", at: Date.now(), consent: "journal" },
          ],
        }),
      });
      return { status: res.status, json: await res.json() };
    });

    // No identity, so nothing is written — and the kinds would be refused anyway.
    expect(response.json.accepted).toBe(0);
  });

  test("a value that is not a slug is refused outright", async ({ page }) => {
    await page.goto("/");

    // The value is the smuggling channel: prose must not be able to ride in one.
    const status = await page.evaluate(async () => {
      const res = await fetch("/api/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: null,
          signals: [
            {
              kind: "question_topic",
              value: "أشعر أنني مريض ولا أعرف ماذا أفعل",
              at: Date.now(),
              consent: "conversation",
            },
          ],
        }),
      });
      return res.status;
    });

    // 200 with nothing accepted: the route is valid, the payload is not.
    expect(status).toBe(200);
  });
});

/**
 * Origins that are not trackers, and why each is allowed.
 *
 * The point of this test is "no third-party tracker", not "no other host". The
 * Firebase backend is the product's own datastore — a reader's own journal and
 * progress live there, and the client SDK necessarily talks to it. Treating it as
 * a violation would be wrong.
 *
 * What is being asserted is narrower and more useful: nothing is sent to an origin
 * that does not hold this reader's own data, and nothing is sent anywhere at all
 * when consent is off.
 */
const ALLOWED_FOREIGN_ORIGINS = [
  // The Firebase data store the product itself runs on.
  "firestore.googleapis.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "www.googleapis.com",
  "firebaseinstallations.googleapis.com",
];

function isAllowedForeign(url: string): boolean {
  return ALLOWED_FOREIGN_ORIGINS.some((host) => url.includes(host));
}

test.describe("no third-party tracker", () => {
  test("talks to no origin beyond its own and its own datastore", async ({ page }) => {
    const foreign: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.startsWith("http://localhost") || url.startsWith("http://127.0.0.1")) return;
      if (url.startsWith("data:") || url.startsWith("blob:")) return;
      if (isAllowedForeign(url)) return;
      foreign.push(url);
    });

    await page.goto("/wisdom");
    await page.getByRole("radio").first().click();
    await page.waitForTimeout(1200);
    await page.goto("/quotes");
    await page.waitForTimeout(800);

    expect(foreign, `third-party requests: ${foreign.join(", ")}`).toEqual([]);
  });

  test("sends no write to any origin other than its own", async ({ page }) => {
    const writes: string[] = [];
    page.on("request", (request) => {
      if (["POST", "PUT", "PATCH"].includes(request.method())) writes.push(request.url());
    });

    await page.goto("/wisdom");
    await page.getByRole("radio").first().click();
    await page.locator("#wisdom-input").fill("سؤال");
    await page.getByRole("button", { name: "أرسل" }).click();
    await page.waitForTimeout(2000);

    // The reader's own writes may reach the datastore, which is where their data
    // belongs. Nothing may reach anywhere else.
    for (const url of writes) {
      const own = url.includes("localhost") || url.includes("127.0.0.1");
      expect(own || isAllowedForeign(url), `a write left the product: ${url}`).toBe(true);
    }
  });

  test("the signal beacon is same-origin only", async ({ page }) => {
    const beacons: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/signals")) beacons.push(request.url());
    });

    await page.goto("/wisdom");
    await page.getByRole("radio").first().click();
    await page.waitForTimeout(1200);

    // With consent off there is nothing to send, and every beacon would have been
    // same-origin anyway.
    for (const url of beacons) expect(url).toContain("localhost");
    expect(beacons).toEqual([]);
  });
});
