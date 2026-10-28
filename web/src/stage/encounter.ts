import type { Beat, FateScript, Placement } from "./types";

export type DragonOutcome = "victory" | "dragon_slaying" | "sword_accident";

export interface Encounter {
  hero: string;
  outcome: DragonOutcome;
  phase: "confrontation" | "resolved";
}

export const HERO_X = 570;
export const DRAGON_X = 1280;

export function encounterFor(beat: Beat): Encounter | null {
  if (beat.card !== "dragon_victory" && beat.card !== "dragon_defeat") return null;
  const hero = beat.roles.length === 1 && beat.roles[0].role === "hero" ? beat.roles[0].character : null;
  const facts = beat.facts.filter((f) => f !== "first_blood");
  const outcome = beat.card === "dragon_victory" ? (facts.length === 0 ? "victory" : null)
    : facts.length === 1 && (facts[0] === "dragon_slaying" || facts[0] === "sword_accident") ? facts[0] : null;
  if (!hero || !outcome) {
    throw new Error(`Invalid dragon duel at beat ${beat.index}`);
  }
  return { hero, outcome, phase: "confrontation" };
}

export function resolutionCaption(fate: FateScript, encounter: Encounter): string {
  const name = fate.characters.find((c) => c.id === encounter.hero)?.name;
  if (!name) throw new Error(`Unknown dragon hero: ${encounter.hero}`);
  if (encounter.outcome === "victory") return `${name} slays the dragon and survives.`;
  if (encounter.outcome === "sword_accident") return `${name} trips onto their own sword and dies. The dragon survives.`;
  return `The dragon slays ${name}. The dragon survives.`;
}

export function encounterBlocking(placements: Placement[], encounter: Encounter | null | undefined): void {
  if (!encounter) return;
  const hero = placements.find((p) => p.id === encounter.hero);
  if (hero) { hero.x = HERO_X; hero.layer = "fore"; }
  placements.filter((p) => p.id !== encounter.hero).forEach((p, i) => {
    p.layer = "back";
    p.x = 200 + i * 120;
  });
}

export function encounterFrame(aspect: number) {
  const width = Math.max(1700, 900 * aspect);
  const height = width / aspect;
  return { x: 960 - width / 2, y: 650 - height / 2, width, height };
}
