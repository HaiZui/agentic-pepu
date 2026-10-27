import { describe, expect, it } from "vitest";
import { normalizeName } from "./prng";
import {
  TRAIT_COUNTS,
  TRAIT_KEYS,
  baseTraits,
  canonicalOrder,
  resolveCollisions,
  traitDifferences,
  traitsFromSeed,
} from "./traits";
import { BODY_NAMES, HAIR_NAMES } from "./traits";
import { Rng } from "./prng";

const PINNED = [
  "Matti", "Aino", "Kalle", "Jääskeläinen", "Öhman", "Åsa", "Matti K.", "Liisa",
];

describe("name-seeded traits", () => {
  it("are pinned for known names (changing them changes every puppet)", async () => {
    const vectors = Object.fromEntries(PINNED.map((n) => [n, baseTraits(n)]));
    await expect(JSON.stringify(vectors, null, 2) + "\n").toMatchFileSnapshot("./__fixtures__/trait-vectors.json");
  });

  it("ignore case, surrounding whitespace and Unicode composition", () => {
    const composed = baseTraits("Jääskeläinen");
    expect(baseTraits("  JÄÄSKELÄINEN ")).toEqual(composed);
    expect(baseTraits("Ja\u0308a\u0308skela\u0308inen")).toEqual(composed);
    expect(normalizeName("O\u0308hman")).toBe("öhman");
  });

  it("stay within the parts library", () => {
    for (let i = 0; i < 500; i++) {
      const t = traitsFromSeed(`n${i}`);
      for (const key of TRAIT_KEYS) {
        expect(t[key]).toBeGreaterThanOrEqual(0);
        expect(t[key]).toBeLessThan(TRAIT_COUNTS[key]);
      }
    }
    expect(TRAIT_COUNTS.body).toBe(BODY_NAMES.length);
    expect(TRAIT_COUNTS.hair).toBe(HAIR_NAMES.length);
  });
});

describe("collision resolution", () => {
  const randomRoster = (rng: Rng, size: number) =>
    canonicalOrder(Array.from({ length: size }, (_, i) => `Peasant ${rng.int(1_000_000)}-${i}`));

  it("makes every pair differ in at least two traits for 1,000 random 40-name rosters", () => {
    const rng = new Rng("rosters");
    for (let r = 0; r < 1000; r++) {
      const traits = resolveCollisions(randomRoster(rng, 40));
      for (let i = 0; i < traits.length; i++) {
        for (let j = i + 1; j < traits.length; j++) {
          expect(traitDifferences(traits[i], traits[j])).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("leaves names without a collision untouched", () => {
    const rng = new Rng("untouched");
    let checked = 0;
    for (let r = 0; r < 200; r++) {
      const names = randomRoster(rng, 40);
      const resolved = resolveCollisions(names);
      const base = names.map(baseTraits);
      names.forEach((_, i) => {
        const collides = base.some((other, j) => j !== i && traitDifferences(base[i], other) < 2);
        if (!collides) {
          expect(resolved[i]).toEqual(base[i]);
          checked++;
        }
      });
    }
    expect(checked).toBeGreaterThan(5000);
  });

  it("orders names like the backend canonical roster", () => {
    expect(canonicalOrder(["matti K.", "Aino", "Matti A."])).toEqual(["Aino", "Matti A.", "matti K."]);
  });
});
