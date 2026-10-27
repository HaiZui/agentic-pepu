import type { HouseId, SettingId } from "./catalog";
import { SETTINGS } from "./catalog";
import { papered } from "./defs";
import { cutPath, ellipsePoints, type Point } from "./geometry";
import { COMIC } from "./palette";
import { Rng } from "./prng";
import { renderBanner } from "./sigils";
import { g, path, svgRoot } from "./svg";

export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;
/** Extra width on each side so layers can travel for parallax without showing edges. */
export const BLEED = 192;
export const FLOOR_Y = 880;
export const SCENERY_VIEWBOX = `${-BLEED} 0 ${STAGE_WIDTH + 2 * BLEED} ${STAGE_HEIGHT}`;

const L = -BLEED;
const R = STAGE_WIDTH + BLEED;

export type SceneryLayer = "back" | "mid" | "front";

export interface Scenery {
  setting: SettingId | "fallback";
  back: SVGGElement;
  mid: SVGGElement;
  front: SVGGElement;
}

interface Painter {
  rng: Rng;
  poly(points: readonly Point[], fill: string, textured?: boolean): SVGElement;
  rect(x: number, y: number, w: number, h: number, fill: string, textured?: boolean): SVGElement;
  shade(points: readonly Point[], fine?: boolean): SVGElement;
  circle(cx: number, cy: number, r: number, fill: string): SVGElement;
}

function painter(seed: string): Painter {
  const rng = new Rng(`scenery:${seed}`);
  const poly = (points: readonly Point[], fill: string, textured = true) =>
    textured ? papered(cutPath(points, rng, 2), "scenery-fill", { fill }) : path(cutPath(points, rng, 2), "ink", { fill });
  return {
    rng,
    poly,
    rect: (x, y, w, h, fill, textured = true) => poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], fill, textured),
    shade: (points, fine = false) => path(cutPath(points, null), fine ? "halftone-fine" : "halftone"),
    circle: (cx, cy, r, fill) => path(cutPath(ellipsePoints(cx, cy, r, r, 18), rng, 1.5), "ink", { fill }),
  };
}

const layer = (name: SceneryLayer, ...children: SVGElement[]) =>
  g({ "data-layer": name, class: "paper" }, ...children);

function flame(p: Painter, x: number, y: number, size = 1): SVGElement {
  return g(
    {},
    p.poly([[x - 12 * size, y], [x, y - 40 * size], [x + 12 * size, y], [x, y + 8 * size]], COMIC.orange, false),
    p.poly([[x - 6 * size, y], [x, y - 22 * size], [x + 6 * size, y], [x, y + 4 * size]], COMIC.yellow, false),
  );
}

function floor(p: Painter, color: string, y = FLOOR_Y - 60): SVGElement[] {
  return [p.rect(L, y, R - L, STAGE_HEIGHT - y, color), p.shade([[L, y + 120], [R, y + 120], [R, STAGE_HEIGHT], [L, STAGE_HEIGHT]])];
}

function banners(houses: readonly HouseId[], poles: boolean, y = 60): SVGElement[] {
  if (houses.length === 0) return [];
  const span = 1400;
  const step = houses.length > 1 ? span / (houses.length - 1) : 0;
  return houses.map((house, i) => {
    const x = houses.length > 1 ? 260 + i * step : STAGE_WIDTH / 2;
    const banner = renderBanner(house, 300);
    banner.setAttribute("transform", `translate(${x} ${y})`);
    if (!poles) return banner;
    const pole = path(cutPath([[x - 5, y - 20], [x + 5, y - 20], [x + 6, FLOOR_Y - 20], [x - 6, FLOOR_Y - 20]], null), "wood ink");
    return g({}, pole, banner);
  });
}

const OUTDOOR = new Set<string>(["battlefield", "ice_wall", "forest", "harbor", "city_streets", "bridge"]);

function smoke(p: Painter, x: number, base: number): SVGElement {
  const puffs = Array.from({ length: 7 }, (_, i) => {
    const cx = x + Math.sin(i * 1.7) * 26 + i * 14;
    const cy = base - i * 52;
    return path(cutPath(ellipsePoints(cx, cy, 58 - i * 3, 44 - i * 2, 14), p.rng, 2), "ink-thin", { fill: "#8a837c", opacity: 0.7 });
  });
  return g({}, ...puffs);
}

type Builder = (p: Painter) => { back: SVGElement[]; mid: SVGElement[]; front: SVGElement[] };

const BUILDERS: Record<SettingId | "fallback", Builder> = {
  throne_room: (p) => ({
    back: [
      p.rect(L, 0, R - L, STAGE_HEIGHT, COMIC.stone),
      ...[360, 960, 1560].flatMap((x) => [
        p.poly([[x - 130, 640], [x - 130, 260], [x - 70, 170], [x, 140], [x + 70, 170], [x + 130, 260], [x + 130, 640]], COMIC.sky),
        p.rect(x - 6, 150, 12, 490, COMIC.darkStone, false),
        p.rect(x - 130, 400, 260, 10, COMIC.darkStone, false),
      ]),
      p.shade([[L, 520], [R, 520], [R, STAGE_HEIGHT], [L, STAGE_HEIGHT]]),
    ],
    mid: [
      ...floor(p, COMIC.darkStone),
      p.poly([[860, FLOOR_Y - 60], [1060, FLOOR_Y - 60], [1260, STAGE_HEIGHT], [660, STAGE_HEIGHT]], COMIC.red),
      p.poly([[860, 820], [860, 520], [900, 470], [960, 440], [1020, 470], [1060, 520], [1060, 820]], COMIC.gold),
      p.rect(890, 560, 140, 200, COMIC.darkRed),
      ...[120, 620, 1300, 1800].map((x) => p.rect(x - 50, 0, 100, FLOOR_Y - 60, COMIC.bone)),
      ...[120, 620, 1300, 1800].map((x) => p.shade([[x + 10, 0], [x + 50, 0], [x + 50, FLOOR_Y - 60], [x + 10, FLOOR_Y - 60]])),
    ],
    front: [
      p.rect(L, 1040, R - L, 40, COMIC.darkStone),
      p.rect(L, 0, 230, STAGE_HEIGHT, COMIC.bone),
      p.rect(STAGE_WIDTH - 40, 0, 230, STAGE_HEIGHT, COMIC.bone),
    ],
  }),
  feast_hall: (p) => ({
    back: [
      p.rect(L, 0, R - L, STAGE_HEIGHT, COMIC.wood),
      ...Array.from({ length: 12 }, (_, i) => p.rect(L + i * 200, 0, 8, STAGE_HEIGHT, COMIC.darkWood, false)),
      ...[300, 760, 1160, 1620].flatMap((x) => [p.circle(x, 300, 60, COMIC.red), p.circle(x, 300, 26, COMIC.gold)]),
      ...[530, 1390].flatMap((x) => [p.rect(x - 8, 360, 16, 90, COMIC.darkWood), flame(p, x, 360, 1.3)]),
      p.shade([[L, 0], [R, 0], [R, 180], [L, 180]]),
    ],
    mid: [
      ...floor(p, COMIC.darkWood),
      p.rect(160, 740, 1600, 46, COMIC.wood),
      ...[220, 940, 1680].map((x) => p.rect(x, 786, 26, 80, COMIC.darkWood)),
      p.poly(ellipsePoints(700, 728, 70, 26, 16), COMIC.orange),
      ...[420, 560, 1100, 1260, 1460].map((x) => p.poly([[x - 16, 740], [x - 20, 700], [x + 20, 700], [x + 16, 740]], COMIC.gold)),
      ...[880, 1340].flatMap((x) => [p.rect(x - 6, 690, 12, 50, COMIC.bone), flame(p, x, 690, 0.6)]),
    ],
    front: [p.rect(L, 1000, R - L, 46, COMIC.darkWood), ...[100, 900, 1800].map((x) => p.rect(x, 1046, 30, 34, COMIC.darkWood))],
  }),
  battlefield: (p) => ({
    back: [
      p.rect(L, 0, R - L, STAGE_HEIGHT, "#e7a75b"),
      p.shade([[L, 0], [R, 0], [R, 300], [L, 300]], true),
      p.poly([[L, 620], [200, 420], [520, 560], [900, 380], [1300, 560], [1700, 400], [R, 560], [R, 760], [L, 760]], "#8c6a4a"),
      ...[420, 1500].map((x) => smoke(p, x, 560)),
    ],
    mid: [
      ...floor(p, "#6b4a2b", FLOOR_Y - 120),
      ...[260, 1660].flatMap((x) => [p.poly([[x - 140, 780], [x, 560], [x + 140, 780]], COMIC.bone), p.poly([[x - 20, 780], [x, 640], [x + 20, 780]], COMIC.darkWood, false)]),
      ...[700, 1220].map((x) => p.poly([[x, 820], [x + 4, 520], [x + 80, 540], [x + 6, 580], [x + 8, 820]], COMIC.red)),
    ],
    front: [
      p.poly([[L, 1080], [L, 980], [200, 940], [500, 1000], [600, 1080]], "#5a3d24"),
      p.poly([[1400, 1080], [1600, 990], [1900, 960], [R, 1000], [R, 1080]], "#5a3d24"),
      ...[120, 1700, 1780].map((x) => p.poly([[x, 1000], [x + 6, 1000], [x + 46, 860], [x + 40, 858]], COMIC.wood, false)),
    ],
  }),
  ice_wall: (p) => ({
    back: [
      p.rect(L, 0, R - L, STAGE_HEIGHT, COMIC.night),
      ...Array.from({ length: 30 }, () => p.circle(p.rng.range(L, R), p.rng.range(20, 300), p.rng.range(2, 5), COMIC.snow)),
      p.poly([[L, 860], [L, 330], [500, 300], [1100, 320], [1600, 290], [R, 320], [R, 860]], COMIC.ice),
      ...[200, 640, 1080, 1500, 1900].map((x) => p.poly([[x, 320], [x + 20, 500], [x - 10, 620], [x + 6, 740], [x - 4, 740], [x - 20, 600], [x + 6, 500]], "#8fbcd6", false)),
      p.shade([[L, 560], [R, 560], [R, 860], [L, 860]], true),
    ],
    mid: [
      ...floor(p, COMIC.snow),
      p.rect(1560, 380, 120, 460, COMIC.wood),
      p.poly([[1530, 390], [1620, 300], [1710, 390]], COMIC.darkWood),
      p.poly([[L, 820], [300, 760], [700, 830], [L, 860]], "#dfeaf5"),
    ],
    front: [
      p.poly([[L, 1080], [L, 990], [300, 960], [520, 1080]], COMIC.snow),
      p.poly([[1500, 1080], [1800, 970], [R, 990], [R, 1080]], COMIC.snow),
      ...Array.from({ length: 10 }, (_, i) => {
        const x = L + 40 + i * 230;
        return p.poly([[x, 0], [x + 30, 0], [x + 15, p.rng.range(70, 140)]], COMIC.ice, false);
      }),
    ],
  }),
  forest: (p) => ({
    back: [
      p.rect(L, 0, R - L, STAGE_HEIGHT, "#cfe0c3"),
      ...Array.from({ length: 14 }, (_, i) => {
        const x = L + i * 170;
        return p.poly([[x - 90, 760], [x, p.rng.range(240, 380)], [x + 90, 760]], "#9bb592");
      }),
      p.shade([[L, 520], [R, 520], [R, 760], [L, 760]], true),
    ],
    mid: [
      ...floor(p, COMIC.moss),
      ...[60, 520, 1380, 1860].flatMap((x) => [
        p.rect(x - 40, 0, 80, FLOOR_Y - 40, COMIC.darkWood),
        p.circle(x, 120, 200, COMIC.green),
        p.shade([[x, 0], [x + 40, 0], [x + 40, FLOOR_Y - 40], [x, FLOOR_Y - 40]]),
      ]),
    ],
    front: [
      ...[-60, 140, 1700, 1900].map((x) =>
        p.poly([[x - 120, 1080], [x - 60, 960], [x, 1040], [x + 40, 930], [x + 80, 1030], [x + 140, 960], [x + 160, 1080]], "#3f6a2c"),
      ),
    ],
  }),
  dungeon: (p) => ({
    back: [
      p.rect(L, 0, R - L, STAGE_HEIGHT, COMIC.darkStone),
      ...Array.from({ length: 18 }, (_, row) =>
        p.rect(L, row * 60, R - L, 3, "#3e3832", false),
      ),
      p.rect(860, 120, 200, 140, COMIC.night),
      ...[900, 950, 1000].map((x) => p.rect(x, 120, 10, 140, COMIC.steel, false)),
      path(cutPath([[860, 260], [1060, 260], [1260, 880], [660, 880]], null), "", { fill: "#dce6ff", opacity: 0.16 }),
    ],
    mid: [
      ...floor(p, "#4a443d"),
      ...[300, 1620].flatMap((x) => [p.rect(x - 8, 360, 16, 80, COMIC.darkWood), flame(p, x, 360)]),
      ...[560, 1360].map((x) => path(`M${x} 0 ${Array.from({ length: 9 }, (_, i) => `L${x + (i % 2 ? 8 : -8)} ${40 + i * 40}`).join(" ")}`, "line", { stroke: COMIC.steel, "stroke-width": 8 })),
    ],
    front: [
      ...[-120, -40, 1900, 1980].map((x) => p.rect(x, 0, 22, STAGE_HEIGHT, COMIC.steel)),
      p.poly([[600, 1080], [700, 1020], [900, 1050], [1100, 1010], [1300, 1080]], COMIC.gold),
    ],
  }),
  harbor: (p) => ({
    back: [
      p.rect(L, 0, R - L, STAGE_HEIGHT, COMIC.sky),
      p.rect(L, 520, R - L, 300, COMIC.blue),
      p.shade([[L, 520], [R, 520], [R, 820], [L, 820]], true),
      ...[400, 1450].map((x) => p.poly([[x - 70, 520], [x + 70, 520], [x + 50, 545], [x - 50, 545]], COMIC.darkWood)),
      ...[400, 1450].map((x) => p.poly([[x, 520], [x, 410], [x + 50, 500]], COMIC.bone)),
    ],
    mid: [
      p.rect(L, FLOOR_Y - 60, R - L, STAGE_HEIGHT - FLOOR_Y + 60, COMIC.wood),
      ...Array.from({ length: 16 }, (_, i) => p.rect(L + i * 150, FLOOR_Y - 60, 6, 300, COMIC.darkWood, false)),
      p.poly([[1500, 820], [1560, 640], [2100, 640], [2100, 820]], COMIC.darkWood),
      p.rect(1780, 260, 16, 380, COMIC.wood),
      p.poly([[1796, 280], [2000, 420], [1796, 600]], COMIC.bone),
      ...[200, 900].map((x) => p.rect(x - 15, 760, 30, 140, COMIC.darkWood)),
    ],
    front: [
      p.rect(L + 40, 940, 160, 140, COMIC.wood),
      p.rect(L + 220, 980, 120, 100, COMIC.wood),
      p.circle(1800, 1040, 60, "#c9a46a"),
      p.circle(1800, 1040, 30, COMIC.wood),
    ],
  }),
  city_streets: (p) => ({
    back: [
      p.rect(L, 0, R - L, STAGE_HEIGHT, "#f0c38a"),
      p.poly([[L, 520], [L, 340], [0, 300], [120, 340], [120, 260], [260, 220], [400, 260], [400, 340], [640, 300], [820, 340], [820, 240], [940, 160], [1060, 240], [1060, 340], [1300, 300], [1500, 340], [1500, 260], [1700, 220], [1900, 280], [R, 320], [R, 520]], "#4a3b4f"),
    ],
    mid: [
      ...floor(p, "#9a8a76"),
      ...[0, 420, 1300, 1740].flatMap((x) => [
        p.rect(x - 180, 380, 360, FLOOR_Y - 440, COMIC.bone),
        p.poly([[x - 200, 390], [x, 240], [x + 200, 390]], COMIC.darkRed),
        p.rect(x - 180, 380, 360, 14, COMIC.darkWood, false),
        p.rect(x - 4, 380, 8, FLOOR_Y - 440, COMIC.darkWood, false),
        p.rect(x - 120, 470, 70, 80, COMIC.yellow),
        p.rect(x + 50, 470, 70, 80, COMIC.yellow),
      ]),
    ],
    front: [
      ...[60, 1830].map((x) => p.poly([[x - 60, 1080], [x - 70, 960], [x, 940], [x + 70, 960], [x + 60, 1080]], COMIC.wood)),
      p.rect(L, 1050, R - L, 30, COMIC.darkStone),
    ],
  }),
  temple: (p) => ({
    back: [
      p.rect(L, 0, R - L, STAGE_HEIGHT, "#5c1d1a"),
      p.circle(960, 330, 230, COMIC.gold),
      ...Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const a2 = ((i + 1) / 12) * Math.PI * 2;
        const color = [COMIC.red, COMIC.blue, COMIC.yellow, COMIC.green][i % 4];
        return p.poly([[960, 330], [960 + Math.cos(a) * 200, 330 + Math.sin(a) * 200], [960 + Math.cos(a2) * 200, 330 + Math.sin(a2) * 200]], color, false);
      }),
      p.circle(960, 330, 60, COMIC.red),
    ],
    mid: [
      ...floor(p, COMIC.stone),
      ...[220, 600, 1320, 1700].map((x) => p.rect(x - 55, 80, 110, FLOOR_Y - 140, COMIC.bone)),
      p.rect(760, 700, 400, 120, COMIC.bone),
      p.rect(740, 690, 440, 20, COMIC.gold),
      ...[820, 960, 1100].flatMap((x) => [p.rect(x - 8, 640, 16, 50, COMIC.bone), flame(p, x, 640, 0.6)]),
    ],
    front: [
      p.rect(L, 1010, R - L, 70, COMIC.stone),
      p.rect(L, 1000, R - L, 14, COMIC.bone),
      ...[40, 1880].flatMap((x) => [p.rect(x - 10, 820, 20, 180, COMIC.gold), flame(p, x, 820, 0.9)]),
    ],
  }),
  bridge: (p) => ({
    back: [
      p.rect(L, 0, R - L, STAGE_HEIGHT, "#9fc2dd"),
      p.poly([[L, 700], [200, 260], [500, 520], [900, 200], [1300, 520], [1650, 280], [R, 600], [R, 1080], [L, 1080]], "#7a8a9a"),
      p.poly([[840, 262], [900, 200], [962, 262], [930, 250], [902, 272], [872, 248]], COMIC.snow, false),
      p.rect(L, 760, R - L, 320, "#2a2f3a"),
    ],
    mid: [
      p.poly([[L, 1080], [L, 760], [260, 780], [340, 1080]], "#6f5a48"),
      p.poly([[1600, 1080], [1680, 780], [R, 760], [R, 1080]], "#6f5a48"),
      ...Array.from({ length: 26 }, (_, i) => {
        const x = 300 + i * 52;
        const sag = Math.sin((i / 25) * Math.PI) * 40;
        return p.rect(x, FLOOR_Y - 40 + sag, 44, 18, COMIC.wood, false);
      }),
      path(`M280 ${FLOOR_Y - 120} Q960 ${FLOOR_Y - 40} 1660 ${FLOOR_Y - 120}`, "line", { "stroke-width": 6 }),
      path(`M280 ${FLOOR_Y - 40} Q960 ${FLOOR_Y + 40} 1660 ${FLOOR_Y - 40}`, "line", { "stroke-width": 6 }),
    ],
    front: [
      p.poly([[L, 1080], [L, 960], [200, 1000], [300, 1080]], "#4f4034"),
      p.poly([[1700, 1080], [1820, 990], [R, 970], [R, 1080]], "#4f4034"),
    ],
  }),
  fallback: (p) => ({
    back: [
      p.rect(L, 0, R - L, STAGE_HEIGHT, COMIC.darkRed),
      ...Array.from({ length: 20 }, (_, i) => p.shade([[L + i * 120 + 40, 0], [L + i * 120 + 80, 0], [L + i * 120 + 80, STAGE_HEIGHT], [L + i * 120 + 40, STAGE_HEIGHT]])),
    ],
    mid: floor(p, COMIC.wood),
    front: [p.rect(L, 1040, R - L, 40, COMIC.darkWood)],
  }),
};

/** Layered paper scenery for a setting; unknown settings fall back to a plain curtain backdrop. */
export function renderScenery(setting: string, options: { banners?: readonly HouseId[] } = {}): Scenery {
  let key = setting as SettingId | "fallback";
  if (!(SETTINGS as readonly string[]).includes(setting)) {
    console.warn(`Unknown setting "${setting}", using the fallback scenery`);
    key = "fallback";
  }
  const built = BUILDERS[key](painter(key));
  return {
    setting: key,
    back: layer("back", ...built.back),
    mid: layer("mid", ...built.mid, ...banners(options.banners ?? [], OUTDOOR.has(key))),
    front: layer("front", ...built.front),
  };
}

/** The three layers stacked in one SVG, for previews and comic panels. */
export function scenerySvg(scenery: Scenery, viewBox = `0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`): SVGSVGElement {
  return svgRoot(viewBox, { class: "scenery-svg", preserveAspectRatio: "xMidYMid slice" }, scenery.back, scenery.mid, scenery.front);
}
