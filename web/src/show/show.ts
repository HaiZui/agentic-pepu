import { ApiError, getFate, getShow, revealSeed, type FateScript, type ShowSession } from "../api/client";
import { unlockAudio } from "../audio/context";
import { el } from "../dom";
import { followShow } from "../stage/feed";
import { mountStage, testSpeed } from "../stage/mount";
import { shortSeal } from "./seal";
import "./show.css";

/** The show page: a lobby card over the closed curtain, then the live stage. Returns a cleanup. */
export async function renderShow(
  root: HTMLElement,
  showId: string,
  navigate: (path: string) => void,
): Promise<() => void> {
  const link = (text: string, path: string) => {
    const a = el("a", { href: path }, text);
    a.addEventListener("click", (event) => {
      event.preventDefault();
      navigate(path);
    });
    return a;
  };

  root.replaceChildren(el("main", { class: "setup" }, el("p", {}, "Raising the curtain...")));

  let show: ShowSession;
  let fate: FateScript;
  try {
    [show, fate] = await Promise.all([getShow(showId), getFate(showId)]);
  } catch (error) {
    const message =
      error instanceof ApiError && error.status === 404 ? "This show does not exist." : "Could not load the show.";
    root.replaceChildren(el("main", { class: "setup" }, el("p", { role: "alert" }, message), link("New show", "/")));
    return () => undefined;
  }

  const page = el("div", { class: "show-page" });
  root.replaceChildren(page);
  const stage = mountStage(page, {
    fate,
    texts: { reveal: () => revealSeed(showId).catch(() => null) },
    speed: testSpeed(),
    maxSpeed: 10,
  });

  const progress = el("p", { class: "lobby-progress", "aria-live": "polite", "data-testid": "lobby-progress" }, "Summoning the scribes...");
  const stopFeed = followShow(showId, {
    scene: (scene) => stage.addScene(scene),
    bible: (bible) => (stage.texts.bible = bible),
    chronicle: (texts) => (stage.texts.chronicle = texts),
    progress: (statuses) => {
      const ready = statuses.filter((s) => s !== "pending").length;
      progress.textContent = `Scenes written: ${ready} of ${fate.beats.length}${
        ready < fate.beats.length ? " (you can start now; the rest arrive during the show)" : ""
      }`;
    },
  });

  const oldKing = show.old_king.is_mad_king ? "the Mad King" : show.old_king.name;
  const start = el("button", { type: "button", class: "lobby-start", "data-testid": "start" }, "Raise the curtain");
  const lobby = el(
    "div",
    { class: "lobby", "data-testid": "lobby" },
    el("h1", {}, "The Bottle Throne"),
    el("p", { class: "lobby-meta" }, `${show.participants.length} peasants · Old King: ${oldKing}`),
    el("p", { class: "lobby-seal" }, "Seal of Fate ", el("strong", {}, shortSeal(fate.seal))),
    progress,
    start,
    el("p", { class: "lobby-hint" }, "Press ? during the show for the presenter shortcuts."),
    el(
      "p",
      { class: "lobby-links" },
      link("New show", "/"),
      " · ",
      link("Chronicle (spoilers)", `/show/${encodeURIComponent(show.id)}/chronicle`),
    ),
  );
  stage.renderer.layers.viewport.append(lobby);
  start.addEventListener("click", () => {
    unlockAudio();
    lobby.remove();
    void stage.player.run();
  });
  start.focus();

  return () => {
    stopFeed();
    stage.destroy();
  };
}
