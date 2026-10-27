import "./styles.css";
import { renderGallery } from "./dev/gallery";
import { renderSetup } from "./setup/setup";
import { renderChronicle } from "./show/chronicle";
import { renderShow } from "./show/show";

const app = document.querySelector<HTMLDivElement>("#app")!;

function navigate(path: string): void {
  history.pushState({}, "", path);
  render();
}

function render(): void {
  const chronicleMatch = location.pathname.match(/^\/show\/([^/]+)\/chronicle\/?$/);
  const showMatch = location.pathname.match(/^\/show\/([^/]+)\/?$/);
  if (location.pathname.replace(/\/$/, "") === "/dev/gallery") {
    renderGallery(app);
  } else if (chronicleMatch) {
    void renderChronicle(app, decodeURIComponent(chronicleMatch[1]), navigate);
  } else if (showMatch) {
    void renderShow(app, decodeURIComponent(showMatch[1]), navigate);
  } else {
    renderSetup(app, navigate);
  }
}

window.addEventListener("popstate", render);
render();
