import {
  getBible,
  getChronicleTexts,
  getScene,
  getStoryStatus,
  storyEventsUrl,
  type GenerationStatus,
  type SceneScript,
} from "../api/client";
import { el } from "../dom";

type BeatStatus = GenerationStatus["beats"][number];
type NameOf = (id: string) => string;

export function statusBadge(status: BeatStatus): HTMLElement {
  return el("span", { class: `badge badge-${status}` }, status === "ready" ? "AI scene" : status);
}

/** Script-style rendering of one scene: captions in boxes, lines with speaker, emotion and action. */
export function renderSceneScript(scene: SceneScript, name: NameOf): HTMLElement {
  const speaker = (id: string) => (id === "narrator" ? "Narrator" : name(id));
  const items: HTMLElement[] = [];
  scene.lines.forEach((line, i) => {
    for (const caption of scene.captions.filter((c) => c.before_line === i)) {
      items.push(el("li", { class: "caption" }, caption.text));
    }
    const extras = [
      ...scene.stage_directions.filter((d) => d.line === i).map((d) => `${speaker(d.character)} ${d.action}s`),
      ...scene.onomatopoeia.filter((o) => o.line === i).map((o) => o.text),
      ...scene.cues.filter((c) => c.line === i).map((c) => `♪ ${c.sfx}`),
    ];
    items.push(
      el(
        "li",
        { class: line.speaker === "narrator" ? "line narrator" : "line" },
        el("strong", {}, speaker(line.speaker)),
        el("span", { class: "emotion" }, ` (${line.emotion}${line.action ? `, ${line.action}` : ""})`),
        ": ",
        line.text,
        extras.length > 0 ? el("span", { class: "extras" }, `  [${extras.join(" · ")}]`) : null,
      ),
    );
  });
  for (const caption of scene.captions.filter((c) => c.before_line >= scene.lines.length)) {
    items.push(el("li", { class: "caption" }, caption.text));
  }
  return el(
    "div",
    { class: "scene" },
    el(
      "p",
      { class: "scene-meta" },
      `music: ${scene.music} · panels: ${scene.panels.map((p) => p.framing).join(", ")} · ${scene.prompt_version}`,
    ),
    el("ol", { class: "script" }, ...items),
  );
}

export interface StoryView {
  progress: HTMLElement;
  bible: HTMLElement;
  chronicle: HTMLElement;
  sceneCells: HTMLElement[];
}

/** Subscribes to generation events and fills the chronicle page as scenes arrive. */
export function followStory(showId: string, view: StoryView, name: NameOf): void {
  const statuses: BeatStatus[] = view.sceneCells.map(() => "pending");
  const loaded = new Set<number>();

  const renderProgress = () => {
    const ready = statuses.filter((s) => s === "ready").length;
    const fallback = statuses.filter((s) => s === "fallback").length;
    view.progress.textContent = `Story: ${ready} AI scenes, ${fallback} fallbacks, ${
      statuses.length - ready - fallback
    } pending of ${statuses.length}`;
  };

  const loadScene = async (index: number, status: BeatStatus) => {
    statuses[index] = status;
    renderProgress();
    if (status === "pending" || loaded.has(index)) return;
    loaded.add(index);
    const scene = await getScene(showId, index);
    view.sceneCells[index].replaceChildren(statusBadge(status), renderSceneScript(scene, name));
  };

  const loadBible = async () => {
    const bible = await getBible(showId);
    view.bible.replaceChildren(
      el("h2", {}, `“${bible.title}”`),
      el("p", { class: "prophecy" }, bible.prophecy),
      el("p", { class: "hint" }, `Motifs: ${bible.motifs.join(" · ")}`),
    );
  };

  const loadChronicle = async () => {
    const texts = await getChronicleTexts(showId);
    view.chronicle.replaceChildren(
      el("h2", {}, `Cover: ${texts.cover_title}`),
      el("p", {}, `Act titles: ${texts.act_titles.act_1} · ${texts.act_titles.act_2} · ${texts.act_titles.act_3}`),
      el("p", { class: "epilogue" }, texts.epilogue),
      el("p", { class: "hint" }, `Blurb: ${texts.blurb}`),
    );
  };

  const source = new EventSource(storyEventsUrl(showId));
  const stopIfDetached = () => {
    if (!view.progress.isConnected) source.close();
    return !view.progress.isConnected;
  };

  source.addEventListener("status", (event) => {
    if (stopIfDetached()) return;
    const status = JSON.parse((event as MessageEvent).data) as GenerationStatus;
    status.beats.forEach((s, i) => void loadScene(i, s));
    if (status.bible_ready) void loadBible();
    if (status.chronicle_ready) void loadChronicle();
  });
  source.addEventListener("beat", (event) => {
    if (stopIfDetached()) return;
    const data = JSON.parse((event as MessageEvent).data) as { index: number; status: BeatStatus };
    void loadScene(data.index, data.status);
  });
  source.addEventListener("bible", () => !stopIfDetached() && void loadBible());
  source.addEventListener("chronicle", () => !stopIfDetached() && void loadChronicle());
  source.addEventListener("complete", () => {
    source.close();
    void getStoryStatus(showId).then((status) => status.beats.forEach((s, i) => void loadScene(i, s)));
  });
  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) view.progress.textContent += " (connection closed)";
  };
  renderProgress();
}
