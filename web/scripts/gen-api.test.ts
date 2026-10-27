import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error - plain ESM script without type declarations
import { generateTypes, openapiPath, schemaPath } from "./gen-api.mjs";

const normalize = (text: string) => text.replace(/\r\n/g, "\n");

describe("generated API types", () => {
  it("schema.d.ts matches openapi.json (run `npm run gen:api` if this fails)", async () => {
    const expected = await generateTypes(readFileSync(openapiPath, "utf-8"));
    const actual = readFileSync(schemaPath, "utf-8");
    expect(normalize(actual)).toBe(normalize(expected));
  });
});
