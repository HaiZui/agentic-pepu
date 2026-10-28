// @vitest-environment happy-dom
import { gsap } from "gsap";
import { describe, expect, it } from "vitest";
import { Lettering } from "./bubbles";
import { CastSheet } from "./cast";
import { FIXTURES } from "./fixtures";
import { Tracker, trackerBottom } from "./tracker";

describe("survivor tracker strip", () => {
  it("shows every participant, marks the ones out and counts the rest", () => {
    const fixture = FIXTURES[15];
    const layer = document.createElement("div");
    const tracker = new Tracker(layer, fixture.fate, new CastSheet(fixture.fate));
    const all = fixture.storyline.beats[0].survivors_before;

    tracker.set(all);
    const root = layer.querySelector('[data-testid="tracker"]')!;
    expect(root.querySelectorAll(".tracker-chip")).toHaveLength(15);
    expect(root.querySelector('[data-testid="tracker-count"]')?.textContent).toBe("15 remain");
    expect(root.querySelectorAll(".tracker-chip.out")).toHaveLength(0);

    const [gone, ...rest] = all;
    tracker.set(rest, true);
    expect(root.querySelector(`[data-id="${gone}"]`)?.classList.contains("out")).toBe(true);
    expect(root.querySelectorAll(".tracker-chip.out")).toHaveLength(1);
    expect(root.querySelector('[data-testid="tracker-count"]')?.textContent).toBe("14 remain");

    tracker.set([fixture.fate.winner]);
    expect(root.querySelector('[data-testid="tracker-count"]')?.textContent).toBe("1 remains");

    tracker.set(null);
    expect(layer.querySelector('[data-testid="tracker"]')).toBeNull();
    expect(tracker.current).toBeNull();
  });

  it("writes names exactly as entered and abbreviates only on large rosters", () => {
    const small = FIXTURES[15];
    const layer = document.createElement("div");
    new Tracker(layer, small.fate, new CastSheet(small.fate)).set([]);
    const names = [...layer.querySelectorAll(".tracker-name")].map((n) => n.textContent);
    const expected = small.fate.characters.filter((c) => c.kind === "participant").map((c) => c.name);
    expect([...names].sort()).toEqual([...expected].sort());

    const big = FIXTURES[40];
    const bigLayer = document.createElement("div");
    new Tracker(bigLayer, big.fate, new CastSheet(big.fate)).set([]);
    expect(bigLayer.querySelector(".tracker")?.classList.contains("compact")).toBe(true);
    expect(bigLayer.querySelectorAll(".tracker-chip")).toHaveLength(40);
  });
});

describe("speech bubbles stay below the tracker", () => {
  it("never places a bubble above the reserved strip", () => {
    const layer = document.createElement("div");
    const lettering = new Lettering(layer);
    const bottom = trackerBottom(40);
    lettering.reserveTop(bottom);
    const tl = gsap.timeline({ paused: true });
    lettering.line(tl, 0, { name: "Aino", text: "Up here!", anchor: () => ({ x: 960, y: 60 }), hold: 2 });
    tl.progress(1);
    const box = layer.querySelector<HTMLElement>('[data-testid="bubble"]')!;
    expect(parseFloat(box.style.top)).toBeGreaterThan(bottom);

    lettering.reserveTop(null);
    lettering.reposition();
    expect(parseFloat(box.style.top)).toBeLessThan(bottom);
  });
});
