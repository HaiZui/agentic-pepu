import type { Emotion, Placement } from "./types";

export const MAX_FOREGROUND = 6;
/** Foreground positions by how many figures share the front row: small casts stand further apart. */
const LAYOUTS: readonly (readonly number[])[] = [
  [],
  [960],
  [700, 1220],
  [520, 960, 1400],
  [420, 780, 1140, 1500],
  [360, 660, 960, 1260, 1560],
  [330, 582, 834, 1086, 1338, 1590],
];
export const SLOTS = LAYOUTS[MAX_FOREGROUND];
const CANDIDATES = [...new Set(LAYOUTS.flat())].sort((a, b) => a - b);
const BACK_LEFT = 200;
const BACK_RIGHT = 1720;

/** Slots for the first `count` figures, centred on the stage. */
export function initialSlots(count: number): number[] {
  return [...LAYOUTS[Math.min(count, MAX_FOREGROUND)]];
}

/** The open position furthest from everyone already in front (ties go to the centre). */
function freeSlot(placements: readonly Placement[]): number {
  const taken = placements.filter((p) => p.layer === "fore").map((p) => p.x);
  if (taken.length === 0) return 960;
  const gap = (x: number) => Math.min(...taken.map((t) => Math.abs(t - x)));
  return CANDIDATES.reduce((best, x) => {
    const better = gap(x) > gap(best) + 1e-9 || (Math.abs(gap(x) - gap(best)) < 1e-9 && Math.abs(x - 960) < Math.abs(best - 960));
    return better ? x : best;
  }, CANDIDATES[0]);
}

/** Spread the background crowd evenly behind the foreground. */
export function layoutBackground(placements: Placement[]): void {
  const back = placements.filter((p) => p.layer === "back");
  const span = (BACK_RIGHT - BACK_LEFT) / Math.max(back.length, 1);
  back.forEach((p, i) => (p.x = Math.round(BACK_LEFT + (i + 0.5) * span)));
}

/** First placement of a scene: who is needed first stands in front, the rest wait in the crowd. */
export function initialBlocking(present: readonly string[], priority: readonly string[], emotionOf: (id: string) => Emotion): Placement[] {
  const ordered = [...new Set([...priority, ...present])].filter((id) => present.includes(id));
  const fore = ordered.slice(0, MAX_FOREGROUND);
  const slots = initialSlots(fore.length);
  const placements: Placement[] = [
    ...fore.map((id, i) => ({ id, layer: "fore" as const, x: slots[i], emotion: emotionOf(id) })),
    ...ordered.slice(MAX_FOREGROUND).map((id) => ({ id, layer: "back" as const, x: 0, emotion: emotionOf(id) })),
  ];
  layoutBackground(placements);
  return placements;
}

/**
 * Bring every `required` character into the foreground. When all six slots are taken, the figure
 * whose next need is furthest away (or never) steps back into the crowd and yields its slot.
 */
export function ensureForeground(
  placements: Placement[],
  required: readonly string[],
  nextNeed: (id: string) => number,
  emotionOf: (id: string) => Emotion,
): void {
  for (const id of required) {
    let placement = placements.find((p) => p.id === id);
    if (placement?.layer === "fore") continue;
    const fore = placements.filter((p) => p.layer === "fore");
    let x: number;
    if (fore.length < MAX_FOREGROUND) {
      x = freeSlot(placements);
    } else {
      const candidates = fore.filter((p) => !required.includes(p.id));
      if (candidates.length === 0) break;
      const evicted = candidates.reduce((a, b) => (nextNeed(b.id) > nextNeed(a.id) ? b : a), candidates[0]);
      x = evicted.x;
      evicted.layer = "back";
    }
    if (!placement) {
      placement = { id, layer: "fore", x, emotion: emotionOf(id) };
      placements.push(placement);
    }
    placement.layer = "fore";
    placement.x = x;
  }
  layoutBackground(placements);
}
