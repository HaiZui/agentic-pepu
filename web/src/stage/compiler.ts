import { ensureForeground, initialBlocking, layoutBackground, MAX_FOREGROUND } from "./blocking";
import { DURATION, MAX_STRETCH, readingSeconds } from "./timing";
import type {
  Action,
  Beat,
  Camera,
  EliminationMode,
  Emotion,
  FateScript,
  PanelShot,
  SceneScript,
  Section,
  Segment,
  SfxCue,
  StageState,
  Step,
  StepBody,
} from "./types";

export const NARRATOR = "narrator";
/** Actions after which the figure is no longer on stage. */
export const LEAVING_ACTIONS: readonly Action[] = ["fall", "exit", "flee"];
/** Cues that hit hard: the stage shakes, and on dramatic beats the music falls silent before the first one. */
export const IMPACT_CUES: readonly SfxCue[] = ["sword_clash", "shink", "thud", "thunder", "dragon_roar", "gong"];
export const PRE_SILENCE_MS = 500;
const SECTION_RANK: Record<Section | "credits", number> = {
  cold_open: 0,
  act_1: 1,
  act_2: 2,
  act_3: 3,
  coronation: 4,
  credits: 5,
};
const ACT: Partial<Record<Section, 1 | 2 | 3>> = { act_1: 1, act_2: 2, act_3: 3 };
const OLD_KING_SIDE_X = 960;

export const sectionRank = (section: Section | "credits") => SECTION_RANK[section];

export interface Program {
  fate: FateScript;
  segments: Segment[];
}

function cloneState(state: StageState): StageState {
  return {
    ...state,
    alive: [...state.alive],
    onStage: state.onStage.map((p) => ({ ...p })),
    rollCall: state.rollCall && { house: state.rollCall.house, members: [...state.rollCall.members] },
  };
}

class Writer {
  readonly steps: Step[] = [];
  state: StageState;

  constructor(
    before: StageState,
    private readonly beat: number | null,
    private readonly section: Section | "credits",
  ) {
    this.state = cloneState(before);
  }

  push(body: StepBody, durationAt1x: number, mutate?: (state: StageState) => void): Step {
    const next = cloneState(this.state);
    mutate?.(next);
    this.state = next;
    const step = { ...body, beat: this.beat, section: this.section, durationAt1x, stateAfter: next } as Step;
    this.steps.push(step);
    return step;
  }
}

/** Alive character ids before each beat, plus one final entry after the last beat. */
export function aliveTimeline(fate: FateScript): string[][] {
  let alive = fate.characters.map((c) => c.id);
  const timeline = [alive];
  for (const beat of fate.beats) {
    const out = new Set(beat.eliminations.map((e) => e.character));
    alive = [...alive.filter((id) => !out.has(id)), ...beat.resurrections.filter((id) => !alive.includes(id))];
    timeline.push(alive);
  }
  return timeline;
}

function emptyState(section: Section | "credits", beat: number | null, alive: string[]): StageState {
  return {
    section,
    beat,
    setting: null,
    mood: null,
    curtain: "closed",
    dramatic: false,
    seal: false,
    rollCall: null,
    alive: [...alive],
    onStage: [],
    crowned: null,
  };
}

/** Roll-call groups: one per house in fate order, or a single group when the roster has no houses. */
export function rollCallGroups(fate: FateScript): { house: string | null; members: string[] }[] {
  if (fate.houses.length > 0) return fate.houses.map((h) => ({ house: h.id, members: [...h.members] }));
  return [{ house: null, members: fate.characters.filter((c) => c.kind === "participant").map((c) => c.id) }];
}

function compileIntro(fate: FateScript, before: StageState): Step[] {
  const w = new Writer(before, null, "cold_open");
  w.push({ kind: "curtain", open: true }, DURATION.curtain, (s) => {
    s.curtain = "open";
    s.setting = "throne_room";
    s.mood = "overture";
  });
  w.push({ kind: "seal" }, DURATION.seal, (s) => (s.seal = true));
  w.push({ kind: "old_king", character: fate.old_king }, DURATION.oldKing, (s) => {
    s.onStage = [{ id: fate.old_king, layer: "fore", x: OLD_KING_SIDE_X, emotion: "smug" }];
  });
  const groups = rollCallGroups(fate);
  for (const group of groups) {
    w.push(
      { kind: "roll_call", house: group.house, members: group.members },
      DURATION.rollCallBase + DURATION.rollCallMember(group.members.length, fate.roster_size),
      (s) => {
        s.onStage = [];
        s.rollCall = { house: group.house, members: group.members };
      },
    );
  }
  return w.steps;
}

export function introSeconds(fate: FateScript): number {
  return compileIntro(fate, emptyState("cold_open", null, [])).reduce((t, s) => t + s.durationAt1x, 0);
}

const isLeaving = (action: Action | null | undefined): action is Action => !!action && LEAVING_ACTIONS.includes(action);

interface Moment {
  character: string;
  action: Action;
}

/** Compiles one beat's scene into steps, starting from the fate-only state before the beat. */
export function compileBeat(fate: FateScript, beat: Beat, scene: SceneScript, before: StageState): Step[] {
  const w = new Writer(before, beat.index, beat.section);
  const known = new Set(fate.characters.map((c) => c.id));
  const aliveStart = [...before.alive, ...beat.resurrections.filter((id) => !before.alive.includes(id))];
  const eliminated = new Map<string, EliminationMode>(beat.eliminations.map((e) => [e.character, e.mode]));
  const lines = scene.lines;

  const act = ACT[beat.section];
  const firstOfSection = fate.beats.find((b) => b.section === beat.section)?.index === beat.index;
  if (act && firstOfSection) {
    w.push({ kind: "title_card", act }, DURATION.titleCard, (s) => {
      s.curtain = "closed";
      s.onStage = [];
      s.rollCall = null;
      s.seal = false;
      s.dramatic = false;
    });
  }
  const curtainWasClosed = w.state.curtain === "closed" || w.state.rollCall !== null;
  w.push(
    { kind: "scenery_change", setting: beat.setting, mood: scene.music, title: beat.title },
    DURATION.sceneryChange + (curtainWasClosed ? 0.8 : 0),
    (s) => {
      s.setting = beat.setting;
      s.mood = scene.music;
      s.curtain = "open";
      s.onStage = [];
      s.rollCall = null;
      s.seal = false;
      s.dramatic = beat.dramatic;
      s.alive = aliveStart;
    },
  );

  // Who appears: roles, speakers and directed characters; crowd beats bring every surviving peasant.
  const ghosts = new Set<string>();
  const moments: Moment[][] = lines.map((line, i) => [
    ...(line.action && line.speaker !== NARRATOR ? [{ character: line.speaker, action: line.action }] : []),
    ...scene.stage_directions.filter((d) => d.line === i).map((d) => ({ character: d.character, action: d.action })),
  ]);
  const needs: string[][] = lines.map((line, i) =>
    [...new Set([...(line.speaker !== NARRATOR ? [line.speaker] : []), ...moments[i].map((m) => m.character)])].filter((id) =>
      known.has(id),
    ),
  );
  const roles = beat.roles.map((r) => r.character);
  const present = [...new Set([...needs.flat(), ...roles])].filter((id) => known.has(id));
  for (const id of present) if (!aliveStart.includes(id)) ghosts.add(id);
  if (beat.kind === "crowd") {
    const participants = new Set(fate.characters.filter((c) => c.kind === "participant").map((c) => c.id));
    for (const id of aliveStart) if (participants.has(id) && !present.includes(id)) present.push(id);
  }
  const startEmotion = (id: string): Emotion => (ghosts.has(id) ? "dead" : "neutral");
  const nextNeedFrom = (from: number) => (id: string) => {
    const at = needs.findIndex((need, i) => i >= from && need.includes(id));
    return at < 0 ? Number.MAX_SAFE_INTEGER : at;
  };

  const captionsBefore = (i: number) => scene.captions.filter((c) => (i < lines.length ? c.before_line === i : c.before_line >= lines.length));
  const captionSnapshots = new Map<number, StageState>();
  const pushCaptions = (i: number) => {
    for (const caption of captionsBefore(i)) {
      const step = w.push({ kind: "caption", text: caption.text, readSeconds: readingSeconds(caption.text) }, 0);
      captionSnapshots.set(scene.captions.indexOf(caption), step.stateAfter);
    }
  };

  pushCaptions(0);
  if (present.length > 0) {
    const placements = initialBlocking(present, [...needs.flat(), ...roles], startEmotion);
    w.push({ kind: "enter", characters: placements.map((p) => p.id) }, DURATION.enter, (s) => (s.onStage = placements));
  }

  // Panel break and montage placement.
  const eliminationLine = lines.findIndex((_, i) => moments[i].some((m) => eliminated.has(m.character) && isLeaving(m.action)));
  const soundLine = scene.onomatopoeia.length > 0 ? Math.min(...scene.onomatopoeia.map((o) => o.line)) : -1;
  const refLine = (p: SceneScript["panels"][number]) =>
    p.ref_kind === "line" ? p.ref_index : (scene.captions[p.ref_index]?.before_line ?? 0) - 0.5;
  let breakAfter = beat.dramatic ? (eliminationLine >= 0 ? eliminationLine : soundLine >= 0 ? soundLine : lines.length - 1) : -2;
  if (beat.dramatic && scene.panels.filter((p) => refLine(p) <= breakAfter).length < 2) breakAfter = lines.length - 1;
  const useMontage = beat.eliminations.length >= 2;
  let montageDone = false;
  let breakDone = false;
  const lineSnapshots: StageState[] = [];

  const leave = (character: string, action: Action) => {
    const duration = action === "fall" ? DURATION.fall : DURATION.exit;
    w.push({ kind: "action", character, action }, duration, (s) => {
      s.onStage = s.onStage.filter((p) => p.id !== character);
      if (eliminated.has(character)) s.alive = s.alive.filter((id) => id !== character);
      layoutBackground(s.onStage);
    });
  };

  const montage = () => {
    montageDone = true;
    const victims = beat.eliminations.map((e) => ({ id: e.character, mode: e.mode }));
    w.push({ kind: "montage", victims }, DURATION.montageBase + DURATION.montagePerVictim * victims.length, (s) => {
      s.onStage = s.onStage.filter((p) => !eliminated.has(p.id));
      s.alive = s.alive.filter((id) => !eliminated.has(id));
      layoutBackground(s.onStage);
    });
  };

  const panelBreak = (upTo: number) => {
    breakDone = true;
    const chosen = scene.panels.filter((p) => refLine(p) <= upTo);
    const panels: PanelShot[] = (chosen.length >= 2 ? chosen : scene.panels).map((p) => {
      const isLine = p.ref_kind === "line";
      const snapshot = isLine ? lineSnapshots[p.ref_index] : captionSnapshots.get(p.ref_index);
      const line = isLine ? lines[p.ref_index] : undefined;
      let placements = (snapshot ?? w.state).onStage.map((x) => ({ ...x }));
      // A caption over the empty set borrows the cast of the first line as its establishing shot.
      if (placements.length === 0 && lineSnapshots[0]) placements = lineSnapshots[0].onStage.map((x) => ({ ...x }));
      return {
        framing: p.framing,
        focus: p.focus.filter((id) => placements.some((x) => x.id === id)),
        setting: beat.setting,
        placements,
        text: isLine ? (line?.text ?? null) : (scene.captions[p.ref_index]?.text ?? null),
        speaker: isLine && line ? line.speaker : null,
        sound: isLine ? (scene.onomatopoeia.find((o) => o.line === p.ref_index)?.text ?? null) : null,
      };
    });
    const sounds = scene.onomatopoeia.filter((o) => o.line <= upTo).map((o) => o.text);
    w.push(
      { kind: "panel_break", panels, sounds: sounds.length > 0 ? sounds : scene.onomatopoeia.map((o) => o.text) },
      DURATION.panelBreakBase + DURATION.panelBreakPerPanel * panels.length,
    );
  };

  const impactLine = beat.dramatic
    ? Math.min(...scene.cues.filter((c) => IMPACT_CUES.includes(c.sfx)).map((c) => c.line), Infinity)
    : -1;
  lines.forEach((line, i) => {
    if (i > 0) pushCaptions(i);
    const required = needs[i].filter((id) => w.state.onStage.some((p) => p.id === id) || !eliminatedEarlier(id));
    const panel = scene.panels.find((p) => p.ref_kind === "line" && p.ref_index === i);
    const camera: Camera | null = panel ? { framing: panel.framing, focus: panel.focus.filter((id) => known.has(id)) } : null;
    const step = w.push(
      {
        kind: "line",
        line: i,
        speaker: line.speaker,
        emotion: line.emotion,
        text: line.text,
        gestures: moments[i].filter((m) => !isLeaving(m.action)),
        cues: scene.cues.filter((c) => c.line === i).map((c) => c.sfx),
        sounds: scene.onomatopoeia.filter((o) => o.line === i).map((o) => o.text),
        camera,
        readSeconds: readingSeconds(line.text),
        ...(i === impactLine ? { preSilenceMs: PRE_SILENCE_MS } : {}),
      },
      0,
      (s) => {
        ensureForeground(s.onStage, required.slice(0, MAX_FOREGROUND), nextNeedFrom(i), startEmotion);
        const speaker = s.onStage.find((p) => p.id === line.speaker);
        if (speaker) speaker.emotion = line.emotion;
      },
    );
    lineSnapshots[i] = step.stateAfter;

    for (const m of moments[i].filter((x) => isLeaving(x.action))) {
      const pending = eliminated.has(m.character) && w.state.alive.includes(m.character);
      if (!pending && !w.state.onStage.some((p) => p.id === m.character)) continue;
      if (useMontage && eliminated.has(m.character)) {
        if (!montageDone) montage();
      } else {
        leave(m.character, m.action);
      }
    }
    if (i === breakAfter && !breakDone) panelBreak(i);
  });

  function eliminatedEarlier(id: string): boolean {
    return eliminated.has(id) && !w.state.alive.includes(id);
  }

  pushCaptions(lines.length);

  // Any elimination the scene did not stage still happens before the beat ends.
  const unstaged = beat.eliminations.filter((e) => w.state.alive.includes(e.character));
  if (useMontage && !montageDone && unstaged.length > 0) {
    montage();
  } else {
    for (const e of unstaged) leave(e.character, e.mode === "killed" ? "fall" : "exit");
  }
  if (beat.dramatic && !breakDone) panelBreak(lines.length);

  if (beat.card === "coronation") {
    w.push({ kind: "coronation", winner: fate.winner }, DURATION.coronation, (s) => {
      s.crowned = fate.winner;
      s.onStage = [{ id: fate.winner, layer: "fore", x: 960, emotion: "triumphant" }];
    });
  }

  const budget = beat.budget_seconds - (beat.section === "cold_open" ? introSeconds(fate) : 0);
  const slack = applyStretch(w.steps, budget);
  if (slack >= 0.5) {
    const at = w.steps.findIndex((s) => s.kind === "coronation");
    const index = at < 0 ? w.steps.length : at;
    const previous = w.steps[index - 1];
    w.steps.splice(index, 0, {
      kind: "tableau",
      beat: beat.index,
      section: beat.section,
      durationAt1x: round(Math.min(slack, DURATION.tableauMax)),
      stateAfter: cloneState(previous.stateAfter),
    });
  }
  return w.steps;
}

/** Hold lines longer when the scene is shorter than its budget; returns the time still unfilled. */
function applyStretch(steps: Step[], budget: number): number {
  // Captions are read at their natural pace; only dialogue is held longer.
  for (const step of steps) if (step.kind === "caption") step.durationAt1x = round(step.readSeconds);
  const reading = steps.reduce((t, s) => t + (s.kind === "line" ? s.readSeconds : 0), 0);
  const fixed = steps.reduce((t, s) => t + s.durationAt1x, 0);
  const stretch = reading > 0 ? Math.min(MAX_STRETCH, Math.max(1, (budget - fixed) / reading)) : 1;
  for (const step of steps) {
    if (step.kind === "line") step.durationAt1x = round(step.readSeconds * stretch);
  }
  return budget - fixed - reading * stretch;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

function compileCredits(fate: FateScript, before: StageState): Step[] {
  const w = new Writer(before, null, "credits");
  const participants = fate.characters.filter((c) => c.kind === "participant").length;
  w.push({ kind: "credits" }, DURATION.creditsBase + DURATION.creditsPerParticipant * participants, (s) => {
    s.section = "credits";
    s.beat = null;
    s.curtain = "closed";
    s.onStage = [];
    s.dramatic = false;
    s.crowned = fate.winner;
  });
  return w.steps;
}

/** Program skeleton: the intro and credits are compiled at once, beat segments wait for their scenes. */
export function createProgram(fate: FateScript, scenes: readonly (SceneScript | null | undefined)[] = []): Program {
  const alive = aliveTimeline(fate);
  const intro: Segment = {
    key: "intro",
    beat: null,
    section: "cold_open",
    stateBefore: emptyState("cold_open", null, alive[0]),
    steps: null,
  };
  intro.steps = compileIntro(fate, intro.stateBefore);
  const beats: Segment[] = fate.beats.map((beat) => ({
    key: `beat-${beat.index}`,
    beat: beat.index,
    section: beat.section,
    stateBefore: {
      ...emptyState(beat.section, beat.index, alive[beat.index]),
      setting: beat.index > 0 ? fate.beats[beat.index - 1].setting : "throne_room",
      curtain: "open",
    },
    steps: null,
  }));
  // The stage only shows the credits panel once the credits step has played.
  const creditsBefore = { ...emptyState("coronation", null, alive[fate.beats.length]), crowned: fate.winner };
  const credits: Segment = { key: "credits", beat: null, section: "credits", stateBefore: creditsBefore, steps: null };
  credits.steps = compileCredits(fate, creditsBefore);
  const program = { fate, segments: [intro, ...beats, credits] };
  scenes.forEach((scene) => scene && addScene(program, scene));
  return program;
}

/** Compiles a newly arrived scene into its segment. A delivered scene never changes, so this runs once. */
export function addScene(program: Program, scene: SceneScript): Segment | null {
  const segment = program.segments.find((s) => s.beat === scene.beat_index);
  const beat = program.fate.beats[scene.beat_index];
  if (!segment || !beat || segment.steps) return null;
  segment.steps = compileBeat(program.fate, beat, scene, segment.stateBefore);
  return segment;
}

export const allSteps = (program: Program): Step[] => program.segments.flatMap((s) => s.steps ?? []);

export const programSeconds = (program: Program): number => allSteps(program).reduce((t, s) => t + s.durationAt1x, 0);
