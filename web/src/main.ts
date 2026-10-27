import "./styles.css";
import { renderSetup } from "./setup/setup";
import { renderShow } from "./show/show";

const app = document.querySelector<HTMLDivElement>("#app")!;

function navigate(path: string): void {
  history.pushState({}, "", path);
  render();
}

function render(): void {
  const showMatch = location.pathname.match(/^\/show\/([^/]+)\/?$/);
  if (showMatch) {
    void renderShow(app, decodeURIComponent(showMatch[1]), navigate);
  } else {
    renderSetup(app, navigate);
  }
}

window.addEventListener("popstate", render);
render();
