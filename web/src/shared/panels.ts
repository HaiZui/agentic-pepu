/** Camera framing and panel grids shared by the live stage and the comic export. */

export const STAGE_W = 1920;
export const STAGE_H = 1080;
export const FLOOR = 880;
/** Foreground puppets are drawn at this scale; heads sit about 300 units above the floor. */
export const FORE_SCALE = 1.25;
const HEAD_Y = FLOOR - 290 * FORE_SCALE;
const FACE_Y = FLOOR - 245 * FORE_SCALE;

export type FramingId = "wide" | "medium" | "close_up" | "extreme_close_up" | "over_shoulder" | "splash" | "montage";

export interface Spot {
  id: string;
  x: number;
  layer: "fore" | "back";
}

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ZOOM: Record<FramingId, number> = {
  wide: 1,
  montage: 1,
  splash: 1.08,
  medium: 1.45,
  over_shoulder: 1.7,
  close_up: 2.2,
  extreme_close_up: 3.2,
};

/** Normalised framing tightness, used by the stage to decide whether a framing pushes in. */
export const framingZoom = (framing: FramingId) => ZOOM[framing];

/**
 * The view box for a framing around the focused characters, clamped to the stage.
 * `aspect` is width / height of the target viewport (16:9 for the stage, anything for comic panels).
 */
export function frame(framing: FramingId, focus: readonly string[], spots: readonly Spot[], aspect = STAGE_W / STAGE_H): ViewBox {
  const targets = spots.filter((s) => focus.includes(s.id) && s.layer === "fore");
  const xs = targets.length > 0 ? targets.map((t) => t.x) : spots.filter((s) => s.layer === "fore").map((s) => s.x);
  const centerX = xs.length > 0 ? (Math.min(...xs) + Math.max(...xs)) / 2 : STAGE_W / 2;
  const spread = xs.length > 1 ? Math.max(...xs) - Math.min(...xs) : 0;

  let zoom = ZOOM[framing];
  let cx = centerX;
  let cy = STAGE_H / 2;
  switch (framing) {
    case "medium":
      cy = HEAD_Y + 170;
      break;
    case "over_shoulder":
      // Look past the first focus toward the second: shift the frame to the second figure.
      if (targets.length > 1) cx = targets[0].x + (targets[1].x - targets[0].x) * 0.65;
      cy = HEAD_Y + 120;
      break;
    case "close_up":
      cy = HEAD_Y + 60;
      break;
    case "extreme_close_up":
      cx = xs[0] ?? cx;
      cy = FACE_Y;
      break;
    default:
      // Letterbox-shaped panels keep the figures, not the ceiling, in a wide shot.
      cy = HEAD_Y + 200;
      break;
  }

  // Wide enough to keep every focused figure in the frame.
  let width = STAGE_W / zoom;
  const needed = spread + 360;
  if (framing !== "extreme_close_up" && width < needed) width = Math.min(STAGE_W, needed);
  let height = width / aspect;
  if (height > STAGE_H) {
    height = STAGE_H;
    width = height * aspect;
  }
  zoom = STAGE_W / width;

  const x = clamp(cx - width / 2, 0, STAGE_W - width);
  const y = clamp(cy - height / 2, 0, STAGE_H - height);
  return { x: round(x), y: round(y), width: round(width), height: round(height) };
}

/** Panel rectangles for a comic grid of `count` cells inside a width x height page, with gutters. */
export function panelGrid(count: number, width = STAGE_W, height = STAGE_H, gutter = 24): ViewBox[] {
  const rows: number[] = { 1: [1], 2: [2], 3: [1, 2], 4: [2, 2], 5: [2, 3], 6: [3, 3] }[Math.min(Math.max(count, 1), 6)] ?? [3, 3];
  const cellH = (height - gutter * (rows.length + 1)) / rows.length;
  const cells: ViewBox[] = [];
  rows.forEach((cols, r) => {
    const cellW = (width - gutter * (cols + 1)) / cols;
    for (let c = 0; c < cols; c++) {
      cells.push({ x: round(gutter + c * (cellW + gutter)), y: round(gutter + r * (cellH + gutter)), width: round(cellW), height: round(cellH) });
    }
  });
  return cells;
}

/** Converts a view box into a camera (centre and zoom) for the 16:9 stage. */
export function cameraFor(view: ViewBox): { cx: number; cy: number; zoom: number } {
  return { cx: view.x + view.width / 2, cy: view.y + view.height / 2, zoom: STAGE_W / view.width };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi));
const round = (n: number) => Math.round(n * 10) / 10;
