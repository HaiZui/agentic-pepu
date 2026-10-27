import { el } from "../dom";
import { canonicalOrder, ensureDefs, peasantSpec, puppetSvg, resolveCollisions } from "../render";

/** Base puppets for the entered names, in neutral garments; reveals nothing about the show. */
export function renderCastPreview(names: readonly string[], onClose: () => void): HTMLElement {
  ensureDefs("stage");
  const ordered = canonicalOrder(names);
  const traits = resolveCollisions(ordered);
  const close = el("button", { type: "button", class: "secondary" }, "Close preview");
  close.addEventListener("click", onClose);
  return el(
    "section",
    { class: "cast-preview panel", "aria-label": "Cast preview" },
    el("h2", {}, `The peasants (${ordered.length})`),
    el(
      "div",
      { class: "cast-preview-grid" },
      ...ordered.map((name, i) => el("figure", { class: "cast-preview-cell" }, puppetSvg(peasantSpec(name, traits[i]), { height: 210, label: name }))),
    ),
    close,
  );
}
