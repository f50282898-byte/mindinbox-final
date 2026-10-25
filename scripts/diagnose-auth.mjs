import { chromium } from "@playwright/test";

const baseURL = process.env.AUTH_DIAGNOSTIC_URL || "http://127.0.0.1:3100";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: "ar-SA" });
const errors = [];
page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("requestfailed", (request) => {
  errors.push(`request: ${request.url()} (${request.failure()?.errorText || "failed"})`);
});

try {
  await page.goto(`${baseURL}/enter`, { waitUntil: "networkidle" });
  console.log(JSON.stringify({
    stage: "loaded",
    title: await page.title(),
    signInForm: await page.getByRole("tablist", { name: "طريقة الدخول" }).count(),
  }));

  await page.getByRole("button", { name: /كضيف/ }).click();
  await page.waitForTimeout(5000);
  const localUser = await page.evaluate(() => {
    const raw = localStorage.getItem("miab-local-user");
    if (!raw) return null;
    const value = JSON.parse(raw);
    return { localFallback: String(value.uid).startsWith("local-"), isAnonymous: value.isAnonymous };
  });
  console.log(JSON.stringify({
    stage: "guest",
    url: page.url(),
    localUser,
    alert: await page.getByRole("alert").allTextContents(),
  }));

  await page.goto(`${baseURL}/enter`, { waitUntil: "networkidle" });
  const signOut = page.getByRole("button", { name: "تسجيل الخروج" });
  if (await signOut.count()) await signOut.click();
  await page.goto(`${baseURL}/enter`, { waitUntil: "networkidle" });
  await page.locator("#auth-email").fill("nobody@example.com");
  await page.locator("#auth-password").fill("invalid-password");
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await page.waitForTimeout(3000);
  console.log(JSON.stringify({
    stage: "invalid-login",
    alert: await page.getByRole("alert").allTextContents(),
    url: page.url(),
  }));
  console.log(JSON.stringify({ errors }));
} finally {
  await browser.close();
}
