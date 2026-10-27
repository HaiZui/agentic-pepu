/** Name normalisation shared by every name-seeded drawing: NFC, trimmed, case-insensitive. */
export function normalizeName(name: string): string {
  return name.normalize("NFC").trim().toLowerCase();
}

/** xmur3 string hash: yields 32-bit seeds for sfc32. */
export function xmur3(text: string): () => number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/** sfc32 small fast counter PRNG, returning floats in [0, 1). */
export function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export class Rng {
  private readonly next01: () => number;

  constructor(seed: string) {
    const hash = xmur3(seed);
    this.next01 = sfc32(hash(), hash(), hash(), hash());
  }

  next(): number {
    return this.next01();
  }

  int(n: number): number {
    return Math.floor(this.next01() * n);
  }

  range(min: number, max: number): number {
    return min + this.next01() * (max - min);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }
}
