import show15 from "../../../tests/fixtures/stage/show-15.json";
import show40 from "../../../tests/fixtures/stage/show-40.json";
import show6 from "../../../tests/fixtures/stage/show-6.json";
import dragonVictory from "../../../tests/fixtures/stage/dragon-victory.json";
import dragonSlaying from "../../../tests/fixtures/stage/dragon-dragon_slaying.json";
import dragonAccident from "../../../tests/fixtures/stage/dragon-sword_accident.json";
import type { DragonOutcome } from "./encounter";
import type { ChronicleTexts, ShowBible } from "../api/client";
import type { FateScript, SceneScript, Storyline } from "./types";

/** Deterministic all-fallback shows written by scripts/gen_stage_fixtures.py. */
export interface StageFixture {
  seed: string;
  fate: FateScript;
  storyline: Storyline;
  scenes: SceneScript[];
  bible: ShowBible;
  chronicle: ChronicleTexts;
}

export const FIXTURES: Record<6 | 15 | 40, StageFixture> = {
  6: show6 as unknown as StageFixture,
  15: show15 as unknown as StageFixture,
  40: show40 as unknown as StageFixture,
};

export const DRAGON_FIXTURES: Record<DragonOutcome, StageFixture> = {
  victory: dragonVictory as unknown as StageFixture,
  dragon_slaying: dragonSlaying as unknown as StageFixture,
  sword_accident: dragonAccident as unknown as StageFixture,
};
