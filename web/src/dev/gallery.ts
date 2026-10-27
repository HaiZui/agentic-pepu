import { el } from "../dom";
import {
  ARCHETYPES,
  EMOTIONS,
  HOUSE_COLORS,
  HOUSE_IDS,
  MAD_KING_NAME,
  NPC_ROLES,
  PALETTES,
  PUPPET_VIEWBOX,
  SCENERY_VIEWBOX,
  SETTINGS,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  canonicalOrder,
  ensureDefs,
  peasantSpec,
  puppetSpecForCharacter,
  puppetSvg,
  renderBanner,
  renderCrowdFigure,
  renderProscenium,
  renderPuppet,
  renderScenery,
  resolveCollisions,
  vectorizeTextures,
  type RenderMode,
} from "../render";
import { SVG_NS } from "../render/svg";
import "./gallery.css";

const SAMPLE_NAMES = [
  "Matti", "Aino", "Kalle", "Jääskeläinen", "Öhman", "Åsa", "Liisa", "Pekka", "Sanna", "Timo", "Ulla", "Ville",
];

function section(title: string, ...children: (Node | string)[]): HTMLElement {
  return el("section", { class: "gallery-section" }, el("h2", {}, title), ...children);
}

function figureCell(svg: SVGSVGElement, caption: string): HTMLElement {
  return el("figure", { class: "cell" }, svg, el("figcaption", {}, caption));
}

function stageBox(...layers: SVGElement[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`);
  svg.setAttribute("class", "stage-box");
  svg.append(...layers);
  return svg;
}

async function fontStatus(): Promise<HTMLElement> {
  await document.fonts.ready;
  await Promise.all([
    document.fonts.load('48px "Bangers"', "ÄÖÅäöå"),
    document.fonts.load('700 24px "Comic Neue"', "ÄÖÅäöå"),
    document.fonts.load('400 24px "Comic Neue"', "ÄÖÅäöå"),
  ]);
  const faces = [...document.fonts].filter((f) => ["Bangers", "Comic Neue"].includes(f.family.replace(/"/g, "")));
  const loaded = faces.filter((f) => f.status === "loaded").map((f) => `${f.family} ${f.weight}`);
  const urls = performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .filter((n) => /\.woff2?($|\?)/.test(n));
  const remote = urls.filter((u) => new URL(u).origin !== location.origin);
  return el(
    "ul",
    { class: "font-status", "data-testid": "font-status" },
    el("li", {}, `Loaded faces: ${loaded.join(", ") || "none"}`),
    el("li", {}, `Font files: ${urls.length} local, ${remote.length} remote`),
    el("li", {}, `Bangers covers ÄÖÅäöå: ${document.fonts.check('48px "Bangers"', "ÄÖÅäöå")}`),
  );
}

export function renderGallery(root: HTMLElement): void {
  const mode: RenderMode = new URLSearchParams(location.search).get("mode") === "print" ? "print" : "stage";
  ensureDefs(mode);

  const status = el("div", {}, "Checking fonts...");
  void fontStatus().then((list) => status.replaceChildren(list));

  const names = canonicalOrder(SAMPLE_NAMES);
  const traits = resolveCollisions(names);
  const cast = names.map((name, i) => figureCell(puppetSvg(peasantSpec(name, traits[i]), { height: 220, label: name }), ""));

  const matti = peasantSpec("Matti");
  const emotions = EMOTIONS.map((emotion) =>
    figureCell(puppetSvg({ ...matti, emotion, house: "goat", archetype: "bard" }, { height: 200 }), emotion),
  );

  const swing = puppetSvg({ ...peasantSpec("Kalle"), house: "wolf", archetype: "honorable", emotion: "furious" }, { height: 300 });
  swing.classList.add("articulation-demo");
  for (const [x, y] of [[34, -180], [-34, -180], [0, -198]]) {
    const marker = document.createElementNS(SVG_NS, "circle");
    marker.setAttribute("cx", String(x));
    marker.setAttribute("cy", String(y));
    marker.setAttribute("r", "4");
    marker.setAttribute("class", "pivot-marker");
    swing.append(marker);
  }

  const archetypes = ARCHETYPES.map((archetype, i) =>
    figureCell(
      puppetSvg({ ...peasantSpec(names[i]), archetype, house: HOUSE_IDS[i], emotion: "smug" }, { height: 220 }),
      archetype,
    ),
  );

  const houses = HOUSE_IDS.map((house, i) =>
    figureCell(
      puppetSvg({ ...peasantSpec(names[(i + 3) % names.length]), house, archetype: ARCHETYPES[i % ARCHETYPES.length] }, {
        height: 220,
        label: `House ${house}`,
      }),
      house,
    ),
  );
  const bannerRow = document.createElementNS(SVG_NS, "svg");
  bannerRow.setAttribute("viewBox", "0 -10 1700 330");
  bannerRow.setAttribute("class", "banner-row");
  HOUSE_IDS.forEach((house, i) => {
    const banner = renderBanner(house, 300);
    banner.setAttribute("transform", `translate(${100 + i * 210} 0)`);
    bannerRow.append(banner);
  });

  const specials = [
    figureCell(
      puppetSvg(puppetSpecForCharacter({ id: "old_king", name: MAD_KING_NAME, kind: "old_king", is_old_king: true }), { height: 240 }),
      "the Mad King",
    ),
    figureCell(
      puppetSvg(puppetSpecForCharacter({ id: "old_king", name: "Jukka", kind: "old_king", is_old_king: true }), { height: 240, label: "Jukka" }),
      "named Old King",
    ),
    figureCell(
      puppetSvg(
        puppetSpecForCharacter({ id: "p02", name: "Aino", kind: "participant", is_old_king: true, house: "raven", archetype: "schemer" }),
        { height: 240, label: "Aino" },
      ),
      "Old King competing",
    ),
    ...NPC_ROLES.map((role) =>
      figureCell(
        puppetSvg(puppetSpecForCharacter({ id: `npc_${role}`, name: role, kind: "npc", npc_role: role, is_old_king: false }), { height: 240 }),
        role,
      ),
    ),
  ];

  const crowd = document.createElementNS(SVG_NS, "svg");
  crowd.setAttribute("viewBox", "0 -170 1600 180");
  crowd.setAttribute("class", "crowd-row");
  for (let i = 0; i < 24; i++) {
    const house = HOUSE_IDS[i % HOUSE_IDS.length];
    const figure = renderCrowdFigure(`c${i}`, HOUSE_COLORS[house].primary);
    figure.setAttribute("transform", `translate(${40 + i * 64} 0)`);
    crowd.append(figure);
  }

  const sceneries = [...SETTINGS, "unknown_place"].map((setting) => {
    const scenery = renderScenery(setting, { banners: setting === "battlefield" ? ["wolf", "eel"] : [] });
    const puppet = renderPuppet({ ...peasantSpec("Öhman"), house: "eel", archetype: "brute" });
    puppet.setAttribute("transform", "translate(960 900) scale(1.1)");
    const svg = stageBox(scenery.back, scenery.mid, puppet, scenery.front);
    svg.setAttribute("viewBox", `0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`);
    return figureCell(svg, `${setting} → ${scenery.setting}`);
  });

  const closed = renderProscenium();
  const open = renderProscenium();
  open.setCurtains(1);
  const live = renderProscenium();
  let liveOpen = 0;
  const toggle = el("button", { type: "button" }, "Toggle curtains");
  toggle.addEventListener("click", () => {
    liveOpen = liveOpen ? 0 : 1;
    live.setCurtains(liveOpen);
  });
  const throne = renderScenery("throne_room");

  root.replaceChildren(
    el(
      "main",
      { class: "gallery", "data-mode": mode },
      el("h1", {}, "Puppet & Scenery Gallery"),
      el(
        "p",
        {},
        `Mode: ${mode}. `,
        el("a", { href: mode === "print" ? "/dev/gallery" : "/dev/gallery?mode=print" }, mode === "print" ? "Switch to stage mode" : "Switch to print mode"),
      ),
      section(
        "Lettering",
        el("p", { class: "sample-display" }, "KRAKOOM! Åsa Jääskeläinen-Öhman ÄÖÅäöå"),
        el("p", { class: "sample-lettering" }, "“You dare challenge the Wolf, Jääskeläinen?” ÄÖÅäöå"),
        status,
      ),
      section(
        "Palette",
        el("div", { class: "swatches" }, ...PALETTES.map((p) => el("span", { class: "swatch", style: `background:${p.garment};border-color:${p.trim}` }, ""))),
      ),
      section("Sample cast (neutral peasant garments)", el("div", { class: "grid" }, ...cast)),
      section("Expressions", el("div", { class: "grid" }, ...emotions)),
      section("Articulation (arm and head swing around their pivots)", swing),
      section("Archetype accessories", el("div", { class: "grid" }, ...archetypes)),
      section("Houses", el("div", { class: "grid" }, ...houses), bannerRow),
      section("Old Kings, NPCs and crowds", el("div", { class: "grid" }, ...specials), crowd),
      section("Scenery", el("div", { class: "scenery-grid" }, ...sceneries)),
      section(
        "Proscenium",
        el(
          "div",
          { class: "scenery-grid" },
          figureCell(stageBox(throne.back, throne.mid, throne.front, closed.root), "closed"),
          figureCell(stageBox(renderScenery("throne_room").back, open.root), "open"),
          figureCell(stageBox(renderScenery("temple").back, live.root), "live"),
        ),
        toggle,
      ),
      el("p", { class: "hint" }, `Puppet viewBox ${PUPPET_VIEWBOX}; scenery viewBox with bleed ${SCENERY_VIEWBOX}.`),
    ),
  );
  if (mode === "print") vectorizeTextures(root);
}
