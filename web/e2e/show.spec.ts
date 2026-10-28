import { expect, test } from "@playwright/test";

interface FateCharacter {
  id: string;
  name: string;
  kind: string;
}

const ROSTER = ["Matti", "Aino", "Kalle", "Jääskeläinen", "Öhman", "Liisa"];

interface Storyline {
  beats: { index: number; announcements: { kind: string; headline: string; cause: string }[] }[];
}

interface StageWatch {
  stamps: string[];
  counts: string[];
  overlaps: string[];
}

/** Runs in the page: records stamps and tracker counts as they appear, and any bubble or caption under the tracker. */
function watchStage(): void {
  const watch: StageWatch = { stamps: [], counts: [], overlaps: [] };
  (window as unknown as { __stage: StageWatch }).__stage = watch;
  const seen = new WeakSet<Element>();
  const tick = () => {
    for (const stamp of document.querySelectorAll('[data-testid="stamp"]')) {
      if (seen.has(stamp)) continue;
      seen.add(stamp);
      const [headline, cause] = [".stamp-headline", ".stamp-cause"].map((c) => stamp.querySelector(c)?.textContent ?? "");
      watch.stamps.push(`${headline} | ${cause}`);
    }
    const count = document.querySelector('[data-testid="tracker-count"]')?.textContent;
    if (count && watch.counts.at(-1) !== count) watch.counts.push(count);
    const tracker = document.querySelector('[data-testid="tracker"]')?.getBoundingClientRect();
    if (tracker) {
      for (const box of document.querySelectorAll(".bubble, .caption-box, .panel-bubble, .panel-caption")) {
        const r = box.getBoundingClientRect();
        if (Number(getComputedStyle(box).opacity) < 0.5 || r.height === 0) continue;
        if (r.top < tracker.bottom - 1 && r.bottom > tracker.top && r.left < tracker.right && r.right > tracker.left) {
          watch.overlaps.push(`${box.className}: ${box.textContent?.slice(0, 40)}`);
        }
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

test("a six-peasant fallback show plays to the credits and crowns the fate winner", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const health = await (await request.get("/api/health")).json();
  expect(health.foundry, "the e2e server must run without Foundry").toEqual({ api_key: false, endpoint: false, deployment: false });

  const created = await request.post("/api/shows", { data: { participants: ROSTER, old_king: "Jukka" } });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  const fate = await (await request.get(`/api/shows/${id}/fate`)).json();
  const characters = fate.characters as FateCharacter[];
  const winner = characters.find((c) => c.id === fate.winner)!.name;
  const others = characters.filter((c) => c.kind === "participant" && c.id !== fate.winner).map((c) => c.name);

  const storyline = (await (await request.get(`/api/shows/${id}/storyline`)).json()) as Storyline;

  await page.addInitScript(watchStage);
  await page.goto(`/show/${id}?speed=10`);
  await page.getByTestId("start").click();
  await expect(page.getByTestId("seal").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("tracker")).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: test.info().outputPath("tracker.png") });

  await expect(page.getByTestId("crowned-name")).toHaveText(winner, { timeout: 150_000 });

  // Every exit was stamped with the storyline's words, the count ran down to one, and no bubble hid under the tracker.
  const seen = await page.evaluate(() => (window as unknown as { __stage: StageWatch }).__stage);
  const expected = storyline.beats
    .filter((b) => !b.announcements.some((a) => a.kind === "summary"))
    .flatMap((b) => b.announcements.map((a) => `${a.headline} | ${a.cause}`));
  expect(seen.stamps).toEqual(expected);
  expect(seen.counts[0]).toBe(`${ROSTER.length} remain`);
  expect(seen.counts.at(-1)).toBe("1 remains");
  expect(seen.overlaps).toEqual([]);
  await expect(page.getByTestId("credits")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("credits-winner")).toHaveText(winner);
  for (const name of others) await expect(page.getByTestId("fallen")).toContainText(name);
  await expect(page.getByTestId("seed")).not.toHaveText("revealing...");

  // The comic book is printed in the background and offered in the credits.
  const comic = page.getByTestId("comic");
  await expect(comic).toHaveAttribute("data-status", "ready", { timeout: 120_000 });
  await expect(comic).toContainText(/bottle-throne_\d{4}-\d{2}-\d{2}\.pdf/);
  const opened = page.context().waitForEvent("page");
  await page.getByTestId("comic-open").click();
  expect((await opened).url()).toContain(`/api/shows/${id}/comic.pdf`);
  const pdf = await request.get(`/api/shows/${id}/comic.pdf`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  expect(errors).toEqual([]);
});


test("a ghost is labelled as a ghost and stays out on the tracker", async ({ page }) => {
  await page.goto("/dev/stage?demo=ghost&speed=2");
  const name = page.getByTestId("bubble-name").filter({ hasText: /^Ghost of / });
  await expect(name).toBeVisible({ timeout: 60_000 });
  const ghost = (await name.textContent())!.replace(/^Ghost of /, "");
  const chip = page.getByTestId("tracker").locator(".tracker-chip", { hasText: ghost });
  await expect(chip).toHaveAttribute("data-out", "true");
});
