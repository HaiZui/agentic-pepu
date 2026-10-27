import show15 from "../../../tests/fixtures/stage/show-15.json";
import show40 from "../../../tests/fixtures/stage/show-40.json";
import show6 from "../../../tests/fixtures/stage/show-6.json";
import type { ChronicleTexts, ShowBible } from "../api/client";
import type { FateScript, SceneScript } from "./types";

/** Deterministic all-fallback shows written by scripts/gen_stage_fixtures.py. */
export interface StageFixture {
  seed: string;
  fate: FateScript;
  scenes: SceneScript[];
  bible: ShowBible;
  chronicle: ChronicleTexts;
}

export const FIXTURES: Record<6 | 15 | 40, StageFixture> = {
  6: show6 as unknown as StageFixture,
  15: show15 as unknown as StageFixture,
  40: show40 as unknown as StageFixture,
};
