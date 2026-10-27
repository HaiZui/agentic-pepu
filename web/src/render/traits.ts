import { normalizeName, Rng } from "./prng";

export const TRAIT_KEYS = ["body", "head", "hair", "beard", "mark", "palette"] as const;
export type TraitKey = (typeof TRAIT_KEYS)[number];
export type Traits = Record<TraitKey, number>;

export const BODY_NAMES = ["tunic", "robe", "stout", "lanky", "armored", "cloaked"] as const;
export const HEAD_NAMES = ["round", "oval", "square", "long", "pear", "heart"] as const;
export const HAIR_NAMES = [
  "bald",
  "crop",
  "long",
  "topknot",
  "braids",
  "curly",
  "mohawk",
  "hood",
  "helm",
  "feathered_cap",
] as const;
export const BEARD_NAMES = ["none", "stubble", "short", "long", "mustache", "braided"] as const;
export const MARK_NAMES = ["none", "scar", "eyepatch", "freckles", "war_paint"] as const;
export const PALETTE_COUNT = 10;

export const TRAIT_COUNTS: Traits = {
  body: BODY_NAMES.length,
  head: HEAD_NAMES.length,
  hair: HAIR_NAMES.length,
  beard: BEARD_NAMES.length,
  mark: MARK_NAMES.length,
  palette: PALETTE_COUNT,
};

const MIN_DIFFERENCES = 2;
const MAX_ADJUSTMENTS = 64;

export function traitsFromSeed(seed: string): Traits {
  const rng = new Rng(`traits:${seed}`);
  const traits = {} as Traits;
  for (const key of TRAIT_KEYS) traits[key] = rng.int(TRAIT_COUNTS[key]);
  return traits;
}

/** Base appearance of a name: identical in every show and on every machine. */
export function baseTraits(name: string): Traits {
  return traitsFromSeed(normalizeName(name));
}

export function traitDifferences(a: Traits, b: Traits): number {
  return TRAIT_KEYS.filter((key) => a[key] !== b[key]).length;
}

/**
 * Traits for a roster in canonical order. A figure too similar to an earlier one gets its palette
 * and mark re-picked from `name#1`, `name#2`, ... until it differs in at least two traits from every
 * earlier figure and from the base figure of every later name, so names without a collision keep
 * their base figure.
 */
export function resolveCollisions(names: readonly string[]): Traits[] {
  const base = names.map(baseTraits);
  const result: Traits[] = [];
  names.forEach((name, index) => {
    let traits = base[index];
    const earlierClash = (t: Traits) => result.some((other) => traitDifferences(t, other) < MIN_DIFFERENCES);
    if (earlierClash(traits)) {
      const later = base.slice(index + 1);
      const clash = (t: Traits) =>
        earlierClash(t) || later.some((other) => traitDifferences(t, other) < MIN_DIFFERENCES);
      for (let k = 1; clash(traits) && k <= MAX_ADJUSTMENTS; k++) {
        const alt = traitsFromSeed(`${normalizeName(name)}#${k}`);
        traits = k <= MAX_ADJUSTMENTS / 2 ? { ...base[index], palette: alt.palette, mark: alt.mark } : alt;
      }
    }
    result.push(traits);
  });
  return result;
}

/** Same ordering as the backend's canonical roster (case-insensitive, ties by exact name). */
export function canonicalOrder(names: readonly string[]): string[] {
  const key = (n: string) => n.normalize("NFC").toLowerCase();
  return [...names].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}
