import { Rng } from "./prng";

export type Point = readonly [number, number];

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Closed polygon with a slight hand-cut wobble, like paper cut with scissors. */
export function cutPath(points: readonly Point[], rng: Rng | null, jitter = 1.2): string {
  const pts = points.map(([x, y]) =>
    rng ? [x + rng.range(-jitter, jitter), y + rng.range(-jitter, jitter)] : [x, y],
  );
  return `M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(" L")} Z`;
}

/** Open polyline (for strokes such as brows, mouths and rods). */
export function linePath(points: readonly Point[]): string {
  return `M${points.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(" L")}`;
}

/** Smooth open curve through points using quadratic segments between midpoints. */
export function curvePath(points: readonly Point[]): string {
  if (points.length < 3) return linePath(points);
  let d = `M${r1(points[0][0])} ${r1(points[0][1])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    const mx = i === points.length - 2 ? nx : (x + nx) / 2;
    const my = i === points.length - 2 ? ny : (y + ny) / 2;
    d += ` Q${r1(x)} ${r1(y)} ${r1(mx)} ${r1(my)}`;
  }
  return d;
}

export function ellipsePoints(cx: number, cy: number, rx: number, ry: number, n = 20, start = 0): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const a = start + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as const;
  });
}

/** Mirror a right-hand half outline (top centre -> bottom centre) into a full symmetric outline. */
export function mirrorHalf(right: readonly Point[]): Point[] {
  const left = right
    .slice(1, -1)
    .reverse()
    .map(([x, y]) => [-x, y] as const);
  return [...right, ...left];
}

export function translate(points: readonly Point[], dx: number, dy: number): Point[] {
  return points.map(([x, y]) => [x + dx, y + dy] as const);
}

export function scalePoints(points: readonly Point[], sx: number, sy = sx): Point[] {
  return points.map(([x, y]) => [x * sx, y * sy] as const);
}

export function rotatePoint([x, y]: Point, [px, py]: Point, degrees: number): Point {
  const a = (degrees * Math.PI) / 180;
  const dx = x - px;
  const dy = y - py;
  return [px + dx * Math.cos(a) - dy * Math.sin(a), py + dx * Math.sin(a) + dy * Math.cos(a)];
}
