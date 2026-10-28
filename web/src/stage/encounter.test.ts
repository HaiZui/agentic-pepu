// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { comicPanels } from "../comic/content";
import { renderDragon } from "../render/dragon";
import { CastSheet } from "./cast";
import { addScene, createProgram } from "./compiler";
import { encounterFor, HERO_X, resolutionCaption, type DragonOutcome } from "./encounter";
import { DRAGON_FIXTURES, FIXTURES } from "./fixtures";
import { panelArt } from "./panels-view";

const OUTCOMES: DragonOutcome[] = ["victory", "dragon_slaying", "sword_accident"];
const duel = (outcome: DragonOutcome) => {
  const fixture = DRAGON_FIXTURES[outcome];
  const beat = fixture.fate.beats.find((b) => encounterFor(b))!;
  const scene = fixture.scenes.find((s) => s.beat_index === beat.index)!;
  const encounter = encounterFor(beat)!;
  const program = createProgram(fixture.fate, fixture.scenes, fixture.storyline);
  const steps = program.segments.find((s) => s.beat === beat.index)!.steps!;
  return { fixture, beat, scene, encounter, program, steps };
};

describe("shared dragon interpretation and art", () => {
  it.each(OUTCOMES)("interprets %s without creating a cast member", (outcome) => {
    const { fixture, beat, encounter } = duel(outcome);
    expect(encounter).toMatchObject({ outcome, phase: "confrontation" });
    expect(fixture.fate.characters.some((c) => c.id === encounter.hero && c.kind === "participant")).toBe(true);
    expect(new CastSheet(fixture.fate).get("dragon")).toBeUndefined();
    expect(() => encounterFor({ ...beat, facts: ["unknown"] })).toThrow(/Invalid dragon duel/);
    expect(() => encounterFor({ ...beat, roles: [] })).toThrow(/Invalid dragon duel/);
  });

  it("does not mistake unrelated cards or contradictory facts for victory", () => {
    const { beat } = duel("victory");
    expect(encounterFor(FIXTURES[6].fate.beats[0])).toBeNull();
    expect(() => encounterFor({ ...beat, facts: ["dragon_slaying"] })).toThrow();
    expect(() => encounterFor({ ...beat, card: "dragon_defeat", facts: [] })).toThrow();
  });

  it.each([false, true])("renders deterministic local vector art (defeated=%s)", (defeated) => {
    const art = renderDragon(defeated);
    expect(art.outerHTML).toBe(renderDragon(defeated).outerHTML);
    expect(art.dataset.pose).toBe(defeated ? "defeated" : "threatening");
    expect(art.querySelectorAll("path").length).toBeGreaterThan(8);
    expect(art.querySelector(".texture")).not.toBeNull();
    expect(art.querySelector("image, foreignObject, use")).toBeNull();
    expect(art.outerHTML).not.toMatch(/https?:|data:/);
  });
});

describe("restorable dragon compiler state", () => {
  it.each(OUTCOMES)("resolves %s only at its caption and clears the next beat", (outcome) => {
    const { fixture, beat, encounter, program, steps } = duel(outcome);
    const anchor = steps.findIndex((s) => s.kind === "caption" && s.text === resolutionCaption(fixture.fate, encounter));
    expect(anchor).toBeGreaterThan(0);
    const phases = steps.slice(0, anchor).filter((s) => s.stateAfter.encounter).map((s) => s.stateAfter.encounter!.phase);
    expect(phases.every((p) => p === "confrontation")).toBe(true);
    expect(steps[anchor].stateAfter.encounter?.phase).toBe("resolved");
    const hero = steps.find((s) => s.kind === "enter")!.stateAfter.onStage.find((p) => p.id === encounter.hero)!;
    expect(hero).toMatchObject({ x: HERO_X, layer: "fore" });
    if (outcome !== "victory") {
      expect(steps.slice(0, anchor).some((s) => s.kind === "action" && s.action === "fall")).toBe(true);
      expect(steps[anchor].stateAfter.onStage.some((p) => p.id === encounter.hero)).toBe(false);
      expect(steps[anchor].stateAfter.alive).not.toContain(encounter.hero);
      expect(steps[anchor].stateAfter.tracker).not.toContain(encounter.hero);
    } else {
      expect(steps[anchor].stateAfter.tracker).toEqual(fixture.storyline.beats[beat.index].survivors_before);
      expect(steps.filter((s) => s.kind === "stamp")).toHaveLength(0);
    }
    const next = program.segments.find((s) => s.beat === beat.index + 1)!;
    expect(next.stateBefore.encounter).toBeFalsy();
    expect(next.steps!.every((s) => !s.stateAfter.encounter)).toBe(true);
    const opening = steps.find((s) => s.stateAfter.encounter)!;
    expect(opening.stateAfter.encounter).not.toBe(steps[anchor].stateAfter.encounter);
    steps[anchor].stateAfter.encounter!.phase = "confrontation";
    expect(steps.at(-1)!.stateAfter.encounter?.phase).toBe("resolved");
  });

  it("a pending scene exposes no result, and late delivery compiles the same snapshots", () => {
    const { fixture, beat, scene, steps } = duel("sword_accident");
    const pending = createProgram(fixture.fate, [], fixture.storyline);
    const segment = pending.segments.find((s) => s.beat === beat.index)!;
    expect(segment.steps).toBeNull();
    expect(segment.stateBefore.encounter).toBeFalsy();
    addScene(pending, scene);
    expect(segment.steps).toEqual(steps);
  });
});

describe("stage and comic encounter parity", () => {
  it.each(OUTCOMES)("shares confrontation, resolution, and exact exit causes for %s", (outcome) => {
    const { fixture, beat, steps, encounter } = duel(outcome);
    const panels = comicPanels(fixture.fate, fixture.scenes, fixture.storyline).get(beat.index)!;
    const stage = steps.find((s) => s.kind === "panel_break");
    if (!stage || stage.kind !== "panel_break") throw new Error("Missing dramatic panels");
    expect(panels.map((p) => p.shot.encounter)).toEqual(stage.panels.map((p) => p.encounter));
    expect(panels[0].shot.encounter?.phase).toBe("confrontation");
    expect(panels.at(-1)!.shot.encounter?.phase).toBe("resolved");
    expect(panels.flatMap((p) => p.texts).filter((t) => t.text === resolutionCaption(fixture.fate, encounter))).toHaveLength(1);
    const expected = fixture.storyline.beats[beat.index].announcements;
    expect(panels.flatMap((p) => p.stamps)).toEqual(expected);
    for (const [width, height] of [[900, 400], [350, 700]]) {
      const art = panelArt(panels.at(-1)!.shot, new CastSheet(fixture.fate), width, height);
      expect(art.querySelector("[data-creature]")?.getAttribute("data-pose")).toBe(outcome === "victory" ? "defeated" : "threatening");
      expect(art.querySelectorAll("[data-fallen-hero]")).toHaveLength(outcome === "victory" ? 0 : 1);
      expect(art.querySelector("image")).toBeNull();
    }
  });
});
