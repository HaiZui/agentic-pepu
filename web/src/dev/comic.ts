import { showComic } from "../comic/page";
import { FIXTURES } from "../stage/fixtures";
import type { SceneScript } from "../stage/types";

/** A 24-character Finnish name and a 140-character line: the worst case for balloon fitting. */
export const WORST_NAME = "Jääskeläinen-Äyräpäänsuu";
export const WORST_LINE =
  "Kuulkaa nyt kaikki: minä, ylpeä talonpoika, vannon että tämä pullo on minun ennen kuin kukko laulaa, vaikka koko valtakunta nousisi vastaan!";

/** /dev/comic?fixture=6|15|40[&worst=1]: the comic of a fixture show, for visual and layout checks. */
export async function renderComicDev(root: HTMLElement): Promise<void> {
  const params = new URLSearchParams(location.search);
  const size = (Number(params.get("fixture")) || 15) as 6 | 15 | 40;
  const fixture = structuredClone(FIXTURES[size] ?? FIXTURES[15]);
  const scenes: SceneScript[] = fixture.scenes;
  if (params.get("worst")) {
    // Rename a peasant and give them the longest allowed line in every scene they speak in.
    const hero = fixture.fate.characters.find((c) => c.kind === "participant" && scenes.some((s) => s.lines.some((l) => l.speaker === c.id)))!;
    hero.name = WORST_NAME;
    for (const scene of scenes) for (const line of scene.lines) if (line.speaker === hero.id) line.text = WORST_LINE;
  }
  await showComic(root, {
    fate: fixture.fate,
    scenes,
    chronicle: fixture.chronicle,
    bible: fixture.bible,
    reveal: { seed: fixture.seed, seed_mode: fixture.fate.seed_mode, engine_version: fixture.fate.engine_version, seal: fixture.fate.seal },
    createdAt: "2026-10-30T15:04:00",
    attributions: params.get("attribution") ? ['"Raven" by A. Recordist, CC BY 4.0'] : [],
    storyline: params.get("nostory") ? null : fixture.storyline,
  });
}
