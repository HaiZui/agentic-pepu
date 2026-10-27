import type { HouseId } from "./catalog";
import { papered } from "./defs";
import { cutPath, ellipsePoints, type Point } from "./geometry";
import { HOUSE_COLORS } from "./palette";
import { Rng } from "./prng";
import { g, path, s } from "./svg";

/** Each sigil is drawn in a 100x100 box centred on (0, 0). */
const SIGILS: Record<HouseId, (fill: string, rng: Rng) => SVGElement[]> = {
  wolf: (fill, rng) => [
    path(cutPath([[-30, -40], [-14, -18], [14, -18], [30, -40], [32, -6], [20, 22], [6, 40], [-6, 40], [-20, 22], [-32, -6]], rng), "ink", { fill }),
    path("M-14 0 l8 4 M14 0 l-8 4", "line"),
    path(cutPath([[-6, 30], [6, 30], [0, 38]], null), "ink-fill"),
  ],
  eel: (fill, rng) => [
    path(cutPath([[-44, 8], [-30, -14], [-12, -2], [4, -20], [22, -6], [40, -22], [46, -10], [24, 8], [6, -6], [-12, 12], [-30, 2], [-38, 18]], rng), "ink", { fill }),
    s("circle", { cx: 40, cy: -16, r: 2.5, class: "ink-fill" }),
  ],
  goat: (fill, rng) => [
    path(cutPath([[-14, -20], [14, -20], [18, 6], [8, 34], [-8, 34], [-18, 6]], rng), "ink", { fill }),
    path("M-12 -18 C-30 -40 -44 -30 -40 -6", "line", { "stroke-width": 6 }),
    path("M12 -18 C30 -40 44 -30 40 -6", "line", { "stroke-width": 6 }),
    path(cutPath([[-6, 34], [6, 34], [0, 48]], null), "ink-fill"),
  ],
  raven: (fill, rng) => [
    path(cutPath([[-40, 10], [-10, -10], [6, -30], [20, -30], [30, -22], [46, -20], [28, -12], [22, 6], [40, 30], [10, 18], [-20, 28]], rng), "ink", { fill }),
    s("circle", { cx: 18, cy: -24, r: 2.5, class: "white" }),
  ],
  boar: (fill, rng) => [
    path(cutPath([[-40, -6], [-24, -30], [10, -34], [30, -20], [42, -6], [44, 12], [26, 20], [-20, 20], [-36, 12]], rng), "ink", { fill }),
    path("M36 8 q10 -14 2 -26", "line", { stroke: "#fffaf0", "stroke-width": 4 }),
    s("circle", { cx: 26, cy: -12, r: 2.5, class: "white" }),
  ],
  stag: (fill, rng) => [
    path(cutPath([[-12, -10], [12, -10], [14, 18], [4, 40], [-4, 40], [-14, 18]], rng), "ink", { fill }),
    path("M-10 -10 L-26 -40 M-20 -28 L-36 -30 M-24 -36 L-30 -48 M10 -10 L26 -40 M20 -28 L36 -30 M24 -36 L30 -48", "line", { "stroke-width": 5 }),
  ],
  owl: (fill, rng) => [
    path(cutPath(ellipsePoints(0, 6, 30, 38, 16), rng), "ink", { fill }),
    path(cutPath([[-30, -24], [-20, -40], [-8, -26], [8, -26], [20, -40], [30, -24]], rng), "ink", { fill }),
    s("circle", { cx: -12, cy: -6, r: 9, class: "white ink-thin" }),
    s("circle", { cx: 12, cy: -6, r: 9, class: "white ink-thin" }),
    s("circle", { cx: -12, cy: -6, r: 3.5, class: "ink-fill" }),
    s("circle", { cx: 12, cy: -6, r: 3.5, class: "ink-fill" }),
  ],
  crab: (fill, rng) => [
    path(cutPath(ellipsePoints(0, 10, 28, 18, 14), rng), "ink", { fill }),
    path(cutPath([[-30, -2], [-44, -30], [-34, -38], [-30, -24], [-22, -32]], rng), "ink", { fill }),
    path(cutPath([[30, -2], [44, -30], [34, -38], [30, -24], [22, -32]], rng), "ink", { fill }),
    path("M-24 22 l-14 12 M-14 26 l-8 14 M24 22 l14 12 M14 26 l8 14", "line"),
  ],
};

export function renderSigil(house: HouseId, fill?: string): SVGGElement {
  const color = fill ?? HOUSE_COLORS[house].secondary;
  return g({ "data-sigil": house }, ...SIGILS[house](color, new Rng(`sigil:${house}`)));
}

/** Round badge with the sigil, for chests and name cards. `size` is the diameter. */
export function renderSigilBadge(house: HouseId, cx: number, cy: number, size: number): SVGGElement {
  const { primary, secondary } = HOUSE_COLORS[house];
  const scale = size / 120;
  return g(
    { transform: `translate(${cx} ${cy}) scale(${scale})`, "data-badge": house },
    s("circle", { r: 58, fill: secondary, class: "ink" }),
    s("circle", { r: 50, fill: primary }),
    renderSigil(house, secondary),
  );
}

/** Swallow-tailed house banner on a pole; the pole top is at (0, 0) and the banner hangs below. */
export function renderBanner(house: HouseId, height = 260): SVGGElement {
  const { primary, secondary } = HOUSE_COLORS[house];
  const rng = new Rng(`banner:${house}`);
  const w = height * 0.42;
  const cloth: Point[] = [[-w / 2, 12], [w / 2, 12], [w / 2, height], [0, height - w * 0.45], [-w / 2, height]];
  return g(
    { "data-banner": house },
    path(cutPath([[-w / 2 - 14, 4], [w / 2 + 14, 4], [w / 2 + 14, 12], [-w / 2 - 14, 12]], rng, 0.5), "wood ink"),
    papered(cutPath(cloth, rng), "banner-cloth", { fill: primary }),
    path(cutPath([[-w / 2, 12], [w / 2, 12], [w / 2, 30], [-w / 2, 30]], rng, 0.5), "ink-thin", { fill: secondary }),
    g({ transform: `translate(0 ${height * 0.42}) scale(${(w * 0.8) / 100})` }, renderSigil(house, secondary)),
  );
}
