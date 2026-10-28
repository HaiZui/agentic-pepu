import { describe, expect, it } from "vitest";
import { ManualClock } from "./clock";
import { addScene, allSteps, createProgram, programSeconds } from "./compiler";
import { DRAGON_FIXTURES, FIXTURES } from "./fixtures";
import { Player, type Renderer } from "./player";
import type { StageState, Step } from "./types";

class RecordingRenderer implements Renderer {
  log: string[] = [];
  played: Step[] = [];
  applied: StageState[] = [];
  apply(state: StageState) {
    this.applied.push(state);
    this.log.push("apply");
  }
  play(step: Step) {
    this.played.push(step);
  }
  stop() {
    this.log.push("stop");
  }
  interlude(on: boolean) {
    this.log.push(`interlude:${on}`);
  }
}

function setup(size: 6 | 15 | 40 = 6, withScenes = true, speed?: number) {
  const fixture = FIXTURES[size];
  const program = createProgram(fixture.fate, withScenes ? fixture.scenes : []);
  const renderer = new RecordingRenderer();
  const clock = new ManualClock();
  const player = new Player(program, renderer, clock, { maxSpeed: 10, speed });
  const events: string[] = [];
  const bus = player.bus;
  bus.on("step:start", ({ step }) => events.push(`step:${step.kind}`));
  bus.on("line:start", () => events.push("line"));
  bus.on("cue", ({ sfx }) => events.push(`cue:${sfx}`));
  bus.on("music:mood", ({ mood }) => events.push(`mood:${mood}`));
  bus.on("pause", () => events.push("pause"));
  bus.on("resume", () => events.push("resume"));
  bus.on("speed", ({ speed }) => events.push(`speed:${speed}`));
  bus.on("show:end", () => events.push("end"));
  return { fixture, program, renderer, clock, player, events };
}

describe("player loop", () => {
  it.each(Object.keys(DRAGON_FIXTURES) as (keyof typeof DRAGON_FIXTURES)[])("plays dragon %s cues and result once across pause and speed changes", async (outcome) => {
    const fixture = DRAGON_FIXTURES[outcome];
    const full = createProgram(fixture.fate, fixture.scenes, fixture.storyline);
    const index = full.segments.findIndex((s) => s.steps?.some((step) => step.stateAfter.encounter));
    const program = { ...full, segments: full.segments.slice(index, index + 2) };
    const renderer = new RecordingRenderer();
    const clock = new ManualClock();
    const player = new Player(program, renderer, clock, { maxSpeed: 10 });
    const cues: string[] = [];
    player.bus.on("cue", ({ sfx }) => cues.push(sfx));
    const done = player.run();
    await clock.advance(1);
    player.pause();
    const count = renderer.played.length;
    await clock.advance(100);
    expect(renderer.played).toHaveLength(count);
    player.setSpeed(2);
    player.resume();
    await clock.runOut();
    await done;
    const expected = program.segments.flatMap((s) => s.steps ?? []).filter((s) => s.kind === "line").flatMap((s) => s.cues);
    expect(cues).toEqual(expected);
    expect(cues).toContain("dragon_roar");
    const resolved = renderer.played.filter((s) => s.kind === "caption" && s.stateAfter.encounter?.phase === "resolved");
    expect(resolved).toHaveLength(1);
    expect(renderer.played.at(-1)!.stateAfter.encounter).toBeFalsy();
  });
  it("emits events in program order and ends once", async () => {
    const { program, clock, player, events, renderer } = setup();
    const done = player.run();
    await clock.runOut();
    await done;

    const steps = allSteps(program);
    expect(renderer.played).toEqual(steps);
    expect(events.filter((e) => e.startsWith("step:"))).toEqual(steps.map((s) => `step:${s.kind}`));
    expect(events.slice(0, 2)).toEqual(["step:curtain", "mood:overture"]);
    expect(events.at(-1)).toBe("end");
    expect(events.filter((e) => e === "end")).toHaveLength(1);

    // A line announces itself after its step and before its cues.
    expect(events.filter((e) => e.startsWith("cue:")).length).toBeGreaterThan(0);
    events.forEach((event, i) => {
      if (event === "line") expect(events.slice(0, i).reverse().find((e) => e.startsWith("step:"))).toBe("step:line");
      if (event.startsWith("cue:")) expect(events[i - 1]).toMatch(/^(line|cue:)/);
    });
    expect(clock.elapsed).toBeCloseTo(programSeconds(program), 3);
  });

  it("scales durations with speed and freezes while paused", async () => {
    const normal = setup();
    void normal.player.run();
    await normal.clock.runOut();
    const fast = setup(6, true, 2);
    void fast.player.run();
    await fast.clock.advance(1);
    fast.player.pause();
    await fast.clock.advance(100);
    expect(fast.clock.elapsed).toBeCloseTo(2, 5);
    fast.player.resume();
    let wall = 1;
    while (!fast.player.ended) {
      await fast.clock.advance(1);
      wall++;
    }
    expect(wall).toBeCloseTo(normal.clock.elapsed / 2, -1);
    expect(fast.events).toContain("pause");
    expect(fast.events.indexOf("resume")).toBeGreaterThan(fast.events.indexOf("pause"));
  });

  it("accepts the four presenter speeds and the hidden test speed", () => {
    const { player, events } = setup();
    player.faster();
    player.faster();
    player.faster();
    expect(player.speed).toBe(2);
    player.slower();
    player.slower();
    player.slower();
    player.slower();
    expect(player.speed).toBe(0.5);
    player.setSpeed(10);
    expect(player.speed).toBe(10);
    expect(events.filter((e) => e.startsWith("speed:"))).toEqual(["speed:1.5", "speed:2", "speed:1.5", "speed:1", "speed:0.5", "speed:10"]);
  });

  it("plays an interlude until a pending scene arrives", async () => {
    const { fixture, program, clock, player, events, renderer } = setup(6, false);
    addScene(program, fixture.scenes[0]);
    const done = player.run();
    await clock.runOut();
    expect(events.at(-1)).toBe("step:interlude");
    expect(renderer.log.at(-1)).toBe("interlude:true");
    expect(player.position.segment).toBe(2);

    for (const scene of fixture.scenes.slice(1)) addScene(program, scene);
    player.sceneAdded();
    await clock.runOut();
    await done;
    expect(renderer.log).toContain("interlude:false");
    expect(events.at(-1)).toBe("end");
  });
});

async function advanceUntil(clock: ManualClock, done: () => boolean, limit = 2000): Promise<void> {
  for (let i = 0; i < limit && !done(); i++) await clock.advance(0.25);
}

describe("presenter navigation", () => {
  it("steps back to the previous line with its speaker, emotion and bubble", async () => {
    const { program, clock, player, renderer } = setup(15);
    void player.run();
    const lines = () => renderer.played.filter((s) => s.kind === "line");
    const third = (beat: number) => lines().filter((s) => s.beat === beat).length >= 3;
    const beat = program.segments.find((s) => (s.steps ?? []).filter((x) => x.kind === "line").length >= 3)!.beat!;
    await advanceUntil(clock, () => third(beat));
    const current = renderer.played.at(-1)!;
    expect(current).toMatchObject({ kind: "line", line: 2 });

    player.previousLine();
    await clock.advance(0.01);
    const replay = renderer.played.at(-1)!;
    expect(replay).toMatchObject({ kind: "line", beat, line: 1 });
    const segment = program.segments.find((s) => s.beat === beat)!;
    const lineTwoIndex = segment.steps!.indexOf(replay);
    expect(renderer.applied.at(-1)).toBe(segment.steps![lineTwoIndex - 1].stateAfter);
  });

  it("never steps back into content that was skipped", async () => {
    const { clock, player } = setup(6);
    void player.run();
    await clock.advance(1);
    player.skipAct();
    await clock.advance(0.5);
    const at = player.position;
    player.previousLine();
    expect(player.position).toEqual(at);
    player.previousScene();
    // The cold-open scene (segment 1) was skipped, so stepping back lands on the intro that did play.
    expect(player.position).toEqual({ segment: 0, step: 0 });
  });

  it("steps forward line by line and scene by scene", async () => {
    const { clock, player, renderer } = setup(6);
    void player.run();
    await clock.advance(0.5);
    player.nextLine();
    await clock.advance(0.01);
    expect(renderer.played.at(-1)?.kind).toBe("line");
    const segment = player.position.segment;
    player.nextScene();
    await clock.advance(0.01);
    expect(player.position).toEqual({ segment: segment + 1, step: 0 });
  });

  it("plays the interlude when stepping into a scene that is not ready", async () => {
    const { fixture, program, clock, player, events } = setup(6, false);
    addScene(program, fixture.scenes[0]);
    void player.run();
    await clock.advance(0.5);
    player.nextScene();
    await clock.advance(0.01);
    player.nextScene();
    await clock.advance(0.01);
    expect(events.at(-1)).toBe("step:interlude");
    expect(player.position.segment).toBe(2);
  });

  it("skipping Act II keeps its eliminations and the crowned winner", async () => {
    const { fixture, program, clock, player, renderer } = setup(15);
    void player.run();
    await advanceUntil(clock, () => player.currentStep?.section === "act_2");
    player.skipAct();
    await clock.advance(0.01);
    expect(player.currentStep).toMatchObject({ kind: "title_card", act: 3 });

    const actTwoOut = fixture.fate.beats.filter((b) => b.section === "act_2").flatMap((b) => b.eliminations.map((e) => e.character));
    expect(actTwoOut.length).toBeGreaterThan(0);
    const applied = renderer.applied.at(-1)!;
    for (const id of actTwoOut) expect(applied.alive).not.toContain(id);

    await clock.runOut();
    for (const step of renderer.played.filter((s) => s.section === "act_3" || s.section === "coronation")) {
      for (const id of actTwoOut) {
        expect(step.stateAfter.alive).not.toContain(id);
        expect(step.stateAfter.onStage.map((p) => p.id)).not.toContain(id);
      }
    }
    const coronation = renderer.played.find((s) => s.kind === "coronation");
    expect(coronation).toMatchObject({ winner: fixture.fate.winner });
    expect(renderer.played.at(-1)?.stateAfter).toEqual(allSteps(program).at(-1)?.stateAfter);
  });

  it("heavy skipping and stepping never changes the outcome", async () => {
    const reference = setup(40);
    void reference.player.run();
    await reference.clock.runOut();

    const { clock, player, renderer } = setup(40);
    void player.run();
    const moves = [
      () => player.nextLine(),
      () => player.previousLine(),
      () => player.nextScene(),
      () => player.previousScene(),
      () => player.skipAct(),
    ];
    for (let i = 0; i < 200 && !player.ended; i++) {
      moves[(i * 7) % moves.length]();
      await clock.advance(0.3);
    }
    await clock.runOut();
    expect(player.ended).toBe(true);
    expect(renderer.played.find((s) => s.kind === "coronation")).toMatchObject({ winner: reference.fixture.fate.winner });
    expect(renderer.played.at(-1)).toEqual(reference.renderer.played.at(-1));
  });
});
