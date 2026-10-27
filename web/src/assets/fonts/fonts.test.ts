import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "opentype.js";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const FINNISH = "ÄÖÅäöå";
const SAMPLE = "Åsa Jääskeläinen-Öhman";

function load(file: string) {
  const buffer = readFileSync(join(here, file));
  return parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
}

describe.each([
  ["Bangers", "bangers-latin-400-normal.woff"],
  ["Comic Neue 400", "comic-neue-latin-400-normal.woff"],
  ["Comic Neue 700", "comic-neue-latin-700-normal.woff"],
])("%s", (_name, file) => {
  it("contains every Finnish glyph", () => {
    const font = load(file);
    for (const ch of FINNISH + SAMPLE) {
      expect(font.charToGlyphIndex(ch), `missing glyph for "${ch}"`).toBeGreaterThan(0);
    }
  });

  it("ships the woff2 used by the browser next to it", () => {
    expect(readFileSync(join(here, file.replace(/\.woff$/, ".woff2"))).byteLength).toBeGreaterThan(1000);
  });
});

describe("licences", () => {
  it.each(["OFL-Bangers.txt", "OFL-ComicNeue.txt"])("%s is the SIL Open Font License", (file) => {
    expect(readFileSync(join(here, file), "utf-8")).toMatch(/SIL OPEN FONT LICENSE/i);
  });
});
