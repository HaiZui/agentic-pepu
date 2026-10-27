import { cutPath, ellipsePoints, mirrorHalf, type Point, translate } from "./geometry";
import { papered } from "./defs";
import type { Rng } from "./prng";
import { g, path, s } from "./svg";

/** Puppet coordinate system: figure stands on y=0, head above, rod below. */
export const HEAD_CENTER: Point = [0, -240];
export const NECK: Point = [0, -198];
export const SHOULDER_LEFT: Point = [-34, -180];
export const SHOULDER_RIGHT: Point = [34, -180];
export const HAND_OFFSET: Point = [22, 84]; // hand position relative to its shoulder (mirrored on the left)
export const ROD_TOP = -24;
export const ROD_BOTTOM = 150;
export const PUPPET_VIEWBOX = "-120 -340 240 500";

const BODY_HALVES: readonly (readonly Point[])[] = [
  // tunic
  [[0, -194], [28, -194], [38, -180], [44, -110], [50, -24], [54, 0], [0, 0]],
  // robe
  [[0, -194], [26, -194], [36, -178], [42, -104], [58, -16], [66, 0], [0, 0]],
  // stout
  [[0, -192], [30, -192], [46, -172], [62, -112], [60, -50], [46, -6], [0, 0]],
  // lanky
  [[0, -198], [22, -198], [30, -182], [31, -100], [33, -12], [34, 0], [0, 0]],
  // armored
  [[0, -194], [42, -196], [54, -178], [44, -122], [44, -30], [48, 0], [0, 0]],
  // cloaked
  [[0, -196], [32, -192], [48, -162], [58, -84], [68, 0], [0, 0]],
];

export function bodyOutline(index: number): Point[] {
  return mirrorHalf(BODY_HALVES[index]);
}

/** Torso cut-out with hem trim, belt, halftone shading and little feet. */
export function renderBody(index: number, rng: Rng): SVGGElement {
  const half = BODY_HALVES[index];
  const outline = mirrorHalf(half);
  const hemY = -16;
  const hemHalf = half.filter(([, y]) => y >= hemY);
  const hemWidth = Math.max(...hemHalf.map(([x]) => x), 30);
  const beltWidth = Math.max(...half.filter(([, y]) => y <= -90 && y >= -130).map(([x]) => x), 30) + 2;
  const shade = [...half.slice(0, -1), [0, 0] as Point];

  return g(
    { class: "body" },
    path(cutPath([[-22, -2], [-10, -2], [-8, 12], [-26, 12]], rng, 0.6), "ink-fill"),
    path(cutPath([[10, -2], [22, -2], [26, 12], [8, 12]], rng, 0.6), "ink-fill"),
    papered(cutPath(outline, rng), "garment"),
    path(cutPath([[-hemWidth, hemY], [hemWidth, hemY], [hemWidth + 2, 0], [-hemWidth - 2, 0]], rng, 0.8), "trim ink-thin"),
    path(cutPath([[-beltWidth, -118], [beltWidth, -118], [beltWidth, -106], [-beltWidth, -106]], rng, 0.6), "trim ink-thin"),
    path(cutPath(shade, null), "halftone"),
  );
}

// --- heads ------------------------------------------------------------------------------------

const HEAD_SHAPES: readonly ((rng: Rng) => Point[])[] = [
  () => ellipsePoints(0, 0, 40, 42, 22),
  () => ellipsePoints(0, 0, 34, 46, 22),
  () => [[-36, -40], [36, -40], [40, -30], [40, 28], [30, 42], [-30, 42], [-40, 28], [-40, -30]],
  () => ellipsePoints(0, 2, 30, 50, 22),
  () =>
    ellipsePoints(0, 0, 1, 1, 22).map(([x, y]) => [x * (y > 0 ? 44 : 34), y * 44] as const),
  () =>
    ellipsePoints(0, 0, 1, 1, 22).map(([x, y]) => [x * (y < 0 ? 44 : 30 + 10 * (1 - y)), y * 44] as const),
];

export function headOutline(index: number, rng: Rng): Point[] {
  return translate(HEAD_SHAPES[index](rng), HEAD_CENTER[0], HEAD_CENTER[1]);
}

export function renderHead(index: number, rng: Rng): SVGGElement {
  const outline = headOutline(index, rng);
  const [cx, cy] = HEAD_CENTER;
  return g(
    { class: "head-shape" },
    path(cutPath([[-12, -208], [12, -208], [14, -190], [-14, -190]], rng, 0.5), "skin ink"),
    papered(cutPath(outline, rng), "skin"),
    path(cutPath(ellipsePoints(cx + 20, cy + 8, 16, 26, 14, -Math.PI / 2), null), "halftone-fine"),
    s("circle", { cx: cx - 42, cy: cy + 4, r: 7, class: "skin ink" }),
    s("circle", { cx: cx + 42, cy: cy + 4, r: 7, class: "skin ink" }),
  );
}

// --- hair and headgear ------------------------------------------------------------------------------

const hc = (points: readonly Point[]) => translate(points, HEAD_CENTER[0], HEAD_CENTER[1]);

/** Hair drawn behind the head (long hair, hoods). */
export function renderHairBack(index: number, rng: Rng): SVGGElement | null {
  switch (index) {
    case 2: // long
      return g({}, papered(cutPath(hc([[-46, -20], [-40, -44], [0, -56], [40, -44], [46, -20], [50, 40], [40, 72], [-40, 72], [-50, 40]]), rng), "hair"));
    case 4: // braids
      return g(
        {},
        papered(cutPath(hc([[-46, -4], [-36, -4], [-38, 70], [-46, 78], [-52, 70]]), rng), "hair"),
        papered(cutPath(hc([[36, -4], [46, -4], [52, 70], [46, 78], [38, 70]]), rng), "hair"),
      );
    case 7: // hood
      return g({}, papered(cutPath(hc([[-54, 30], [-56, -20], [-34, -58], [0, -66], [34, -58], [56, -20], [54, 30], [40, 52], [-40, 52]]), rng), "garment"));
    default:
      return null;
  }
}

/** Hair or headgear drawn over the head. */
export function renderHairFront(index: number, rng: Rng): SVGGElement | null {
  const cap = cutPath(hc([[-42, -8], [-40, -32], [-24, -50], [0, -54], [24, -50], [40, -32], [42, -8], [30, -24], [16, -18], [0, -26], [-16, -18], [-30, -24]]), rng);
  switch (index) {
    case 0: // bald: a shine
      return g({}, path(cutPath(hc([[-14, -34], [-4, -38], [-8, -30]]), null), "white"));
    case 1: // crop
      return g({}, papered(cap, "hair"));
    case 2: // long (fringe over the back hair)
      return g({}, papered(cap, "hair"));
    case 3: // topknot
      return g(
        {},
        papered(cap, "hair"),
        papered(cutPath(hc([[-12, -52], [-14, -66], [0, -78], [14, -66], [12, -52]]), rng), "hair"),
      );
    case 4: // braids
      return g({}, papered(cap, "hair"));
    case 5: { // curly mop
      const curls = [[-34, -26], [-24, -44], [-6, -52], [12, -50], [28, -40], [38, -22], [-40, -6], [40, -6]] as const;
      return g({}, ...curls.map(([x, y]) => s("circle", { cx: HEAD_CENTER[0] + x, cy: HEAD_CENTER[1] + y, r: 14, class: "hair ink" })));
    }
    case 6: // mohawk
      return g({}, papered(cutPath(hc([[-8, -40], [-14, -60], [-6, -82], [6, -86], [12, -64], [8, -40]]), rng), "hair"));
    case 7: // hood rim
      return g({}, path(cutPath(hc([[-48, 10], [-50, -24], [-30, -52], [0, -58], [30, -52], [50, -24], [48, 10], [40, 0], [36, -30], [0, -44], [-36, -30], [-40, 0]]), rng), "garment ink"));
    case 8: // iron helm with nose guard
      return g(
        {},
        papered(cutPath(hc([[-44, -6], [-42, -34], [-22, -54], [0, -58], [22, -54], [42, -34], [44, -6]]), rng), "steel"),
        path(cutPath(hc([[-46, -10], [46, -10], [46, -2], [-46, -2]]), rng, 0.5), "steel ink-thin"),
        path(cutPath(hc([[-4, -6], [4, -6], [3, 18], [-3, 18]]), rng, 0.4), "steel ink-thin"),
      );
    case 9: // feathered cap
      return g(
        {},
        papered(cutPath(hc([[-46, -14], [-40, -36], [-10, -52], [24, -48], [44, -28], [48, -14]]), rng), "trim"),
        path(cutPath(hc([[20, -46], [46, -88], [54, -84], [30, -42]]), rng, 0.6), "red ink"),
      );
    default:
      return null;
  }
}

// --- beards --------------------------------------------------------------------------------------

export function renderBeard(index: number, rng: Rng): SVGGElement | null {
  switch (index) {
    case 1: // stubble
      return g({}, path(cutPath(hc([[-30, 14], [30, 14], [24, 36], [0, 44], [-24, 36]]), null), "halftone"));
    case 2: // short beard below the mouth
      return g({}, papered(cutPath(hc([[-38, 6], [-30, 26], [-14, 34], [0, 32], [14, 34], [30, 26], [38, 6], [32, 42], [0, 58], [-32, 42]]), rng), "hair"));
    case 3: // long beard
      return g({}, papered(cutPath(hc([[-38, 8], [-30, 26], [-14, 34], [0, 32], [14, 34], [30, 26], [38, 8], [34, 50], [12, 92], [0, 102], [-12, 92], [-34, 50]]), rng), "hair"));
    case 4: // mustache above the mouth
      return g({}, papered(cutPath(hc([[-26, 14], [-10, 6], [0, 9], [10, 6], [26, 14], [30, 6], [22, 16], [0, 13], [-22, 16], [-30, 6]]), rng, 0.6), "hair"));
    case 5: { // braided beard
      const braid = papered(cutPath(hc([[-14, 36], [14, 36], [12, 96], [0, 106], [-12, 96]]), rng), "hair");
      const bands = [56, 78].map((y) => path(cutPath(hc([[-13, y], [13, y], [12, y + 6], [-12, y + 6]]), rng, 0.4), "trim ink-thin"));
      return g({}, papered(cutPath(hc([[-36, 8], [-28, 28], [-12, 34], [12, 34], [28, 28], [36, 8], [30, 42], [-30, 42]]), rng), "hair"), braid, ...bands);
    }
    default:
      return null;
  }
}

// --- distinguishing marks -------------------------------------------------------------------------

export function renderMark(index: number, rng: Rng): SVGGElement | null {
  const [cx, cy] = HEAD_CENTER;
  switch (index) {
    case 1: // scar across the left eye
      return g(
        {},
        path(`M${cx - 24} ${cy - 22} L${cx - 6} ${cy + 14}`, "line-thin", { stroke: "#9c3b2a" }),
        ...[0.3, 0.55, 0.8].map((t) => {
          const x = cx - 24 + 18 * t;
          const y = cy - 22 + 36 * t;
          return path(`M${x - 4} ${y + 2} L${x + 4} ${y - 2}`, "line-thin");
        }),
      );
    case 2: // eyepatch over the right eye
      return g(
        {},
        path(`M${cx - 40} ${cy - 18} L${cx + 40} ${cy - 10}`, "line-thin"),
        path(cutPath(ellipsePoints(cx + 13, cy - 4, 10, 9, 10), rng, 0.5), "ink-fill"),
      );
    case 3: // freckles
      return g(
        {},
        ...[[-24, 12], [-18, 16], [-28, 18], [18, 16], [24, 12], [28, 18]].map(([x, y]) =>
          s("circle", { cx: cx + x, cy: cy + y, r: 1.8, fill: "#9c5a3a" }),
        ),
      );
    case 4: // war paint stripes under the eyes
      return g(
        {},
        path(cutPath([[cx - 30, cy + 6], [cx - 8, cy + 6], [cx - 10, cy + 12], [cx - 30, cy + 12]], rng, 0.4), "blue"),
        path(cutPath([[cx + 8, cy + 6], [cx + 30, cy + 6], [cx + 30, cy + 12], [cx + 10, cy + 12]], rng, 0.4), "blue"),
      );
    default:
      return null;
  }
}
