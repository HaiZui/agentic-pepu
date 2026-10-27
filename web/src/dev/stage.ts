import { sharedEngine, unlockAudio } from "../audio/context";
import { el } from "../dom";
import { compileBeat, createProgram, type Program } from "../stage/compiler";
import { FIXTURES, type StageFixture } from "../stage/fixtures";
import { mountStage, type MountedStage } from "../stage/mount";
import type { Action, Beat, FateScript, SceneScript, Segment, StageState } from "../stage/types";
import "./stage-dev.css";

const ACTIONS: Action[] = ["enter", "exit", "draw_weapon", "strike", "fall", "kneel", "drink", "point", "embrace", "flee", "crown"];

interface Demo {
  id: string;
  label: string;
  build(): { fixture: StageFixture; program: Program; later?: (stage: MountedStage) => void };
}

function startState(fate: FateScript, beat: Beat): StageState {
  return {
    section: beat.section,
    beat: beat.index,
    setting: null,
    mood: null,
    curtain: "closed",
    dramatic: false,
    seal: false,
    rollCall: null,
    alive: fate.characters.map((c) => c.id),
    onStage: [],
    crowned: null,
  };
}

function single(fixture: StageFixture, beat: Beat, scene: SceneScript): Program {
  const before = startState(fixture.fate, beat);
  const segment: Segment = { key: `demo-${beat.index}`, beat: beat.index, section: beat.section, stateBefore: before, steps: null };
  segment.steps = compileBeat(fixture.fate, beat, scene, before);
  return { fate: fixture.fate, segments: [segment] };
}

/** A small scene where the first character performs `action`, so each catalog action can be checked. */
function actionDemo(action: Action): Demo {
  return {
    id: action,
    label: `Action: ${action}`,
    build: () => {
      const fixture = FIXTURES[15];
      const fate = fixture.fate;
      const template = fate.beats.find((b) => b.section === "act_2" && b.kind === "drama" && fate.beats.find((x) => x.section === "act_2")?.index !== b.index) ?? fate.beats[2];
      const [a, b, c] = fate.characters.filter((x) => x.kind === "participant").map((x) => x.id);
      const leaving = action === "fall" || action === "exit";
      const beat: Beat = {
        ...template,
        card: "demo",
        title: `Demo: ${action}`,
        setting: action === "fall" ? "battlefield" : action === "drink" ? "feast_hall" : "throne_room",
        roles: [{ role: "actor", character: a }, { role: "other", character: b }, { role: "witness", character: c }],
        eliminations: leaving ? [{ character: a, mode: action === "fall" ? "killed" : "exiled" }] : [],
        resurrections: [],
        dramatic: false,
        budget_seconds: 14,
      };
      const scene: SceneScript = {
        beat_index: beat.index,
        setting: beat.setting,
        music: action === "fall" ? "battle" : "intrigue",
        lines: [
          { speaker: b, emotion: "scheming", action: null, text: `Show us what you can do, ${fate.characters.find((x) => x.id === a)?.name}!` },
          { speaker: a, emotion: action === "fall" ? "terrified" : "furious", action: leaving ? null : action, text: `Watch closely: this is how one does "${action.replace("_", " ")}".` },
          { speaker: c, emotion: "terrified", action: null, text: "The whole court saw that. Nobody will believe it." },
        ],
        captions: [{ text: `A demonstration of the "${action}" action.`, before_line: 0 }],
        stage_directions: leaving ? [{ character: a, action, line: 1 }] : [],
        onomatopoeia: action === "strike" || action === "fall" ? [{ text: action === "fall" ? "SNAP!" : "KLANG!", line: 1 }] : [],
        cues: action === "strike" ? [{ sfx: "sword_clash", line: 1 }] : action === "fall" ? [{ sfx: "thud", line: 1 }] : [],
        panels: [
          { framing: "wide", ref_kind: "caption", ref_index: 0, focus: [] },
          { framing: "close_up", ref_kind: "line", ref_index: 1, focus: [a] },
          { framing: "medium", ref_kind: "line", ref_index: 2, focus: [c] },
        ],
        is_fallback: true,
        prompt_version: "demo",
      };
      return { fixture, program: single(fixture, beat, scene) };
    },
  };
}

function beatDemo(id: string, label: string, size: 6 | 15 | 40, pickBeat: (fate: FateScript) => Beat | undefined, tweak?: (beat: Beat, scene: SceneScript) => [Beat, SceneScript]): Demo {
  return {
    id,
    label,
    build: () => {
      const fixture = FIXTURES[size];
      const found = pickBeat(fixture.fate) ?? fixture.fate.beats[1];
      let beat = found;
      let scene = fixture.scenes[found.index];
      if (tweak) [beat, scene] = tweak(found, scene);
      return { fixture, program: single(fixture, beat, scene) };
    },
  };
}

function introDemo(size: 6 | 15 | 40): Demo {
  return {
    id: `cold-open-${size}`,
    label: `Cold open (${size})`,
    build: () => {
      const fixture = FIXTURES[size];
      const full = createProgram(fixture.fate, fixture.scenes);
      return { fixture, program: { fate: fixture.fate, segments: full.segments.slice(0, 2) } };
    },
  };
}

function showDemo(size: 6 | 15 | 40, trickle: boolean): Demo {
  return {
    id: `show-${size}${trickle ? "-trickle" : ""}`,
    label: trickle ? `Show (${size}), scenes arrive slowly` : `Full show (${size})`,
    build: () => {
      const fixture = FIXTURES[size];
      const program = createProgram(fixture.fate, trickle ? [] : fixture.scenes);
      const later = trickle
        ? (stage: MountedStage) => {
            fixture.scenes.forEach((scene, i) => window.setTimeout(() => stage.addScene(scene), 4000 + i * 2500));
          }
        : undefined;
      return { fixture, program, later };
    },
  };
}

const DEMOS: Demo[] = [
  ...ACTIONS.map(actionDemo),
  beatDemo("betrayal", "Betrayal panel break", 40, (f) => f.beats.find((b) => b.card === "knife_in_the_back") ?? f.beats.find((b) => b.dramatic && b.eliminations.length === 1)),
  beatDemo("plague", "Plague montage", 40, (f) => f.beats.find((b) => b.eliminations.length >= 2), (beat, scene) => [
    { ...beat, card: "grey_plague", title: "The Grey Plague", setting: "city_streets" },
    { ...scene, setting: "city_streets", music: "dread" },
  ]),
  beatDemo("battle-40", "Battle with 40 (fps check)", 40, (f) => f.beats.find((b) => b.kind === "crowd"), (beat, scene) => [
    { ...beat, setting: "battlefield", budget_seconds: 40 },
    { ...scene, setting: "battlefield", music: "battle" },
  ]),
  beatDemo("winter", "Winter scene (snow)", 15, (f) => f.beats.find((b) => b.setting === "ice_wall") ?? f.beats[3], (beat, scene) => [
    { ...beat, setting: "ice_wall" },
    { ...scene, setting: "ice_wall", music: "winter" },
  ]),
  introDemo(6),
  introDemo(15),
  introDemo(40),
  {
    id: "finale",
    label: "Coronation and credits",
    build: () => {
      const fixture = FIXTURES[15];
      const full = createProgram(fixture.fate, fixture.scenes);
      return { fixture, program: { fate: fixture.fate, segments: full.segments.slice(-2) } };
    },
  },
  {
    id: "interlude",
    label: "Delayed scene (interlude)",
    build: () => {
      const fixture = FIXTURES[6];
      const full = createProgram(fixture.fate, []);
      // Starts on a pending scene: the curtain stays closed with the interlude until it arrives.
      const program = { fate: fixture.fate, segments: full.segments.slice(2, 4) };
      return {
        fixture,
        program,
        later: (stage) => {
          window.setTimeout(() => stage.addScene(fixture.scenes[1]), 6000);
          window.setTimeout(() => stage.addScene(fixture.scenes[2]), 9000);
        },
      };
    },
  },
  showDemo(6, false),
  showDemo(15, false),
  showDemo(40, false),
  showDemo(15, true),
];

/** /dev/stage: plays isolated scenes, one per action, plus the set pieces, for visual checks. */
export function renderStageDev(root: HTMLElement): () => void {
  const params = new URLSearchParams(location.search);
  const host = el("div", { class: "stage-dev-host" });
  const meter = el("div", { class: "stage-dev-meter", "data-testid": "fps" }, "fps: -");
  const log = el("ol", { class: "stage-dev-log" });
  const list = el("nav", { class: "stage-dev-list" });
  let mounted: MountedStage | null = null;
  let minFps = Infinity;
  // Debug handle for measuring sound against lettering from the browser console or Playwright.
  Object.assign(window, { __btAudio: sharedEngine() });

  const play = (demo: Demo) => {
    mounted?.destroy();
    log.replaceChildren();
    minFps = Infinity;
    const built = demo.build();
    const speed = Number(params.get("speed")) || undefined;
    mounted = mountStage(host, {
      fate: built.fixture.fate,
      program: built.program,
      texts: { bible: built.fixture.bible, chronicle: built.fixture.chronicle, reveal: async () => ({ seed: built.fixture.seed, seed_mode: "auto", engine_version: built.fixture.fate.engine_version, seal: built.fixture.fate.seal }) },
      speed,
      maxSpeed: 10,
    });
    mounted.player.bus.on("step:start", ({ step }) => {
      log.append(el("li", {}, `${step.kind}${step.kind === "line" ? `: ${step.text.slice(0, 40)}` : step.kind === "action" ? `: ${step.action}` : ""}`));
      log.scrollTop = log.scrollHeight;
    });
    mounted.player.bus.on("show:end", () => log.append(el("li", { class: "end" }, "show:end")));
    built.later?.(mounted);
    void mounted.player.run();
    history.replaceState({}, "", `/dev/stage?demo=${demo.id}${speed ? `&speed=${speed}` : ""}`);
    for (const b of list.querySelectorAll("button")) b.classList.toggle("active", b.dataset.demo === demo.id);
  };

  for (const demo of DEMOS) {
    const b = el("button", { type: "button", "data-demo": demo.id }, demo.label);
    b.addEventListener("click", () => {
      unlockAudio();
      play(demo);
    });
    list.append(b);
  }

  const timer = window.setInterval(() => {
    if (!mounted) return;
    const { fps, quality, count } = mounted.renderer.particles;
    if (!mounted.player.paused) minFps = Math.min(minFps, fps);
    meter.textContent = `fps ${fps.toFixed(0)} (min ${Number.isFinite(minFps) ? minFps.toFixed(0) : "-"}) · particles ${count} · quality ${quality.toFixed(2)}`;
  }, 500);

  root.replaceChildren(el("div", { class: "stage-dev" }, el("aside", {}, el("h1", {}, "Stage demos"), list, meter, log), host));
  play(DEMOS.find((d) => d.id === params.get("demo")) ?? DEMOS[0]);

  return () => {
    window.clearInterval(timer);
    mounted?.destroy();
  };
}
