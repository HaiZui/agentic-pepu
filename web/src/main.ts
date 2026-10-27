import "./styles.css";
import { renderGallery } from "./dev/gallery";
import { renderSetup } from "./setup/setup";
import { renderChronicle } from "./show/chronicle";
import { renderShow } from "./show/show";

const app = document.querySelector<HTMLDivElement>("#app")!;
let cleanup: (() => void) | null = null;
let generation = 0;

function navigate(path: string): void {
  history.pushState({}, "", path);
  render();
}

/** Runs the previous page's cleanup (stops a playing stage) before the next page renders. */
function mount(page: () => void | (() => void) | Promise<void | (() => void)>): void {
  const current = ++generation;
  cleanup?.();
  cleanup = null;
  void Promise.resolve(page()).then((done) => {
    if (typeof done !== "function") return;
    if (current === generation) cleanup = done;
    else done();
  });
}

function render(): void {
  const path = location.pathname.replace(/\/$/, "");
  const chronicleMatch = path.match(/^\/show\/([^/]+)\/chronicle$/);
  const showMatch = path.match(/^\/show\/([^/]+)$/);
  const comicMatch = path.match(/^\/comic\/([^/]+)$/);
  if (path === "/dev/gallery") {
    mount(() => renderGallery(app));
  } else if (path === "/dev/stage") {
    mount(() => import("./dev/stage").then((m) => m.renderStageDev(app)));
  } else if (path === "/dev/comic") {
    mount(() => import("./dev/comic").then((m) => m.renderComicDev(app)));
  } else if (comicMatch) {
    mount(() => import("./comic/page").then((m) => m.renderComicRoute(app, decodeURIComponent(comicMatch[1]))));
  } else if (chronicleMatch) {
    mount(() => renderChronicle(app, decodeURIComponent(chronicleMatch[1]), navigate));
  } else if (showMatch) {
    mount(() => renderShow(app, decodeURIComponent(showMatch[1]), navigate));
  } else {
    mount(() => renderSetup(app, navigate));
  }
}

window.addEventListener("popstate", render);
render();
