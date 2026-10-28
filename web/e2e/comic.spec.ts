import { expect, test } from "@playwright/test";

// Same values as src/dev/comic.ts (importing it here would pull CSS into the test runner).
const WORST_NAME = "Jääskeläinen-Äyräpäänsuu";
const WORST_LINE =
  "Kuulkaa nyt kaikki: minä, ylpeä talonpoika, vannon että tämä pullo on minun ennen kuin kukko laulaa, vaikka koko valtakunta nousisi vastaan!";

test("worst-case lettering fits every balloon without clipping", async ({ page }) => {
  await page.goto("/dev/comic?fixture=40&worst=1");
  await page.waitForFunction(() => (window as { __comicReady?: boolean }).__comicReady === true, null, { timeout: 60_000 });

  const stats = await page.evaluate(
    () => (window as unknown as { __comicStats: { pages: number; unfit: string[]; stampsMissing: string[] } }).__comicStats,
  );
  expect(stats.unfit).toEqual([]);
  // Same OUT / RETURNS words as the stage, and a survivor strip on every scene and montage page.
  expect(stats.stampsMissing).toEqual([]);
  const storyPages = page.locator('.page[data-kind="scenes"], .page[data-kind="montage"]');
  expect(await storyPages.count()).toBe(await page.locator('.page [data-testid="survivor-strip"]').count());
  const crowded = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.page[data-kind="montage"]')].filter((p) => {
      const grid = p.querySelector(".montage-grid")!.getBoundingClientRect();
      const strip = p.querySelector('[data-testid="survivor-strip"]')!.getBoundingClientRect();
      return grid.bottom > strip.top;
    }).map((p) => p.dataset.page),
  );
  expect(crowded).toEqual([]);
  expect(stats.pages).toBeGreaterThanOrEqual(16);
  expect(stats.pages).toBeLessThanOrEqual(32);

  const balloons = page.locator(".balloon", { hasText: WORST_LINE });
  expect(await balloons.count()).toBeGreaterThan(0);
  await expect(balloons.first().locator(".who")).toHaveText(WORST_NAME, { ignoreCase: true });

  const clipped = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".c-panel")].filter((panel) => {
      const box = panel.getBoundingClientRect();
      return [...panel.querySelectorAll<HTMLElement>(".balloon, .caption")].some((b) => {
        const r = b.getBoundingClientRect();
        return r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1;
      });
    }).map((p) => p.dataset.panel),
  );
  expect(clipped).toEqual([]);
});


test("the 15-peasant comic shows its stamps, a return and the survivor strips", async ({ page }) => {
  await page.goto("/dev/comic?fixture=15");
  await page.waitForFunction(() => (window as { __comicReady?: boolean }).__comicReady === true, null, { timeout: 60_000 });
  const stats = await page.evaluate(() => (window as unknown as { __comicStats: { unfit: string[]; stampsMissing: string[] } }).__comicStats);
  expect(stats.unfit).toEqual([]);
  expect(stats.stampsMissing).toEqual([]);
  await expect(page.locator(".c-stamp-return").first()).toContainText("RETURNS");
  await expect(page.locator(".c-montage-summary").first()).toBeVisible();
  await expect(page.locator(".c-montage-summary").first()).toContainText("are OUT");
  await expect(page.locator('[data-testid="survivor-strip"]').last()).toContainText("1 remains");
});
