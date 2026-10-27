import { HOUSE_COLORS, type HouseId, puppetSpecForCharacter, resolveCollisions, type PuppetSpec } from "../render";
import type { Character, Emotion, FateScript } from "./types";

export interface CastMember {
  character: Character;
  name: string;
  house: HouseId | null;
  color: string;
  spec: (emotion?: Emotion) => PuppetSpec;
}

/** Names, houses and puppet looks for every character in a show. */
export class CastSheet {
  private members = new Map<string, CastMember>();

  constructor(readonly fate: FateScript) {
    // Participant ids follow the canonical roster order, so collision resolution matches the setup preview.
    const participants = fate.characters.filter((c) => c.kind === "participant").sort((a, b) => a.id.localeCompare(b.id));
    const traits = resolveCollisions(participants.map((c) => c.name));
    const traitsOf = new Map(participants.map((c, i) => [c.id, traits[i]]));
    for (const character of fate.characters) {
      const house = (character.house as HouseId | null | undefined) ?? null;
      this.members.set(character.id, {
        character,
        name: character.name,
        house,
        color: house ? HOUSE_COLORS[house].primary : character.kind === "npc" ? "#7a6a58" : "#5a2d82",
        spec: (emotion) => {
          const spec = puppetSpecForCharacter(character, traitsOf.get(character.id), emotion);
          const crowned = character.id === fate.winner && this.crowned;
          return crowned ? { ...spec, crowned: true, royal: true } : spec;
        },
      });
    }
  }

  /** Set once the winner has been crowned, so later puppets of the winner wear the crown. */
  crowned = false;

  get(id: string): CastMember | undefined {
    return this.members.get(id);
  }

  name(id: string): string {
    return id === "narrator" ? "Narrator" : (this.members.get(id)?.name ?? id);
  }

  houseName(houseId: string | null): string {
    if (!houseId) return "The Realm";
    return this.fate.houses.find((h) => h.id === houseId)?.name ?? houseId;
  }
}
