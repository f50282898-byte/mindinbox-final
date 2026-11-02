import { expect, test } from "@playwright/test";

test("the reader controls film playback and can finish and restart the argument game", async ({ page }) => {
  const filmRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith(".webm")) filmRequests.push(request.url());
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "1");
  const gallery = page.locator(".portrait-screening");
  await expect(gallery).not.toHaveAttribute("open", "");
  expect(filmRequests).toHaveLength(0);

  const game = page.locator(".argument-game");
  for (const correct of [1, 0, 1]) {
    await game.locator(".argument-choices button").nth(correct).click();
    await expect(game.getByRole("status")).not.toBeEmpty();
    await game.locator(".home-primary").click();
  }
  await expect(game).toContainText("3 / 3");
  await game.locator(".home-primary").click();
  await expect(game.locator(".argument-choices button:enabled")).toHaveCount(2);

  await gallery.locator("summary").click();
  const films = gallery.locator("video");
  await expect(films).toHaveCount(2);
  for (const film of await films.all()) {
    await film.evaluate((video: HTMLVideoElement) => video.play());
    await expect.poll(() => film.evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(0);
    await film.evaluate((video: HTMLVideoElement) => video.pause());
  }
});
