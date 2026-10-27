import type { Archetype, NpcRole } from "./catalog";
import { papered } from "./defs";
import { cutPath, ellipsePoints, type Point, translate } from "./geometry";
import { HAND_OFFSET, HEAD_CENTER, SHOULDER_LEFT, SHOULDER_RIGHT } from "./figure-parts";
import type { Rng } from "./prng";
import { g, path, s } from "./svg";

export function handPosition(side: "left" | "right"): Point {
  const [sx, sy] = side === "left" ? SHOULDER_LEFT : SHOULDER_RIGHT;
  const dx = side === "left" ? -HAND_OFFSET[0] : HAND_OFFSET[0];
  return [sx + dx, sy + HAND_OFFSET[1]];
}

/** Sleeve and hand hanging from a shoulder pivot. */
export function renderArm(side: "left" | "right", rng: Rng): SVGGElement[] {
  const [sx, sy] = side === "left" ? SHOULDER_LEFT : SHOULDER_RIGHT;
  const [hx, hy] = handPosition(side);
  const sleeve: Point[] = [
    [sx - 11, sy - 4],
    [sx + 11, sy - 4],
    [hx + 8, hy - 10],
    [hx - 8, hy - 10],
  ];
  return [
    papered(cutPath(sleeve, rng), "garment"),
    path(cutPath([[hx - 9, hy - 14], [hx + 9, hy - 14], [hx + 9, hy - 8], [hx - 9, hy - 8]], rng, 0.4), "trim ink-thin"),
    s("circle", { cx: hx, cy: hy, r: 8.5, class: "skin ink" }),
  ];
}

const at = (points: readonly Point[]) => translate(points, ...handPosition("right"));

const ACCESSORIES: Record<Archetype, (rng: Rng) => SVGElement[]> = {
  schemer: (rng) => [
    path(cutPath(at([[-3, -6], [3, -6], [2, -44], [0, -50], [-2, -44]]), rng, 0.3), "steel ink-thin"),
    path(cutPath(at([[-9, -8], [9, -8], [9, -3], [-9, -3]]), rng, 0.3), "gold ink-thin"),
  ],
  brute: (rng) => [
    papered(cutPath(at([[-5, 4], [5, 4], [16, -60], [12, -70], [-2, -66], [-6, -54]]), rng), "wood"),
    ...[[6, -50], [10, -60], [2, -58]].map(([x, y]) =>
      s("circle", { cx: handPosition("right")[0] + x, cy: handPosition("right")[1] + y, r: 2.2, class: "steel ink-thin" }),
    ),
  ],
  fool: (rng) => [
    papered(cutPath(at([[-4, -2], [4, -2], [10, -24], [18, -50], [8, -62], [-2, -50], [-8, -24]]), rng), "teal"),
    path(cutPath(at([[8, -62], [18, -74], [0, -70]]), rng, 0.4), "teal ink-thin"),
    s("circle", { cx: handPosition("right")[0] + 6, cy: handPosition("right")[1] - 48, r: 2, class: "ink-fill" }),
  ],
  zealot: (rng) => [
    path(cutPath(at([[-2.5, 40], [2.5, 40], [2.5, -96], [-2.5, -96]]), rng, 0.3), "wood ink-thin"),
    s("circle", { cx: handPosition("right")[0], cy: handPosition("right")[1] - 104, r: 14, class: "gold ink" }),
    ...Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      const [hx, hy] = handPosition("right");
      const cx = hx + Math.cos(a) * 20;
      const cy = hy - 104 + Math.sin(a) * 20;
      return s("circle", { cx, cy, r: 3, class: "gold ink-thin" });
    }),
  ],
  honorable: (rng) => [
    path(cutPath(at([[-3.5, -12], [3.5, -12], [3, -86], [0, -94], [-3, -86]]), rng, 0.3), "steel ink-thin"),
    path(cutPath(at([[-14, -14], [14, -14], [14, -8], [-14, -8]]), rng, 0.3), "gold ink-thin"),
    path(cutPath(at([[-3, -8], [3, -8], [3, 6], [-3, 6]]), rng, 0.3), "wood ink-thin"),
  ],
  coward: (rng) => [
    path(cutPath(at([[-2, 20], [2, 20], [2, -84], [-2, -84]]), rng, 0.3), "wood ink-thin"),
    papered(cutPath(at([[2, -84], [44, -78], [40, -66], [46, -54], [2, -58]]), rng), "white"),
  ],
  bard: (rng) => [
    path(cutPath(at([[-3, -20], [3, -20], [5, -74], [-1, -76]]), rng, 0.3), "wood ink-thin"),
    papered(cutPath(ellipsePoints(handPosition("right")[0] - 4, handPosition("right")[1] - 6, 16, 20, 16), rng), "wood"),
    s("circle", { cx: handPosition("right")[0] - 4, cy: handPosition("right")[1] - 8, r: 5, class: "ink-fill" }),
  ],
};

const ACCESSORY_SCALE = 1.5;

function scaledAtHand(...children: SVGElement[]): SVGGElement {
  const [hx, hy] = handPosition("right");
  return g(
    { transform: `translate(${hx} ${hy}) scale(${ACCESSORY_SCALE}) translate(${-hx} ${-hy})` },
    ...children,
  );
}

export function renderAccessory(archetype: Archetype, rng: Rng): SVGGElement {
  return g({ "data-part": "accessory", "data-accessory": archetype }, scaledAtHand(...ACCESSORIES[archetype](rng)));
}

export function renderScepter(rng: Rng): SVGGElement {
  return g(
    { "data-part": "accessory", "data-accessory": "scepter" },
    scaledAtHand(
      path(cutPath(at([[-3, 16], [3, 16], [3, -70], [-3, -70]]), rng, 0.3), "gold ink-thin"),
      s("circle", { cx: handPosition("right")[0], cy: handPosition("right")[1] - 78, r: 10, class: "red ink" }),
    ),
  );
}

const NPC_PROPS: Record<NpcRole, (rng: Rng) => SVGElement[]> = {
  guard: (rng) => [
    path(cutPath(at([[-2.5, 50], [2.5, 50], [2.5, -120], [-2.5, -120]]), rng, 0.3), "wood ink-thin"),
    path(cutPath(at([[-8, -118], [8, -118], [0, -148]]), rng, 0.4), "steel ink-thin"),
  ],
  adviser: (rng) => [
    papered(cutPath(at([[-6, -26], [8, -26], [8, 14], [-6, 14]]), rng), "bone"),
    path(cutPath(at([[-9, -30], [11, -30], [11, -24], [-9, -24]]), rng, 0.3), "wood ink-thin"),
  ],
  food_taster: (rng) => [
    papered(cutPath(at([[-12, -36], [12, -36], [8, -16], [3, -12], [3, 0], [9, 4], [-9, 4], [-3, 0], [-3, -12], [-8, -16]]), rng), "gold"),
  ],
  herald: (rng) => [
    papered(cutPath(at([[-3, -4], [3, -4], [6, -60], [16, -72], [-8, -72], [0, -60]]), rng), "gold"),
    papered(cutPath(at([[0, -40], [24, -40], [24, -22], [12, -28], [0, -22]]), rng), "red"),
  ],
  jester: (rng) => [
    path(cutPath(at([[-2.5, 10], [2.5, 10], [2.5, -60], [-2.5, -60]]), rng, 0.3), "wood ink-thin"),
    papered(cutPath(ellipsePoints(handPosition("right")[0], handPosition("right")[1] - 68, 9, 10, 12), rng), "skin"),
    path(cutPath(at([[-8, -76], [-16, -96], [0, -80], [16, -96], [8, -76]]), rng, 0.5), "red ink-thin"),
  ],
};

export function renderNpcProp(role: NpcRole, rng: Rng): SVGGElement {
  return g({ "data-part": "accessory", "data-accessory": role }, scaledAtHand(...NPC_PROPS[role](rng)));
}

/** Costume pieces drawn on the torso for NPC roles. */
export function renderNpcCostume(role: NpcRole, rng: Rng): SVGGElement | null {
  switch (role) {
    case "adviser":
      return g(
        {},
        path("M-24 -186 Q0 -140 24 -186", "line", { stroke: "#d4a326", "stroke-width": 5 }),
        s("circle", { cx: 0, cy: -158, r: 8, class: "gold ink-thin" }),
      );
    case "food_taster":
      return g({}, papered(cutPath([[-22, -150], [22, -150], [28, -20], [-28, -20]], rng), "white"));
    case "herald":
      return g(
        {},
        papered(cutPath([[-20, -188], [20, -188], [24, -14], [-24, -14]], rng), "red"),
        path(cutPath([[-6, -150], [6, -150], [6, -120], [-6, -120]], rng, 0.4), "gold ink-thin"),
      );
    default:
      return null;
  }
}

/** Two-pointed jester hat with bells, replacing hair. */
export function renderJesterHat(rng: Rng): SVGGElement {
  const [cx, cy] = HEAD_CENTER;
  return g(
    {},
    papered(cutPath([[cx - 44, cy - 10], [cx - 64, cy - 66], [cx - 30, cy - 40], [cx, cy - 56], [cx + 30, cy - 40], [cx + 64, cy - 66], [cx + 44, cy - 10]], rng), "red"),
    path(cutPath([[cx, cy - 56], [cx + 30, cy - 40], [cx + 64, cy - 66], [cx + 44, cy - 10], [cx, cy - 10]], rng), "yellow ink-thin"),
    s("circle", { cx: cx - 64, cy: cy - 66, r: 5, class: "gold ink-thin" }),
    s("circle", { cx: cx + 64, cy: cy - 66, r: 5, class: "gold ink-thin" }),
  );
}

export function renderCrown(rng: Rng, tilt = 0): SVGGElement {
  const [cx, cy] = HEAD_CENTER;
  const top = cy - 50;
  const points: Point[] = [
    [cx - 30, top + 16], [cx - 34, top - 18], [cx - 18, top - 4], [cx - 8, top - 26], [cx, top - 6],
    [cx + 8, top - 26], [cx + 18, top - 4], [cx + 34, top - 18], [cx + 30, top + 16],
  ];
  return g(
    { "data-part": "crown", transform: tilt ? `rotate(${tilt} ${cx} ${top})` : undefined },
    papered(cutPath(points, rng, 0.6), "gold"),
    s("circle", { cx: cx - 18, cy: top + 6, r: 3.5, class: "red ink-thin" }),
    s("circle", { cx, cy: top + 4, r: 4, class: "blue ink-thin" }),
    s("circle", { cx: cx + 18, cy: top + 6, r: 3.5, class: "red ink-thin" }),
  );
}

/** Royal cape behind the body. */
export function renderRoyalCape(rng: Rng): SVGGElement {
  return g({}, papered(cutPath([[-44, -192], [44, -192], [74, 6], [-74, 6]], rng), "red"));
}

/** Ermine collar over the shoulders. */
export function renderErmine(rng: Rng): SVGGElement {
  const collar = cutPath([[-46, -196], [46, -196], [42, -172], [0, -164], [-42, -172]], rng);
  return g(
    {},
    papered(collar, "white"),
    ...[[-30, -184], [-12, -176], [10, -178], [28, -184]].map(([x, y]) =>
      path(`M${x} ${y} l2 -5 l2 5 Z`, "ink-fill"),
    ),
  );
}
