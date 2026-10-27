// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { ARCHETYPES, EMOTIONS, HOUSE_IDS, NPC_ROLES } from "./catalog";
import { rotatePoint } from "./geometry";
import { HOUSE_COLORS } from "./palette";
import {
  MAD_KING_NAME,
  peasantSpec,
  puppetSpecForCharacter,
  renderCrowdFigure,
  renderPuppet,
  setEmotion,
} from "./puppet";
import { baseTraits } from "./traits";

const partOf = (puppet: Element, name: string) => puppet.querySelector(`[data-part="${name}"]`)!;
const pivotOf = (el: Element) => el.getAttribute("data-pivot")!.split(",").map(Number) as [number, number];

describe("puppet structure", () => {
  it("has every articulated part with a pivot", () => {
    const puppet = renderPuppet({ ...peasantSpec("Matti"), archetype: "bard" });
    for (const name of ["rod", "figure", "torso", "head", "face", "arm-left", "arm-right", "accessory"]) {
      expect(partOf(puppet, name), name).toBeTruthy();
    }
    for (const name of ["rod", "figure", "torso", "head", "arm-left", "arm-right"]) {
      expect(partOf(puppet, name).getAttribute("data-pivot"), name).toMatch(/^-?\d+,-?\d+$/);
    }
  });

  it("keeps the accessory inside the right arm so they swing together", () => {
    const puppet = renderPuppet({ ...peasantSpec("Matti"), archetype: "honorable" });
    const arm = partOf(puppet, "arm-right");
    expect(arm.querySelector('[data-part="accessory"]')).toBeTruthy();
    expect(partOf(puppet, "torso").querySelector('[data-part="accessory"]')).toBeNull();
  });

  it("keeps the shoulder joint attached when the arm rotates", () => {
    const puppet = renderPuppet(peasantSpec("Aino"));
    for (const side of ["arm-left", "arm-right"]) {
      const arm = partOf(puppet, side);
      const pivot = pivotOf(arm);
      expect(arm.getAttribute("style")).toContain(`transform-origin: ${pivot[0]}px ${pivot[1]}px`);
      for (const angle of [-70, -20, 15, 45]) {
        expect(rotatePoint(pivot, pivot, angle)).toEqual(pivot);
      }
      // The sleeve's top edge starts at the pivot height, inside the torso's shoulder line.
      const sleeveTop = Number(arm.querySelector("path")!.getAttribute("d")!.match(/^M(-?[\d.]+) (-?[\d.]+)/)![2]);
      expect(Math.abs(sleeveTop - (pivot[1] - 4))).toBeLessThan(2);
      expect(Math.abs(pivot[0])).toBeLessThanOrEqual(40);
    }
  });

  it("is deterministic for the same name", () => {
    const a = renderPuppet(peasantSpec("Jääskeläinen")).outerHTML;
    const b = renderPuppet(peasantSpec("  jääskeläinen ")).outerHTML;
    expect(a).toBe(b);
  });

  it("records the traits it was drawn with", () => {
    const t = baseTraits("Öhman");
    const puppet = renderPuppet(peasantSpec("Öhman"));
    expect(puppet.getAttribute("data-traits")).toBe(`${t.body},${t.head},${t.hair},${t.beard},${t.mark},${t.palette}`);
  });
});

describe("expressions", () => {
  it("renders a distinct face for every emotion", () => {
    const faces = EMOTIONS.map((emotion) => {
      const puppet = renderPuppet({ ...peasantSpec("Matti"), emotion });
      expect(partOf(puppet, "face").getAttribute("data-emotion")).toBe(emotion);
      return partOf(puppet, "face").innerHTML;
    });
    expect(new Set(faces).size).toBe(EMOTIONS.length);
  });

  it("dead turns the figure into its ghost variant", () => {
    expect(renderPuppet({ ...peasantSpec("Matti"), emotion: "dead" }).classList.contains("ghost")).toBe(true);
    expect(renderPuppet({ ...peasantSpec("Matti"), emotion: "furious" }).classList.contains("ghost")).toBe(false);
  });

  it("setEmotion swaps only the face and toggles the ghost", () => {
    const puppet = renderPuppet(peasantSpec("Kalle"));
    const torsoBefore = partOf(puppet, "torso").outerHTML;
    setEmotion(puppet, "dead");
    expect(partOf(puppet, "face").getAttribute("data-emotion")).toBe("dead");
    expect(puppet.classList.contains("ghost")).toBe(true);
    setEmotion(puppet, "triumphant");
    expect(puppet.classList.contains("ghost")).toBe(false);
    expect(partOf(puppet, "torso").outerHTML).toBe(torsoBefore);
  });

  it("matches the emotion snapshots", () => {
    for (const emotion of EMOTIONS) {
      expect(partOf(renderPuppet({ ...peasantSpec("Matti"), emotion }), "face").outerHTML).toMatchSnapshot(emotion);
    }
  });
});

describe("house identity", () => {
  it.each(HOUSE_IDS)("House %s shows its colours and sigil", (house) => {
    const puppet = renderPuppet({ ...peasantSpec("Matti"), house });
    const style = puppet.getAttribute("style")!;
    expect(style).toContain(`--base-tabard:${HOUSE_COLORS[house].primary}`);
    expect(puppet.querySelector(`[data-house="${house}"]`)).toBeTruthy();
    expect(puppet.querySelector(`[data-badge="${house}"] [data-sigil="${house}"]`)).toBeTruthy();
    expect(puppet.querySelector(`[data-house="${house}"]`)!.outerHTML).toMatchSnapshot();
  });

  it("houseless participants wear neutral peasant garments", () => {
    const puppet = renderPuppet(peasantSpec("Matti"));
    expect(puppet.querySelector("[data-house]")).toBeNull();
    expect(puppet.getAttribute("style")).not.toContain("--base-tabard");
    expect(puppet.outerHTML).toMatchSnapshot();
  });
});

describe("archetype accessories", () => {
  it.each(ARCHETYPES)("%s carries its accessory", (archetype) => {
    const puppet = renderPuppet({ ...peasantSpec("Matti"), archetype });
    expect(puppet.querySelector(`[data-accessory="${archetype}"]`)).toBeTruthy();
  });

  it("gives every archetype a different accessory drawing", () => {
    const drawings = ARCHETYPES.map((archetype) =>
      partOf(renderPuppet({ ...peasantSpec("Matti"), archetype }), "accessory").innerHTML,
    );
    expect(new Set(drawings).size).toBe(ARCHETYPES.length);
  });
});

describe("special figures", () => {
  it("draws the Mad King crowned and unlike any participant", () => {
    const mad = renderPuppet(puppetSpecForCharacter({ id: "old_king", name: MAD_KING_NAME, kind: "old_king", is_old_king: true }));
    expect(mad.querySelector('[data-part="crown"]')).toBeTruthy();
    expect(mad.querySelector('[data-accessory="scepter"]')).toBeTruthy();
    const plain = renderPuppet(peasantSpec(MAD_KING_NAME));
    expect(plain.querySelector('[data-part="crown"]')).toBeNull();
  });

  it("crowns a named Old King, competing or not", () => {
    const named = renderPuppet(puppetSpecForCharacter({ id: "old_king", name: "Jukka", kind: "old_king", is_old_king: true }));
    const competing = renderPuppet(
      puppetSpecForCharacter({ id: "p01", name: "Aino", kind: "participant", is_old_king: true, house: "raven", archetype: "schemer" }),
    );
    expect(named.querySelector('[data-part="crown"]')).toBeTruthy();
    expect(competing.querySelector('[data-part="crown"]')).toBeTruthy();
    expect(competing.querySelector('[data-accessory="schemer"]')).toBeTruthy();
  });

  it.each(NPC_ROLES)("NPC %s has its own figure and prop", (role) => {
    const npc = renderPuppet(puppetSpecForCharacter({ id: `npc_${role}`, name: role, kind: "npc", npc_role: role, is_old_king: false }));
    expect(npc.querySelector(`[data-accessory="${role}"]`)).toBeTruthy();
    expect(npc.getAttribute("data-character")).toBe(`npc_${role}`);
  });

  it("draws crowd silhouettes in the given colour", () => {
    const figure = renderCrowdFigure("c1", HOUSE_COLORS.eel.primary);
    expect(figure.innerHTML).toContain(HOUSE_COLORS.eel.primary);
    expect(figure.querySelector('[data-part="face"]')).toBeNull();
  });
});

describe("vector output", () => {
  it("contains no raster images", () => {
    const html = renderPuppet({ ...peasantSpec("Matti"), house: "goat", archetype: "bard" }).outerHTML;
    expect(html).not.toMatch(/<image|<img|data:image/);
  });
});
