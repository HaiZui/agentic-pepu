import { montageStampTimes, MOMENT, STAMP_LAND } from "../stage/timing";
import type { MusicMood, SfxCue, StageState, Step } from "../stage/types";

/** Runtime lists of the catalog ids (checked against the API contract by the asset test). */
export const MOODS: readonly MusicMood[] = ["overture", "intrigue", "feast", "battle", "dread", "winter", "sorrow", "triumph"];
export const CUES: readonly SfxCue[] = [
  "curtain", "gong", "sword_draw", "sword_clash", "shink", "thud", "crowd_gasp", "crowd_cheer", "thunder", "wind",
  "fire_whoosh", "goblet_clink", "gulp", "bell_toll", "horn", "raven", "splash", "dragon_roar", "heartbeat", "choir",
];
export const STINGERS = ["curtain", "roll_call", "elimination", "coronation"] as const;

/** Every sound the show can ask for, as asset stems under /audio. */
export const REQUIRED_STEMS: readonly string[] = [
  ...MOODS.map((m) => `music/${m}`),
  ...CUES.map((c) => `sfx/${c}`),
  ...STINGERS.map((s) => `stingers/${s}`),
];

export interface Scheduled {
  key: string;
  /** Show seconds (1x) after the step starts. */
  at: number;
}

const CURTAIN_CLOSE: Scheduled = { key: "sfx/curtain", at: 0 };

/** Fixed sounds that belong to the stage itself rather than to the scene script. */
export function stingersFor(step: Step, previous: StageState): Scheduled[] {
  switch (step.kind) {
    case "curtain":
      return step.open ? [{ key: "stingers/curtain", at: MOMENT.curtainOpens }] : [CURTAIN_CLOSE];
    case "roll_call":
      return [{ key: "stingers/roll_call", at: MOMENT.rollCallBanner }];
    case "title_card":
    case "credits":
    case "interlude":
      return [CURTAIN_CLOSE];
    case "scenery_change":
      // A fresh act opens with the full curtain fanfare; scene changes within an act just rustle.
      return previous.curtain === "closed" ? [{ key: "stingers/curtain", at: 0 }] : [CURTAIN_CLOSE];
    case "action": {
      const eliminated = previous.alive.includes(step.character) && !step.stateAfter.alive.includes(step.character);
      if (!eliminated) return [];
      return [{ key: "stingers/elimination", at: step.action === "fall" ? MOMENT.rodSnap : MOMENT.actionStart }];
    }
    case "montage":
      return montageStampTimes(step.durationAt1x, step.victims.length, step.summary !== null).map((at) => ({ key: "stingers/elimination", at }));
    case "stamp":
      return [{ key: step.announcement.kind === "return" ? "sfx/choir" : "sfx/thud", at: STAMP_LAND }];
    case "coronation":
      return [{ key: "stingers/coronation", at: MOMENT.coronationName - 0.5 }];
    default:
      return [];
  }
}
