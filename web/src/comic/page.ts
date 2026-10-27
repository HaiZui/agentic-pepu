import {
  getChronicleTexts,
  getFate,
  getScene,
  getBible,
  getShow,
  revealSeed,
  type ChronicleTexts,
  type ShowBible,
} from "../api/client";
import { audioAttributions } from "../audio/context";
import { el } from "../dom";
import { renderComic, type ComicData } from "./render";

declare global {
  interface Window {
    __comicReady?: boolean;
    __comicError?: string;
    __comicStats?: { pages: number; panels: number; unfit: string[] };
  }
}

/** Render `data` and tell a headless printer (or a test) when the pages are final. */
export async function showComic(root: HTMLElement, data: ComicData): Promise<void> {
  window.__comicReady = false;
  window.__comicError = undefined;
  try {
    window.__comicStats = await renderComic(root, data);
    // Two frames so the last layout pass is painted before anyone prints.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.__comicReady = true;
  } catch (error) {
    window.__comicError = error instanceof Error ? error.message : String(error);
    root.append(el("p", { role: "alert" }, `The comic could not be drawn: ${window.__comicError}`));
  }
}

/** /comic/{id}: the printable comic of a show, built only from data the stage already used. */
export async function renderComicRoute(root: HTMLElement, showId: string): Promise<void> {
  root.replaceChildren(el("p", { class: "comic-loading" }, "Inking the comic..."));
  try {
    const [show, fate] = await Promise.all([getShow(showId), getFate(showId)]);
    const optional = <T,>(promise: Promise<T>) => promise.catch(() => null);
    const [scenes, chronicle, bible, reveal, attributions] = await Promise.all([
      Promise.all(fate.beats.map((b) => getScene(showId, b.index))),
      optional<ChronicleTexts>(getChronicleTexts(showId)),
      optional<ShowBible>(getBible(showId)),
      optional(revealSeed(showId)),
      audioAttributions(),
    ]);
    await showComic(root, { fate, scenes, chronicle, bible, reveal, createdAt: show.created_at, attributions });
  } catch (error) {
    window.__comicError = error instanceof Error ? error.message : String(error);
    root.replaceChildren(el("p", { role: "alert" }, `The comic could not be loaded: ${window.__comicError}`));
  }
}
