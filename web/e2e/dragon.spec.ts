import { expect, test } from "@playwright/test";
import type { AudioEngine } from "../src/audio/engine";
import type { MountedStage } from "../src/stage/mount";
import type { panelArt } from "../src/stage/panels-view";

declare global {
  interface Window {
    __btStage: MountedStage;
    __btAudio: AudioEngine;
    __btPanelArt: typeof panelArt;
  }
}

test("dragon victory resolves during normal-motion playback and freezes when paused", async ({ page }) => {
  await page.goto("/dev/stage?demo=dragon-victory&speed=4");
  await expect(page.locator('.layer-creatures [data-encounter="resolved"]')).toHaveCount(1, { timeout: 30_000 });
  const opacity = await page.evaluate(() => {
    window.__btStage.player.pause();
    return getComputedStyle(window.__btStage.renderer.layers.creatures).opacity;
  });
  await page.waitForTimeout(200);
  expect(await page.locator(".layer-creatures").evaluate((el) => getComputedStyle(el).opacity)).toBe(opacity);
  await expect(page.locator(".layer-creatures [data-creature]")).toHaveAttribute("data-pose", "defeated");
  await page.evaluate(() => {
    const player = window.__btStage.player;
    player.setSpeed(2);
    player.nextScene();
    player.resume();
  });
  await expect(page.locator(".layer-creatures [data-creature]")).toHaveCount(0);
});

for (const outcome of ["victory", "dragon_slaying", "sword_accident"]) {
  test(`dragon ${outcome}: live controls and snapshot restoration`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/dev/stage?demo=dragon-${outcome}&speed=10`);
    const creature = page.locator(".layer-creatures [data-creature]");
    await expect(creature).toHaveCount(1, { timeout: 15_000 });
    await page.evaluate(() => {
      const { player } = window.__btStage;
      player.pause();
      player.setSpeed(2);
      if (!window.__btAudio.muted) window.__btAudio.toggleMute();
    });
    const paused = await page.evaluate(() => {
      const stage = window.__btStage;
      const steps = stage.program.segments[0].steps!;
      const opening = steps.find((s) => s.kind === "enter" && s.stateAfter.encounter)!;
      stage.renderer.apply(opening.stateAfter);
      return { paused: stage.player.paused, speed: stage.player.speed, muted: window.__btAudio.muted };
    });
    expect(paused).toEqual({ paused: true, speed: 2, muted: true });
    await expect(creature).toHaveAttribute("data-pose", "threatening");
    await expect(creature.locator('[data-dragon-part="body"] > path').first()).toHaveCSS("fill", "rgb(47, 110, 59)");
    const visible = await page.evaluate(() => {
      const { renderer, program } = window.__btStage;
      const hero = program.segments[0].steps!.find((s) => s.stateAfter.encounter)!.stateAfter.encounter!.hero;
      const stage = renderer.layers.stage.getBoundingClientRect();
      return [renderer.layers.creatures.querySelector("[data-creature]")!, renderer.layers.puppets.querySelector(`[data-character="${hero}"]`)!]
        .every((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.left >= stage.left && r.right <= stage.right && r.top >= stage.top && r.bottom <= stage.bottom;
        });
    });
    expect(visible).toBe(true);
    await page.evaluate(() => {
      const stage = window.__btStage;
      const resolved = stage.program.segments[0].steps!.find((s) => s.kind === "caption" && s.stateAfter.encounter?.phase === "resolved")!;
      stage.renderer.apply(resolved.stateAfter);
      stage.renderer.apply(resolved.stateAfter);
    });
    await expect(creature).toHaveCount(1);
    await expect(creature).toHaveAttribute("data-pose", outcome === "victory" ? "defeated" : "threatening");
    await expect(page.locator(".layer-creatures [data-fallen-hero]")).toHaveCount(outcome === "victory" ? 0 : 1);
    for (const [width, height] of [[900, 400], [350, 700]]) {
      const clipped = await page.evaluate(({ width, height }) => {
        const stage = window.__btStage;
        const step = stage.program.segments[0].steps!.find((s) => s.kind === "panel_break");
        if (!step || step.kind !== "panel_break") throw new Error("Missing duel panels");
        return step.panels.map((shot) => {
          const svg = window.__btPanelArt(shot, stage.renderer.cast, width, height);
          svg.style.width = `${width}px`;
          svg.style.height = `${height}px`;
          document.body.append(svg);
          const box = svg.getBoundingClientRect();
          const clipped = [...svg.querySelectorAll("[data-creature], [data-fallen-hero], [data-encounter-hero]")].some((el) => {
            const r = el.getBoundingClientRect();
            return r.width === 0 || r.height === 0 || r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1;
          });
          svg.remove();
          return clipped;
        });
      }, { width, height });
      expect(clipped).toEqual([false, false, false]);
    }
    await page.evaluate(() => {
      const stage = window.__btStage;
      stage.renderer.apply(stage.program.segments[0].steps!.find((s) => s.kind === "enter")!.stateAfter);
    });
    await expect(creature).toHaveAttribute("data-pose", "threatening");
    await expect(page.locator(".layer-creatures [data-fallen-hero]")).toHaveCount(0);
    await page.evaluate(() => {
      const player = window.__btStage.player;
      player.nextScene();
      player.resume();
    });
    await expect(creature).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test(`dragon ${outcome}: comic vectors, fitting and export`, async ({ page, browserName }) => {
    await page.goto(`/dev/comic?dragon=${outcome}`);
    await page.waitForFunction(() => window.__comicReady === true);
    const stats = await page.evaluate(() => window.__comicStats!);
    expect(stats.unfit).toEqual([]);
    expect(stats.stampsMissing).toEqual([]);
    expect(stats.pages).toBeGreaterThanOrEqual(16);
    expect(stats.pages).toBeLessThanOrEqual(32);
    const panels = page.locator(".panel-art:has([data-encounter])");
    await expect(panels.locator('[data-encounter="confrontation"]').first()).toBeVisible();
    const resolution = panels.locator('[data-encounter="resolved"]').last();
    await expect(resolution.locator("[data-creature]")).toHaveAttribute("data-pose", outcome === "victory" ? "defeated" : "threatening");
    await expect(resolution.locator("[data-fallen-hero]")).toHaveCount(outcome === "victory" ? 0 : 1);
    await expect(panels.locator("image")).toHaveCount(0);
    const clipped = await panels.evaluateAll((svgs) => svgs.filter((svg) => {
      const box = svg.getBoundingClientRect();
      return [...svg.querySelectorAll("[data-creature], [data-fallen-hero], [data-encounter-hero]")].some((el) => {
        const r = el.getBoundingClientRect();
        return r.width === 0 || r.height === 0 || r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1;
      });
    }).length);
    expect(clipped).toBe(0);
    await page.screenshot({ path: test.info().outputPath(`dragon-${outcome}.png`), fullPage: true });
    if (browserName === "chromium") {
      const pdf = await page.pdf({ path: test.info().outputPath(`dragon-${outcome}.pdf`), format: "A4", printBackground: true });
      expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
      expect(pdf.length).toBeGreaterThan(10_000);
    }
  });
}
