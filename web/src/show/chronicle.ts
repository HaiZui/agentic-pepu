import { ApiError, getFate, type Beat, type Character, type FateScript } from "../api/client";
import { el } from "../dom";
import "./chronicle.css";
import { shortSeal } from "./seal";
import { followStory, statusBadge } from "./story-view";

const SECTION_TITLES: Record<string, string> = {
  cold_open: "Cold Open",
  act_1: "Act I: The Call",
  act_2: "Act II: The Game",
  act_3: "Act III: The Throne",
  coronation: "Coronation",
};

function describeBeat(beat: Beat, name: (id: string) => string): HTMLElement {
  const roles = beat.roles.map((r) => `${r.role}: ${name(r.character)}`).join(", ");
  const outs = beat.eliminations.map((e) => `${name(e.character)} (${e.mode})`).join(", ");
  return el(
    "tr",
    { class: beat.dramatic ? "dramatic" : "" },
    el("td", {}, String(beat.index)),
    el("td", {}, beat.title, el("div", { class: "card-id" }, `${beat.card} · ${beat.kind}`)),
    el("td", {}, beat.setting.replace(/_/g, " ")),
    el("td", {}, roles),
    el("td", { class: "outs" }, outs),
    el(
      "td",
      {},
      beat.resurrections.length > 0 ? `Risen: ${beat.resurrections.map(name).join(", ")}. ` : "",
      [...beat.facts, ...beat.alliances_formed.map((a) => `allied ${name(a.a)} + ${name(a.b)}`)].join(", "),
      beat.prophecy_hints.length > 0
        ? el("ul", { class: "hints" }, ...beat.prophecy_hints.map((h) => el("li", {}, `"${h.text}"`)))
        : null,
    ),
    el("td", { class: "num" }, `${beat.budget_seconds}s`),
  );
}

function castList(fate: FateScript, byId: Map<string, Character>): HTMLElement {
  const houseName = new Map(fate.houses.map((h) => [h.id, h.name]));
  return el(
    "ul",
    { class: "cast" },
    ...fate.characters.map((c) => {
      const details =
        c.kind === "participant"
          ? [c.archetype, c.house ? houseName.get(c.house) : null, c.is_old_king ? "Old King" : null]
          : [c.kind === "npc" ? `NPC ${c.npc_role}` : "Old King"];
      const winner = c.id === fate.winner ? " ★ winner" : "";
      return el("li", {}, el("strong", {}, byId.get(c.id)?.name ?? c.id), ` (${details.filter(Boolean).join(", ")})${winner}`);
    }),
  );
}

export async function renderChronicle(
  root: HTMLElement,
  showId: string,
  navigate: (path: string) => void,
): Promise<void> {
  const back = el("a", { href: `/show/${encodeURIComponent(showId)}` }, "Back to the show");
  back.addEventListener("click", (event) => {
    event.preventDefault();
    navigate(`/show/${encodeURIComponent(showId)}`);
  });
  root.replaceChildren(el("main", { class: "chronicle" }, el("p", {}, "Unrolling the chronicle...")));

  let fate: FateScript;
  try {
    fate = await getFate(showId);
  } catch (error) {
    const message =
      error instanceof ApiError && error.status === 404 ? "This show does not exist." : "Could not load the fate.";
    root.replaceChildren(el("main", { class: "chronicle" }, el("p", { role: "alert" }, message), back));
    return;
  }

  const byId = new Map(fate.characters.map((c) => [c.id, c]));
  const name = (id: string) => byId.get(id)?.name ?? id;
  const sceneCells = fate.beats.map(() => el("td", { colspan: "7", class: "scene-cell" }, statusBadge("pending")));
  const sections = Object.keys(SECTION_TITLES).map((section) => {
    const beats = fate.beats.filter((b) => b.section === section);
    return el(
      "section",
      {},
      el("h2", {}, SECTION_TITLES[section]),
      el(
        "table",
        {},
        el(
          "thead",
          {},
          el(
            "tr",
            {},
            ...["#", "Card", "Setting", "Roles", "Out", "Notes", "Budget"].map((h) => el("th", {}, h)),
          ),
        ),
        el(
          "tbody",
          {},
          ...beats.flatMap((b) => [describeBeat(b, name), el("tr", { class: "scene-row" }, sceneCells[b.index])]),
        ),
      ),
    );
  });
  const story = {
    progress: el("p", { class: "story-progress", "aria-live": "polite" }),
    bible: el("section", { class: "bible" }),
    chronicle: el("section", { class: "chronicle-texts" }),
    sceneCells,
  };

  const eliminated = fate.beats
    .flatMap((b) => b.eliminations)
    .filter((e) => byId.get(e.character)?.kind === "participant");
  root.replaceChildren(
    el(
      "main",
      { class: "chronicle" },
      el("h1", {}, "Chronicle"),
      el("p", { class: "spoiler" }, "Development view: this page reveals the whole fate, including the winner."),
      el(
        "p",
        {},
        `Seal ${shortSeal(fate.seal)} · ${fate.roster_size} participants · ${fate.beats.length} beats · `,
        `${fate.total_budget_seconds}s budget · ${eliminated.length} eliminations · engine ${fate.engine_version}`,
        fate.seed_mode === "manual" ? " · manual seed" : "",
      ),
      story.progress,
      story.bible,
      el("h2", {}, "Cast"),
      castList(fate, byId),
      ...sections,
      story.chronicle,
      back,
    ),
  );
  followStory(showId, story, name);
}
