import type { components } from "../api/schema";

type Schemas = components["schemas"];

export type Archetype = NonNullable<Schemas["Character"]["archetype"]>;
export type SettingId = Schemas["Beat"]["setting"];

// Same order as /api/catalog (checked by catalog.test.ts).
export const EMOTIONS = [
  "neutral",
  "smug",
  "scheming",
  "furious",
  "terrified",
  "grieving",
  "triumphant",
  "dead",
] as const;
export type Emotion = (typeof EMOTIONS)[number];

export const ARCHETYPES: readonly Archetype[] = ["schemer", "brute", "fool", "zealot", "honorable", "coward", "bard"];

export const SETTINGS: readonly SettingId[] = [
  "throne_room",
  "feast_hall",
  "battlefield",
  "ice_wall",
  "forest",
  "dungeon",
  "harbor",
  "city_streets",
  "temple",
  "bridge",
];

// Mirrors HOUSE_CATALOG and NPC_ROLES in src/bottle_throne/fate/catalog.py (checked by catalog.test.ts).
export const HOUSE_IDS = ["wolf", "eel", "goat", "raven", "boar", "stag", "owl", "crab"] as const;
export type HouseId = (typeof HOUSE_IDS)[number];

export const NPC_ROLES = ["adviser", "guard", "food_taster", "herald", "jester"] as const;
export type NpcRole = (typeof NPC_ROLES)[number];
