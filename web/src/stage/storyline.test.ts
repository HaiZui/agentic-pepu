import { describe, expect, it } from "vitest";
import { addScene, allSteps, createProgram, survivorTimeline } from "./compiler";
import { FIXTURES } from "./fixtures";
import { DURATION } from "./timing";
import { TRACKER_MAX_HEIGHT, trackerBottom, trackerLayout, initials } from "./tracker";
import type { SceneScript, Step } from "./types";

const SIZES = [6, 15, 40] as const;
const withStory = (size: (typeof SIZES)[number]) => {
  const fixture = FIXTURES[size];
  return { fixture, program: createProgram(fixture.fate, fixture.scenes, fixture.storyline) };
};
const kinds = (steps: Step[]) => steps.map((s) => s.kind);

describe("storyline in the program", () => {
  it.each(SIZES)("is available before the cold open ends and seeds the tracker (%i)", (size) => {
    const fixture = FIXTURES[size];
    const program = createProgram(fixture.fate, [], fixture.storyline);
    expect(program.storyline).toBe(fixture.storyline);
    const intro = program.segments[0];
    expect(intro.steps?.every((s) => s.stateAfter.tracker === null)).toBe(true);
    for (const segment of program.segments.filter((s) => s.beat !== null)) {
      expect(segment.stateBefore.tracker).toEqual(fixture.storyline.beats[segment.beat!].survivors_before);
    }
    expect(program.segments.at(-1)?.stateBefore.tracker).toBeNull();
  });

  it.each(SIZES)("the fate-only tracker matches the backend storyline (%i)", (size) => {
    const fixture = FIXTURES[size];
    const timeline = survivorTimeline(fixture.fate);
    fixture.storyline.beats.forEach((b, i) => {
      expect([...timeline[i]].sort()).toEqual([...b.survivors_before].sort());
    });
    expect(timeline.at(-1)).toEqual([fixture.fate.winner]);
  });
});

describe("OUT and RETURNS stamps", () => {
  it.each(SIZES)("every participant elimination gets its stamp and the tracker ends at the winner (%i)", (size) => {
    const { fixture, program } = withStory(size);
    const steps = allSteps(program);
    const outs = steps.filter((s) => s.kind === "stamp" && s.announcement.kind === "out");
    const montaged = steps.flatMap((s) => (s.kind === "montage" ? s.victims.map((v) => v.id) : []));
    const participants = new Set(fixture.fate.characters.filter((c) => c.kind === "participant").map((c) => c.id));
    const eliminated = fixture.fate.beats.flatMap((b) => b.eliminations.map((e) => e.character)).filter((id) => participants.has(id));
    const stamped = outs.map((s) => (s.kind === "stamp" ? s.announcement.character : null));
    expect([...stamped, ...montaged.filter((id) => participants.has(id))].sort()).toEqual([...eliminated].sort());
    const coronation = steps.find((s) => s.kind === "coronation");
    expect(coronation?.stateAfter.tracker).toEqual([fixture.fate.winner]);
  });

  it("a single elimination is stamped right after the fall, holds 2.5 s and updates the tracker", () => {
    const { fixture, program } = withStory(6);
    const beat = fixture.fate.beats.find((b) => b.kind !== "crowd" && b.eliminations.length === 1)!;
    const victim = beat.eliminations[0].character;
    const steps = program.segments.find((s) => s.beat === beat.index)!.steps!;
    const at = steps.findIndex((s) => s.kind === "stamp");
    expect(steps[at - 1]).toMatchObject({ kind: "action", character: victim });
    const stamp = steps[at];
    expect(stamp.kind === "stamp" && stamp.announcement).toEqual(fixture.storyline.beats[beat.index].announcements[0]);
    expect(stamp.durationAt1x).toBeGreaterThanOrEqual(2.5);
    expect(steps[at - 1].stateAfter.tracker).toContain(victim);
    expect(stamp.stateAfter.tracker).not.toContain(victim);
    expect(stamp.stateAfter.tracker).toHaveLength(steps[0].stateAfter.tracker!.length - 1);
  });

  it("an elimination the scene did not stage is still stamped before the beat ends", () => {
    const { fixture } = withStory(6);
    const beat = fixture.fate.beats.find((b) => b.kind !== "crowd" && b.eliminations.length === 1)!;
    const scene: SceneScript = { ...fixture.scenes[beat.index], stage_directions: [] };
    scene.lines = scene.lines.map((l) => ({ ...l, action: l.action === "fall" || l.action === "exit" ? null : l.action }));
    const program = createProgram(fixture.fate, [], fixture.storyline);
    addScene(program, scene);
    const steps = program.segments.find((s) => s.beat === beat.index)!.steps!;
    const k = kinds(steps);
    expect(k.lastIndexOf("stamp")).toBeGreaterThan(k.lastIndexOf("line"));
    expect(steps.at(-1)?.stateAfter.tracker).not.toContain(beat.eliminations[0].character);
  });

  it("a resurrection is stamped after the entrance and brings the participant back into the tracker", () => {
    const { fixture, program } = withStory(15);
    const beat = fixture.fate.beats.find((b) => b.resurrections.length > 0)!;
    const risen = beat.resurrections[0];
    const steps = program.segments.find((s) => s.beat === beat.index)!.steps!;
    const stamp = steps.find((s) => s.kind === "stamp" && s.announcement.kind === "return")!;
    expect(stamp.kind === "stamp" && stamp.announcement.character).toBe(risen);
    const at = steps.indexOf(stamp);
    expect(steps.slice(0, at).some((s) => s.kind === "enter" || (s.kind === "line" && s.gestures.some((g) => g.character === risen && g.action === "enter")))).toBe(true);
    expect(steps[at - 1].stateAfter.tracker).not.toContain(risen);
    expect(stamp.stateAfter.tracker).toContain(risen);
    expect(stamp.stateAfter.tracker).toHaveLength(steps[at - 1].stateAfter.tracker!.length + 1);
  });

  it("without a storyline there are no stamps, but the tracker still follows the fate", () => {
    const fixture = FIXTURES[15];
    const steps = allSteps(createProgram(fixture.fate, fixture.scenes));
    expect(steps.some((s) => s.kind === "stamp")).toBe(false);
    expect(steps.find((s) => s.kind === "coronation")?.stateAfter.tracker).toEqual([fixture.fate.winner]);
  });
});

describe("crowd montage announcements", () => {
  it("each tile carries its cause, the summary closes the montage and the tracker drops by the crowd", () => {
    const { fixture, program } = withStory(40);
    const beat = fixture.fate.beats.find((b) => b.kind === "crowd" && b.eliminations.length === 4)!;
    const steps = program.segments.find((s) => s.beat === beat.index)!.steps!;
    const montage = steps.find((s) => s.kind === "montage")!;
    if (montage.kind !== "montage") throw new Error("no montage");
    const story = fixture.storyline.beats[beat.index];
    expect(montage.victims.map((v) => v.cause)).toEqual(beat.eliminations.map((e) => story.announcements.find((a) => a.character === e.character)!.cause));
    expect(montage.summary).toEqual(story.announcements.find((a) => a.kind === "summary"));
    expect(montage.summary?.headline).toBe("4 are OUT");
    expect(montage.durationAt1x).toBe(DURATION.montageBase + DURATION.montagePerVictim * 4 + DURATION.montageSummary);
    const before = steps[steps.indexOf(montage) - 1].stateAfter.tracker!;
    expect(montage.stateAfter.tracker).toHaveLength(before.length - 4);
    expect(steps.some((s) => s.kind === "stamp")).toBe(false);
  });
});

describe("ghosts", () => {
  it("marks lines spoken by an eliminated character as ghost lines", () => {
    const { fixture } = withStory(6);
    const first = fixture.fate.beats.find((b) => b.eliminations.length === 1)!;
    const dead = first.eliminations[0].character;
    const later = fixture.fate.beats.find((b) => b.index > first.index && b.card !== "coronation")!;
    const scene = fixture.scenes[later.index];
    const haunted: SceneScript = { ...scene, lines: [...scene.lines, { speaker: dead, emotion: "dead", action: null, text: "Remember me." }] };
    const program = createProgram(fixture.fate, [], fixture.storyline);
    addScene(program, haunted);
    const lines = program.segments.find((s) => s.beat === later.index)!.steps!.filter((s) => s.kind === "line");
    expect(lines.map((s) => s.kind === "line" && s.ghost)).toEqual([...scene.lines.map(() => false), true]);
    expect(lines.at(-1)?.stateAfter.tracker).not.toContain(dead);
  });
});

describe("tracker layout", () => {
  it.each([3, 8, 16, 40])("fits %i participants within 12 percent of the stage height", (count) => {
    const layout = trackerLayout(count);
    expect(layout.height).toBeLessThanOrEqual(TRACKER_MAX_HEIGHT);
    expect(layout.rows * layout.perRow).toBeGreaterThanOrEqual(count);
    expect(layout.perRow * layout.chipWidth + 6 * (layout.perRow - 1)).toBeLessThanOrEqual(1840 - 190);
    expect(layout.compact).toBe(count > 16);
    expect(layout.chipWidth).toBeGreaterThanOrEqual(count > 16 ? 60 : 90);
    expect(trackerBottom(count)).toBeLessThan(200);
  });

  it("uses initials that keep Finnish letters", () => {
    expect(initials("Jääskeläinen")).toBe("Jä");
    expect(initials("Mikko Kuustonen")).toBe("MK");
    expect(initials("Öhman")).toBe("Öh");
    expect(initials("the Herald")).toBe("He");
  });
});
