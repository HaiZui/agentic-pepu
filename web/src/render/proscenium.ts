import { papered } from "./defs";
import { cutPath, type Point } from "./geometry";
import { COMIC } from "./palette";
import { Rng } from "./prng";
import { STAGE_HEIGHT, STAGE_WIDTH } from "./scenery";
import { g, path, s } from "./svg";

const HALF = STAGE_WIDTH / 2;
const VALANCE = 96;
const APRON_TOP = STAGE_HEIGHT - 44;
const GATHERED = 0.14;

export interface Proscenium {
  root: SVGGElement;
  /** 0 = closed (curtains meet in the middle), 1 = fully open. */
  setCurtains(openness: number): void;
}

function curtain(rng: Rng, side: "left" | "right"): SVGGElement {
  const x0 = side === "left" ? 0 : HALF - 20;
  const width = HALF + 20;
  const folds = 9;
  const foldWidth = width / folds;
  const pieces: SVGElement[] = [
    papered(cutPath([[x0, 0], [x0 + width, 0], [x0 + width, STAGE_HEIGHT], [x0, STAGE_HEIGHT]], rng, 1.5), "curtain", { fill: COMIC.red }),
  ];
  for (let i = 0; i < folds; i++) {
    const x = x0 + i * foldWidth;
    const shadow: Point[] = [[x + foldWidth * 0.55, 0], [x + foldWidth, 0], [x + foldWidth, STAGE_HEIGHT], [x + foldWidth * 0.6, STAGE_HEIGHT]];
    pieces.push(path(cutPath(shadow, null), "ink-thin", { fill: COMIC.darkRed, opacity: 0.55 }));
    pieces.push(path(cutPath(shadow, null), "halftone"));
  }
  return g({ "data-part": side === "left" ? "curtain-left" : "curtain-right" }, ...pieces);
}

function footlights(rng: Rng): SVGGElement {
  const lamps = Array.from({ length: 12 }, (_, i) => 120 + i * ((STAGE_WIDTH - 240) / 11));
  return g(
    { "data-part": "footlights" },
    ...lamps.map((x) => s("ellipse", { cx: x, cy: APRON_TOP - 6, rx: 90, ry: 46, fill: "url(#bt-footlight)", class: "footlight-glow" })),
    papered(cutPath([[0, APRON_TOP], [STAGE_WIDTH, APRON_TOP], [STAGE_WIDTH, STAGE_HEIGHT], [0, STAGE_HEIGHT]], rng, 1), "apron", { fill: COMIC.darkWood }),
    ...lamps.map((x) => path(cutPath([[x - 22, APRON_TOP + 4], [x + 22, APRON_TOP + 4], [x + 14, APRON_TOP - 14], [x - 14, APRON_TOP - 14]], rng, 0.6), "gold ink")),
  );
}

function valance(rng: Rng): SVGGElement {
  const scallops = 16;
  const w = STAGE_WIDTH / scallops;
  const edge: Point[] = [[0, 0], [STAGE_WIDTH, 0], [STAGE_WIDTH, VALANCE - 30]];
  for (let i = scallops; i > 0; i--) {
    const x = i * w;
    edge.push([x - w * 0.25, VALANCE], [x - w * 0.5, VALANCE + 10], [x - w * 0.75, VALANCE], [x - w, VALANCE - 30]);
  }
  return g(
    { "data-part": "valance" },
    papered(cutPath(edge, rng, 1), "valance", { fill: COMIC.red }),
    path(cutPath([[0, VALANCE - 50], [STAGE_WIDTH, VALANCE - 50], [STAGE_WIDTH, VALANCE - 36], [0, VALANCE - 36]], rng, 0.6), "gold ink-thin"),
  );
}

/** Theater frame with curtains, valance, side pillars and footlights over a 16:9 stage. */
export function renderProscenium(): Proscenium {
  const rng = new Rng("proscenium");
  const left = curtain(rng, "left");
  const right = curtain(rng, "right");
  const root = g(
    { class: "proscenium paper", "data-curtains": "closed" },
    left,
    right,
    path(cutPath([[0, 0], [36, 0], [36, STAGE_HEIGHT], [0, STAGE_HEIGHT]], rng, 0.8), "gold ink"),
    path(cutPath([[STAGE_WIDTH - 36, 0], [STAGE_WIDTH, 0], [STAGE_WIDTH, STAGE_HEIGHT], [STAGE_WIDTH - 36, STAGE_HEIGHT]], rng, 0.8), "gold ink"),
    valance(rng),
    footlights(rng),
  );

  const setCurtains = (openness: number) => {
    const o = Math.min(1, Math.max(0, openness));
    const scale = 1 - o * (1 - GATHERED);
    left.setAttribute("transform", `scale(${scale} 1)`);
    right.setAttribute("transform", `translate(${STAGE_WIDTH} 0) scale(${scale} 1) translate(${-STAGE_WIDTH} 0)`);
    root.setAttribute("data-curtains", o === 0 ? "closed" : o === 1 ? "open" : "moving");
  };
  setCurtains(0);
  return { root, setCurtains };
}
