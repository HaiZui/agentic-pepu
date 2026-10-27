import { expect, test } from "@playwright/test";

// Same values as src/dev/comic.ts (importing it here would pull CSS into the test runner).
const WORST_NAME = "Jääskeläinen-Äyräpäänsuu";
const WORST_LINE =
  "Kuulkaa nyt kaikki: minä, ylpeä talonpoika, vannon että tämä pullo on minun ennen kuin kukko laulaa, vaikka koko valtakunta nousisi vastaan!";

test("worst-case lettering fits every balloon without clipping", async ({ page }) => {
  await page.goto("/dev/comic?fixture=40&worst=1");
  await page.waitForFunction(() => (window as { __comicReady?: boolean }).__comicReady === true, null, { timeout: 60_000 });

  const stats = await page.evaluate(() => (window as unknown as { __comicStats: { pages: number; unfit: string[] } }).__comicStats);
  expect(stats.unfit).toEqual([]);
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
