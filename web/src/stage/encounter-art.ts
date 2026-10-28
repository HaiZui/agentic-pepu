import { renderDragon } from "../render/dragon";
import { g } from "../render/svg";
import { FLOOR, FORE_SCALE } from "../shared/panels";
import { puppetNode } from "./actors";
import type { CastSheet } from "./cast";
import { DRAGON_X, HERO_X, type Encounter } from "./encounter";

export function encounterArt(encounter: Encounter, cast: CastSheet): SVGGElement {
  const root = g({ "data-encounter": encounter.phase, "data-outcome": encounter.outcome });
  const dragon = renderDragon(encounter.phase === "resolved" && encounter.outcome === "victory");
  dragon.setAttribute("transform", `translate(${DRAGON_X} ${FLOOR}) scale(1.05)`);
  root.append(dragon);
  if (encounter.phase === "resolved" && encounter.outcome !== "victory") {
    const { node } = puppetNode(cast, encounter.hero, "dead", false);
    node.setAttribute("data-fallen-hero", encounter.hero);
    node.setAttribute("transform", `translate(${HERO_X + 100} ${FLOOR - 25}) rotate(-82) scale(${FORE_SCALE})`);
    root.append(node);
  }
  return root;
}
