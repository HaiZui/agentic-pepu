import { expect, test } from "@playwright/test";

test("START unlocks audio and the overture plays with the cold open", async ({ page }) => {
  await page.goto("/");
  await page.locator("#participants").fill("Matti\nAino\nKalle\nJääskeläinen");
  await page.getByRole("button", { name: "START THE SHOW" }).click();
  await page.getByTestId("start").click();

  const viewport = page.locator(".stage-viewport");
  await expect(viewport).toHaveAttribute("data-audio", "running", { timeout: 15_000 });
  await expect(viewport).toHaveAttribute("data-music", "overture", { timeout: 15_000 });
  await expect(page.getByTestId("audio-banner")).toHaveCount(0);
});
