import type { components } from "../api/schema";

type Schemas = components["schemas"];

export type FateScript = Schemas["FateScript"];
export type Beat = Schemas["Beat"];
export type Character = Schemas["Character"];
export type SceneScript = Schemas["SceneScript"];
export type Section = Beat["section"];
export type SettingId = Beat["setting"];
export type Emotion = Schemas["Line"]["emotion"];
export type Action = NonNullable<Schemas["Line"]["action"]>;
export type MusicMood = SceneScript["music"];
export type Framing = Schemas["PanelMoment"]["framing"];
export type SfxCue = Schemas["Cue"]["sfx"];
export type EliminationMode = Schemas["Elimination"]["mode"];

/** Where a character stands: one of up to six foreground slots, or the smaller background crowd. */
export interface Placement {
  id: string;
  layer: "fore" | "back";
  /** Stage x in the 1920-wide logical canvas. */
  x: number;
  emotion: Emotion;
}

/** Everything the stage needs to redraw a moment instantly, without replaying animation. */
export interface StageState {
  section: Section | "credits";
  beat: number | null;
  setting: SettingId | null;
  mood: MusicMood | null;
  curtain: "open" | "closed";
  /** Letterbox bars for dramatic beats. */
  dramatic: boolean;
  /** Small Seal of Fate emblem in the corner during the cold open. */
  seal: boolean;
  /** House group currently standing for the roll call. */
  rollCall: { house: string | null; members: string[] } | null;
  alive: string[];
  onStage: Placement[];
  crowned: string | null;
}

export interface Camera {
  framing: Framing;
  focus: string[];
}

export interface PanelShot {
  framing: Framing;
  focus: string[];
  setting: SettingId;
  placements: Placement[];
  text: string | null;
  /** Speaker id for a line, null for a caption. */
  speaker: string | null;
  sound: string | null;
}

export type StepBody =
  | { kind: "curtain"; open: boolean }
  | { kind: "seal" }
  | { kind: "old_king"; character: string }
  | { kind: "roll_call"; house: string | null; members: string[] }
  | { kind: "title_card"; act: 1 | 2 | 3 }
  | { kind: "scenery_change"; setting: SettingId; mood: MusicMood; title: string }
  | { kind: "enter"; characters: string[] }
  | {
      kind: "line";
      line: number;
      speaker: string;
      emotion: Emotion;
      text: string;
      /** Non-final gestures that play during the line (speaker's action and stage directions). */
      gestures: { character: string; action: Action }[];
      cues: SfxCue[];
      sounds: string[];
      camera: Camera | null;
      readSeconds: number;
      /** Music cuts to silence this long before the line's first impact cue (dramatic beats only). */
      preSilenceMs?: number;
    }
  | { kind: "caption"; text: string; readSeconds: number }
  | { kind: "action"; character: string; action: Action }
  | { kind: "panel_break"; panels: PanelShot[]; sounds: string[] }
  | { kind: "montage"; victims: { id: string; mode: EliminationMode }[] }
  | { kind: "tableau" }
  | { kind: "coronation"; winner: string }
  | { kind: "credits" }
  | { kind: "interlude" };

export type Step = StepBody & {
  /** Beat index the step belongs to; null for the cold-open intro and the credits. */
  beat: number | null;
  section: Section | "credits";
  durationAt1x: number;
  stateAfter: StageState;
};

export type StepKind = Step["kind"];

export interface Segment {
  key: string;
  beat: number | null;
  section: Section | "credits";
  /** Fate-only state at the segment start; valid whether or not the scene has arrived. */
  stateBefore: StageState;
  /** Null while the beat's scene script is still pending. */
  steps: Step[] | null;
}
