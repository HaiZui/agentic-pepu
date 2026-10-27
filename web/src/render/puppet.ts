import type { components } from "../api/schema";
import type { Archetype, Emotion, HouseId, NpcRole } from "./catalog";
import { papered } from "./defs";
import { renderFace } from "./face";
import {
  NECK,
  PUPPET_VIEWBOX,
  ROD_BOTTOM,
  ROD_TOP,
  SHOULDER_LEFT,
  SHOULDER_RIGHT,
  renderBeard,
  renderBody,
  renderHairBack,
  renderHairFront,
  renderHead,
  renderMark,
} from "./figure-parts";
import { cutPath, ellipsePoints, type Point } from "./geometry";
import { HOUSE_COLORS, PALETTES, type FigurePalette } from "./palette";
import { normalizeName, Rng } from "./prng";
import {
  renderAccessory,
  renderArm,
  renderCrown,
  renderErmine,
  renderJesterHat,
  renderNpcCostume,
  renderNpcProp,
  renderRoyalCape,
  renderScepter,
} from "./props";
import { renderSigilBadge } from "./sigils";
import { g, path, s, svgRoot } from "./svg";
import { baseTraits, type Traits } from "./traits";

type Character = components["schemas"]["Character"];

export const MAD_KING_NAME = "the Mad King";

export interface PuppetSpec {
  /** Seed for the hand-cut wobble; the normalised name keeps a figure identical every week. */
  seed: string;
  traits: Traits;
  emotion?: Emotion;
  house?: HouseId | null;
  archetype?: Archetype | null;
  crowned?: boolean;
  royal?: boolean;
  madKing?: boolean;
  npcRole?: NpcRole | null;
  palette?: FigurePalette;
  characterId?: string;
}

const NPC_TRAITS: Record<NpcRole, Traits> = {
  guard: { body: 4, head: 2, hair: 8, beard: 2, mark: 1, palette: 2 },
  adviser: { body: 1, head: 3, hair: 0, beard: 3, mark: 0, palette: 6 },
  food_taster: { body: 2, head: 0, hair: 1, beard: 0, mark: 3, palette: 0 },
  herald: { body: 0, head: 1, hair: 9, beard: 4, mark: 0, palette: 8 },
  jester: { body: 3, head: 5, hair: 0, beard: 0, mark: 0, palette: 3 },
};

const MAD_KING_TRAITS: Traits = { body: 1, head: 3, hair: 5, beard: 3, mark: 0, palette: 8 };
const MAD_KING_PALETTE: FigurePalette = { skin: "#f1d3b8", hair: "#e8e2d5", garment: "#5a2d82", trim: "#d4a326" };

const pivotStyle = ([x, y]: Point) => `transform-origin: ${x}px ${y}px`;
const part = (name: string, pivot: Point, ...children: (SVGElement | null)[]) =>
  g({ "data-part": name, "data-pivot": `${pivot[0]},${pivot[1]}`, style: pivotStyle(pivot) }, ...children);

function renderTabard(house: HouseId, rng: Rng): SVGGElement {
  const tabard: Point[] = [[-18, -188], [18, -188], [22, -12], [0, -2], [-22, -12]];
  return g(
    { "data-house": house },
    papered(cutPath(tabard, rng), "tabard"),
    path(cutPath([[-18, -188], [18, -188], [18, -178], [-18, -178]], rng, 0.4), "tabard-trim ink-thin"),
    renderSigilBadge(house, 0, -132, 32),
  );
}

/** Builds an articulated paper puppet. Parts: rod, figure, torso, head, face, arm-left, arm-right, accessory. */
export function renderPuppet(spec: PuppetSpec): SVGGElement {
  const rng = new Rng(`shape:${spec.seed}`);
  const t = spec.traits;
  const emotion = spec.emotion ?? "neutral";
  const palette = spec.palette ?? PALETTES[t.palette];
  const house = spec.house ?? null;
  const colors = house ? HOUSE_COLORS[house] : null;

  const style = [
    `--base-skin:${palette.skin}`,
    `--base-hair:${palette.hair}`,
    `--base-garment:${palette.garment}`,
    `--base-trim:${palette.trim}`,
    colors ? `--base-tabard:${colors.primary}` : "",
    colors ? `--base-tabard-trim:${colors.secondary}` : "",
  ]
    .filter(Boolean)
    .join(";");

  const isJester = spec.npcRole === "jester";
  const hairBack = isJester ? null : renderHairBack(t.hair, rng);
  const hairFront = isJester ? renderJesterHat(rng) : renderHairFront(t.hair, rng);

  const torso = part(
    "torso",
    [0, -100],
    renderBody(t.body, rng),
    house ? renderTabard(house, rng) : null,
    spec.npcRole ? renderNpcCostume(spec.npcRole, rng) : null,
    spec.royal || spec.madKing ? renderErmine(rng) : null,
  );

  const head = part(
    "head",
    NECK,
    hairBack,
    renderHead(t.head, rng),
    renderBeard(t.beard, rng),
    renderFace(emotion),
    renderMark(t.mark, rng),
    hairFront,
    spec.crowned || spec.madKing ? renderCrown(rng, spec.madKing ? -14 : 0) : null,
  );

  let accessory: SVGGElement | null = null;
  if (spec.npcRole) accessory = renderNpcProp(spec.npcRole, rng);
  else if (spec.madKing || (spec.royal && !spec.archetype)) accessory = renderScepter(rng);
  else if (spec.archetype) accessory = renderAccessory(spec.archetype, rng);

  const figure = g(
    { "data-part": "figure", "data-pivot": "0,0", class: "paper", style: pivotStyle([0, 0]) },
    spec.royal || spec.madKing ? renderRoyalCape(rng) : null,
    part("arm-left", SHOULDER_LEFT, ...renderArm("left", rng)),
    torso,
    head,
    part("arm-right", SHOULDER_RIGHT, ...renderArm("right", rng), accessory),
  );

  const rod = part(
    "rod",
    [0, ROD_BOTTOM],
    path(cutPath([[-4, ROD_TOP], [4, ROD_TOP], [5, ROD_BOTTOM], [-5, ROD_BOTTOM]], rng, 0.4), "wood ink"),
  );

  return g(
    {
      class: emotion === "dead" ? "puppet ghost" : "puppet",
      "data-character": spec.characterId,
      "data-traits": `${t.body},${t.head},${t.hair},${t.beard},${t.mark},${t.palette}`,
      "data-emotion": emotion,
      style,
    },
    rod,
    figure,
  );
}

/** Swap the expression in place; `dead` also turns the figure into its ghost variant. */
export function setEmotion(puppet: SVGGElement, emotion: Emotion): void {
  const face = puppet.querySelector('[data-part="face"]');
  face?.replaceWith(renderFace(emotion));
  puppet.classList.toggle("ghost", emotion === "dead");
  puppet.setAttribute("data-emotion", emotion);
}

/** Maps a fate-script character to a puppet. Pass in-show traits (after collision resolution) when known. */
export function puppetSpecForCharacter(character: Character, traits?: Traits, emotion?: Emotion): PuppetSpec {
  if (character.kind === "npc" && character.npc_role) {
    const role = character.npc_role as NpcRole;
    return { seed: `npc:${role}`, traits: NPC_TRAITS[role], npcRole: role, emotion, characterId: character.id };
  }
  if (character.kind === "old_king" && character.name === MAD_KING_NAME) {
    return {
      seed: "mad-king",
      traits: MAD_KING_TRAITS,
      palette: MAD_KING_PALETTE,
      madKing: true,
      emotion,
      characterId: character.id,
    };
  }
  return {
    seed: normalizeName(character.name),
    traits: traits ?? baseTraits(character.name),
    house: (character.house as HouseId | null | undefined) ?? null,
    archetype: character.archetype ?? null,
    crowned: character.is_old_king,
    royal: character.is_old_king,
    emotion,
    characterId: character.id,
  };
}

/** Base puppet for a bare name (setup preview): neutral peasant garments, no house or archetype. */
export function peasantSpec(name: string, traits?: Traits): PuppetSpec {
  return { seed: normalizeName(name), traits: traits ?? baseTraits(name) };
}

/** Simplified background-crowd silhouette in a house colour (or a neutral tone). */
export function renderCrowdFigure(seed: string, color: string): SVGGElement {
  const rng = new Rng(`crowd:${seed}`);
  const scale = rng.range(0.9, 1.1);
  const headR = 15 * scale;
  const body: Point[] = [[-22, -86], [22, -86], [30, 0], [-30, 0]].map(([x, y]) => [x * scale, y * scale] as Point);
  const variant = rng.int(4);
  const extras: SVGElement[] = [];
  if (variant === 1) extras.push(path(cutPath([[-2, -150], [2, -150], [2, 0], [-2, 0]].map(([x, y]) => [x + 30, y] as Point), rng, 0.3), "wood ink-thin"));
  if (variant === 2) extras.push(path(cutPath(ellipsePoints(0, -104 * scale, 20 * scale, 9 * scale, 10, Math.PI), rng, 0.6), "steel ink-thin"));
  if (variant === 3) extras.push(path(cutPath([[-16, -112], [0, -136], [16, -112]].map(([x, y]) => [x * scale, y * scale] as Point), rng, 0.6), "ink-thin", { fill: color }));
  return g(
    { class: "crowd-figure", "data-crowd": seed },
    path(cutPath(body, rng), "ink", { fill: color }),
    path(cutPath(ellipsePoints(0, -102 * scale, headR, headR, 12), rng, 0.8), "ink", { fill: color }),
    path(cutPath(body, null), "halftone"),
    ...extras,
  );
}

/** Paper name card for a puppet; `width` grows with the name length. */
export function renderNameCard(name: string, house?: HouseId | null): SVGGElement {
  const width = Math.max(90, [...name].length * 13 + (house ? 40 : 24));
  const rng = new Rng(`card:${normalizeName(name)}`);
  const text = s("text", {
    x: house ? 12 : 0,
    y: 8,
    "text-anchor": "middle",
    "font-size": 24,
    class: "name-card",
    fill: "#1b130b",
  });
  text.textContent = name;
  return g(
    { class: "name-card-group" },
    papered(cutPath([[-width / 2, -18], [width / 2, -18], [width / 2, 18], [-width / 2, 18]], rng, 0.8), "paper-fill"),
    house ? renderSigilBadge(house, -width / 2 + 18, 0, 26) : null,
    text,
  );
}

/** Standalone SVG with one puppet and an optional name card, sized by height in CSS pixels. */
export function puppetSvg(spec: PuppetSpec, options: { height?: number; label?: string } = {}): SVGSVGElement {
  const puppet = renderPuppet(spec);
  const svg = svgRoot(PUPPET_VIEWBOX, {
    class: "puppet-svg",
    height: options.height ?? 240,
    role: "img",
    "aria-label": options.label ?? "puppet",
  });
  svg.append(puppet);
  if (options.label) {
    const card = renderNameCard(options.label, spec.house);
    card.setAttribute("transform", "translate(0 118)");
    svg.append(card);
  }
  return svg;
}
