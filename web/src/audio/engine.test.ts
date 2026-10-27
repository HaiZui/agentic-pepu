import { afterEach, describe, expect, it, vi } from "vitest";
import { ManualClock } from "../stage/clock";
import { allSteps, createProgram, IMPACT_CUES, PRE_SILENCE_MS } from "../stage/compiler";
import { FIXTURES } from "../stage/fixtures";
import { Player, type Renderer } from "../stage/player";
import type { Step } from "../stage/types";
import { connectAudio } from "./bridge";
import { AudioEngine, CROSSFADE_SECONDS, DUCK_GAIN } from "./engine";
import { FakeContext, fakeBuffer, type FakeGain, type FakeSource } from "./fake-context";
import { CUES, MOODS, REQUIRED_STEMS } from "./schedule";

function engineWithSounds() {
  const context = new FakeContext();
  const engine = new AudioEngine(context);
  for (const stem of REQUIRED_STEMS) engine.addBuffer(stem, fakeBuffer());
  return { context, engine };
}

const lastRamp = (gain: FakeGain) => gain.gain.calls.filter(([m]) => m === "ramp").at(-1);
const musicSources = (context: FakeContext) => context.sources.filter((s) => s.loop);

afterEach(() => vi.restoreAllMocks());

describe("mood music", () => {
  it("loops the mood track and crossfades over two seconds on a change", () => {
    const { context, engine } = engineWithSounds();
    engine.setMood("feast");
    const [feast] = musicSources(context);
    expect(feast.started).toBe(0);
    const feastGain = feast.outputs[0] as FakeGain;

    context.currentTime = 10;
    engine.setMood("battle");
    const battle = musicSources(context)[1];
    const battleGain = battle.outputs[0] as FakeGain;
    expect(lastRamp(feastGain)).toEqual(["ramp", 0, 10 + CROSSFADE_SECONDS]);
    expect(battleGain.gain.calls).toEqual([
      ["set", 0, 10],
      ["ramp", 1, 10 + CROSSFADE_SECONDS],
    ]);
    expect(feast.stopped).toBeCloseTo(10 + CROSSFADE_SECONDS + 0.05);
    expect(engine.mood).toBe("battle");
  });

  it("keeps the current track when the next scene shares its mood", () => {
    const { context, engine } = engineWithSounds();
    engine.setMood("dread");
    engine.setMood("dread");
    expect(musicSources(context)).toHaveLength(1);
    expect(musicSources(context)[0].stopped).toBeNull();
  });

  it("starts a mood as soon as its late-loading file arrives", () => {
    const context = new FakeContext();
    const engine = new AudioEngine(context);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    engine.setMood("overture");
    expect(musicSources(context)).toHaveLength(0);
    engine.addBuffer("music/overture", fakeBuffer());
    expect(engine.mood).toBe("overture");
  });

  it("never changes the music's playback rate (pitch stays put at any speed)", () => {
    const { context, engine } = engineWithSounds();
    engine.setMood("triumph");
    expect(musicSources(context)[0].playbackRate.value).toBe(1);
  });
});

describe("ducking and silence before impact", () => {
  it("lowers music about 6 dB for dialogue and restores it", () => {
    const { context, engine } = engineWithSounds();
    context.currentTime = 3;
    engine.setDucked(true);
    expect(lastRamp(engine.duck as FakeGain)).toEqual(["ramp", DUCK_GAIN, 3.15]);
    expect(20 * Math.log10(DUCK_GAIN)).toBeCloseTo(-6, 0);
    context.currentTime = 5;
    engine.setDucked(false);
    expect(lastRamp(engine.duck as FakeGain)).toEqual(["ramp", 1, 5.6]);
  });

  it("cuts the music half a second before an impact and brings it back after", () => {
    const { context, engine } = engineWithSounds();
    context.currentTime = 20;
    engine.play("sfx/shink", 0.8, { preSilenceMs: 500 });
    const impact = 20.8;
    expect((engine.silence as FakeGain).gain.calls).toEqual([
      ["cancel", 0, 20],
      ["set", 1, impact - 0.5],
      ["ramp", 0, impact - 0.5 + 0.08],
      ["set", 0, impact],
      ["ramp", 1, impact + 0.4],
    ]);
    expect(context.sources.at(-1)?.started).toBeCloseTo(impact);
  });

  it("marks the first impact cue of every dramatic beat, and nothing else", () => {
    for (const size of [6, 15, 40] as const) {
      const fixture = FIXTURES[size];
      const steps = allSteps(createProgram(fixture.fate, fixture.scenes));
      for (const beat of fixture.fate.beats) {
        const scene = fixture.scenes[beat.index];
        const impactLines = scene.cues.filter((c) => IMPACT_CUES.includes(c.sfx)).map((c) => c.line);
        const marked = steps.filter((s) => s.kind === "line" && s.beat === beat.index && s.preSilenceMs);
        if (beat.dramatic && impactLines.length > 0) {
          expect(marked.map((s) => (s.kind === "line" ? [s.line, s.preSilenceMs] : []))).toEqual([[Math.min(...impactLines), PRE_SILENCE_MS]]);
        } else {
          expect(marked).toHaveLength(0);
        }
      }
    }
  });
});

class NullRenderer implements Renderer {
  apply() {}
  play() {}
  stop() {}
  interlude() {}
}

function liveShow(size: 6 | 15 | 40 = 15) {
  const fixture = FIXTURES[size];
  const program = createProgram(fixture.fate, fixture.scenes);
  const clock = new ManualClock();
  const player = new Player(program, new NullRenderer(), clock, { maxSpeed: 10 });
  const { context, engine } = engineWithSounds();
  const played: { key: string; at: number }[] = [];
  const original = engine.play.bind(engine);
  engine.play = (key, delay = 0, options) => {
    played.push({ key, at: context.currentTime + delay });
    original(key, delay, options);
  };
  connectAudio(engine, player);
  const steps: Step[] = [];
  player.bus.on("step:start", ({ step }) => steps.push(step));
  return { fixture, program, clock, player, context, engine, played, steps };
}

describe("following the show", () => {
  it("ducks on every line and releases when a non-line step starts", async () => {
    const { clock, player, engine, steps } = liveShow(6);
    void player.run();
    while (steps.filter((s) => s.kind === "line").length < 2) await clock.advance(0.5);
    const duck = engine.duck as FakeGain;
    const ramps = duck.gain.calls.filter(([m]) => m === "ramp").map(([, v]) => v);
    expect(ramps).toContain(DUCK_GAIN);
    expect(ramps).toContain(1);
    // While a line is current, the most recent duck ramp is down.
    await clock.advance(0.01);
    const current = steps.at(-1)!;
    expect(lastRamp(duck)?.[1]).toBe(current.kind === "line" ? DUCK_GAIN : 1);
  });

  it("schedules cues at their lettering moment, scaled by speed", async () => {
    const normal = liveShow(15);
    void normal.player.run();
    await normal.clock.runOut();
    const fast = liveShow(15);
    fast.player.setSpeed(2);
    void fast.player.run();
    await fast.clock.runOut();
    const cueKeys = (p: typeof normal.played) => p.filter((x) => x.key.startsWith("sfx/") && x.key !== "sfx/curtain");
    expect(cueKeys(normal.played).length).toBeGreaterThan(0);
    expect(cueKeys(fast.played).map((x) => x.key)).toEqual(cueKeys(normal.played).map((x) => x.key));
    // The fake context's clock stands still, so `at` is the scheduling delay after the step began.
    cueKeys(fast.played).forEach((x, i) => expect(x.at).toBeCloseTo(cueKeys(normal.played)[i].at / 2, 6));
    expect(cueKeys(normal.played).every((x) => x.at >= 0.15 - 1e-9)).toBe(true);
    expect(CUES.length).toBe(20);
    expect(MOODS.length).toBe(8);
  });

  it("plays the structural stingers: curtain, roll call, eliminations, coronation", async () => {
    const { fixture, clock, player, played } = liveShow(15);
    void player.run();
    await clock.runOut();
    const count = (key: string) => played.filter((p) => p.key === key).length;
    expect(count("stingers/curtain")).toBeGreaterThanOrEqual(4);
    expect(count("stingers/roll_call")).toBe(fixture.fate.houses.length);
    const eliminations = fixture.fate.beats.reduce((t, b) => t + b.eliminations.length, 0);
    expect(count("stingers/elimination")).toBe(eliminations);
    expect(count("stingers/coronation")).toBe(1);
  });

  it("suspends and resumes the audio context with pause", async () => {
    const { clock, player, context } = liveShow(6);
    void player.run();
    await clock.advance(2);
    player.pause();
    expect(context.suspends).toBe(1);
    player.resume();
    expect(context.resumes).toBe(1);
  });

  it("stops sounds from skipped content and starts the new act's music", async () => {
    const { clock, player, context, engine, steps, program } = liveShow(15);
    void player.run();
    while (player.currentStep?.section !== "act_2") await clock.advance(0.5);
    // Something is still ringing from Act II when the presenter skips.
    engine.play("sfx/gong", 0);
    engine.play("sfx/thunder", 3);
    const ringing = context.sources.filter((s) => !s.loop && s.stopped === null) as FakeSource[];
    expect(ringing.length).toBeGreaterThan(0);
    player.skipAct();
    expect(ringing.every((s) => s.stopped !== null)).toBe(true);
    expect(engine.playing).toBe(0);
    // The Act III music starts with the title card, before its first scene sets the mood again.
    const target = player.position;
    const firstMood = program.segments[target.segment].steps!.find((s) => s.stateAfter.mood)!.stateAfter.mood;
    expect(engine.mood).toBe(firstMood);
    await clock.advance(6);
    const actThree = player.currentStep;
    expect(actThree?.section, steps.slice(-4).map((s) => `${s.kind}:${s.stateAfter.mood}`).join(" ")).toBe("act_3");
    expect(engine.mood).toBe(firstMood);
  });
});

describe("presenter sound controls and degradation", () => {
  it("mutes and steps the volume on the master bus", () => {
    const { engine } = engineWithSounds();
    const master = engine.master as FakeGain;
    engine.toggleMute();
    expect(lastRamp(master)?.[1]).toBe(0);
    engine.toggleMute();
    expect(lastRamp(master)?.[1]).toBe(0.8);
    engine.changeVolume(-1);
    engine.changeVolume(-1);
    expect(engine.volume).toBe(0.6);
    expect(lastRamp(master)?.[1]).toBe(0.6);
    for (let i = 0; i < 20; i++) engine.changeVolume(1);
    expect(engine.volume).toBe(1);
  });

  it("skips a missing sound with a console warning instead of failing", () => {
    const context = new FakeContext();
    const engine = new AudioEngine(context);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(() => engine.play("sfx/raven")).not.toThrow();
    expect(() => engine.setMood("battle")).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("sfx/raven"));
    expect(context.sources).toHaveLength(0);
  });
});
