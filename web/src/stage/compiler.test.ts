import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MAX_FOREGROUND } from "./blocking";
import { addScene, allSteps, createProgram, NARRATOR, programSeconds } from "./compiler";
import { FIXTURES } from "./fixtures";
import { READING_BASE_SECONDS, READING_PER_CHAR_SECONDS, readingSeconds } from "./timing";
import type { Step } from "./types";

const SIZES = [6, 15, 40] as const;
const compiled = (size: (typeof SIZES)[number]) => {
  const fixture = FIXTURES[size];
  return { fixture, program: createProgram(fixture.fate, fixture.scenes) };
};

describe("program compiler", () => {
  it.each(SIZES)("stages every beat once and in order (%i participants)", (size) => {
    const { fixture, program } = compiled(size);
    const steps = allSteps(program);
    expect(steps[0]).toMatchObject({ kind: "curtain", open: true });
    expect(steps.at(-1)?.kind).toBe("credits");

    const scenery = steps.filter((s) => s.kind === "scenery_change");
    expect(scenery.map((s) => s.beat)).toEqual(fixture.fate.beats.map((b) => b.index));
    const beatOrder = steps.map((s) => s.beat).filter((b): b is number => b !== null);
    expect(beatOrder).toEqual([...beatOrder].sort((a, b) => a - b));

    const titles = steps.filter((s) => s.kind === "title_card");
    expect(titles.map((s) => (s.kind === "title_card" ? s.act : 0))).toEqual([1, 2, 3]);
    expect(steps.filter((s) => s.kind === "coronation")).toHaveLength(1);

    for (const scene of fixture.scenes) {
      const lines = steps.filter((s) => s.kind === "line" && s.beat === scene.beat_index);
      expect(lines.map((s) => (s.kind === "line" ? s.text : ""))).toEqual(scene.lines.map((l) => l.text));
    }
  });

  it("introduces every participant in the cold open, grouped by house", () => {
    const { fixture, program } = compiled(15);
    const rollCalls = allSteps(program).filter((s) => s.kind === "roll_call");
    expect(rollCalls.map((s) => (s.kind === "roll_call" ? s.house : null))).toEqual(fixture.fate.houses.map((h) => h.id));
    const introduced = rollCalls.flatMap((s) => (s.kind === "roll_call" ? s.members : []));
    const participants = fixture.fate.characters.filter((c) => c.kind === "participant").map((c) => c.id);
    expect(introduced.sort()).toEqual(participants.sort());
    expect(program.segments[0].steps?.every((s) => s.beat === null)).toBe(true);
  });

  it("creates beat segments lazily as scenes arrive", () => {
    const { fixture } = compiled(6);
    const program = createProgram(fixture.fate);
    expect(program.segments.filter((s) => s.steps === null)).toHaveLength(fixture.fate.beats.length);
    addScene(program, fixture.scenes[3]);
    expect(program.segments.find((s) => s.beat === 3)?.steps?.length).toBeGreaterThan(0);
    expect(addScene(program, fixture.scenes[3])).toBeNull();
  });
});

describe("blocking, montages and panel breaks", () => {
  it.each(SIZES)("keeps at most six figures in front, with every speaker and actor among them (%i)", (size) => {
    const { program } = compiled(size);
    for (const step of allSteps(program)) {
      expect(step.stateAfter.onStage.filter((p) => p.layer === "fore").length).toBeLessThanOrEqual(MAX_FOREGROUND);
      if (step.kind !== "line") continue;
      const fore = new Set(step.stateAfter.onStage.filter((p) => p.layer === "fore").map((p) => p.id));
      if (step.speaker !== NARRATOR && step.stateAfter.alive.includes(step.speaker)) expect(fore).toContain(step.speaker);
      for (const gesture of step.gestures) expect(fore).toContain(gesture.character);
    }
  });

  it("puts the rest of a large crowd in the background layer", () => {
    const { fixture, program } = compiled(40);
    const crowdBeats = fixture.fate.beats.filter((b) => b.kind === "crowd").map((b) => b.index);
    expect(crowdBeats.length).toBeGreaterThan(0);
    const enter = allSteps(program).find((s) => s.kind === "enter" && s.beat === crowdBeats[0]);
    const back = enter?.stateAfter.onStage.filter((p) => p.layer === "back") ?? [];
    expect(back.length).toBeGreaterThan(6);
  });

  it.each(SIZES)("inserts a montage for every beat with two or more eliminations (%i)", (size) => {
    const { fixture, program } = compiled(size);
    const steps = allSteps(program);
    for (const beat of fixture.fate.beats) {
      const montages = steps.filter((s) => s.kind === "montage" && s.beat === beat.index);
      if (beat.eliminations.length >= 2) {
        expect(montages).toHaveLength(1);
        const victims = montages[0].kind === "montage" ? montages[0].victims.map((v) => v.id) : [];
        expect(victims.sort()).toEqual(beat.eliminations.map((e) => e.character).sort());
      } else {
        expect(montages).toHaveLength(0);
      }
    }
  });

  it.each(SIZES)("breaks into panels exactly on dramatic beats (%i)", (size) => {
    const { fixture, program } = compiled(size);
    const steps = allSteps(program);
    for (const beat of fixture.fate.beats) {
      const breaks = steps.filter((s): s is Extract<Step, { kind: "panel_break" }> => s.kind === "panel_break" && s.beat === beat.index);
      expect(breaks).toHaveLength(beat.dramatic ? 1 : 0);
      if (beat.dramatic) {
        expect(breaks[0].panels.length).toBeGreaterThanOrEqual(2);
        expect(breaks[0].panels.length).toBeLessThanOrEqual(6);
      }
    }
  });
});

describe("timing and state", () => {
  it("uses the reading-time constants published by the backend", () => {
    const python = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../../src/bottle_throne/story/catalog.py"),
      "utf-8",
    );
    expect(python).toContain(`READING_BASE_SECONDS = ${READING_BASE_SECONDS}`);
    expect(python).toContain(`READING_PER_CHAR_SECONDS = ${READING_PER_CHAR_SECONDS}`);
    expect(readingSeconds("x".repeat(100))).toBeCloseTo(6.7);
  });

  it.each(SIZES)("keeps the show between 540 and 660 seconds (%i)", (size) => {
    const seconds = programSeconds(compiled(size).program);
    expect(seconds).toBeGreaterThanOrEqual(540);
    expect(seconds).toBeLessThanOrEqual(660);
  });

  it("never holds a line for less than its reading time", () => {
    for (const step of allSteps(compiled(15).program)) {
      if (step.kind === "line" || step.kind === "caption") expect(step.durationAt1x).toBeGreaterThanOrEqual(step.readSeconds - 1e-9);
    }
  });

  it.each([15, 40] as const)("removes a fallen character from the stage and the living (%i)", (size) => {
    const { fixture, program } = compiled(size);
    const eliminated = new Set(fixture.fate.beats.flatMap((b) => b.eliminations.map((e) => e.character)));
    const falls = allSteps(program).filter((s) => s.kind === "action" && s.action === "fall");
    expect(falls.length).toBeGreaterThan(0);
    for (const step of falls) {
      if (step.kind !== "action") continue;
      expect(step.stateAfter.onStage.map((p) => p.id)).not.toContain(step.character);
      if (eliminated.has(step.character)) expect(step.stateAfter.alive).not.toContain(step.character);
    }
  });

  it.each(SIZES)("ends with the fate winner as the only surviving participant, crowned (%i)", (size) => {
    const { fixture, program } = compiled(size);
    const last = allSteps(program).at(-1)!;
    const participants = new Set(fixture.fate.characters.filter((c) => c.kind === "participant").map((c) => c.id));
    expect(last.stateAfter.alive.filter((id) => participants.has(id))).toEqual([fixture.fate.winner]);
    expect(last.stateAfter.crowned).toBe(fixture.fate.winner);
  });

  it("matches the fate-only segment state at every beat boundary", () => {
    const { program } = compiled(40);
    program.segments.forEach((segment, i) => {
      const next = program.segments[i + 1];
      if (!segment.steps || !next) return;
      expect([...segment.steps.at(-1)!.stateAfter.alive].sort()).toEqual([...next.stateBefore.alive].sort());
    });
  });
});
