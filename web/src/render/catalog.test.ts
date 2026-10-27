import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import openapi from "../api/openapi.json";
import { ARCHETYPES, EMOTIONS, HOUSE_IDS, NPC_ROLES, SETTINGS } from "./catalog";

const pythonCatalog = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../src/bottle_throne/fate/catalog.py"),
  "utf-8",
);

function between(start: string, end: string): string {
  const from = pythonCatalog.indexOf(start);
  return pythonCatalog.slice(from, pythonCatalog.indexOf(end, from));
}

describe("catalog mirrors the backend", () => {
  it("settings and archetypes match the OpenAPI contract", () => {
    const schemas = (openapi as { components: { schemas: Record<string, { properties: Record<string, unknown> }> } })
      .components.schemas;
    const setting = schemas.Beat.properties.setting as { enum: string[] };
    const archetype = schemas.Character.properties.archetype as { anyOf: { enum?: string[] }[] };
    expect([...SETTINGS].sort()).toEqual([...setting.enum].sort());
    expect([...ARCHETYPES].sort()).toEqual([...(archetype.anyOf.find((a) => a.enum)?.enum ?? [])].sort());
  });

  it("emotions match the published /api/catalog", () => {
    const schemas = (openapi as { components: { schemas: Record<string, { properties: Record<string, unknown> }> } })
      .components.schemas;
    const emotions = schemas.Catalog.properties.emotions as { items: { enum: string[] } };
    expect([...EMOTIONS]).toEqual(emotions.items.enum);
  });

  it("house ids match HOUSE_CATALOG", () => {
    const ids = [...between("HOUSE_CATALOG", "NPC_ROLES").matchAll(/\("(\w+)", "\w+"\)/g)].map((m) => m[1]);
    expect(ids).toEqual([...HOUSE_IDS]);
  });

  it("npc roles match NPC_ROLES", () => {
    const roles = [...between("NPC_ROLES", "}").matchAll(/"(\w+)":/g)].map((m) => m[1]);
    expect(roles).toEqual([...NPC_ROLES]);
  });
});
