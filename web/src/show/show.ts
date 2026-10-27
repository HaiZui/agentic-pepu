import { ApiError, getShow, type ShowSession } from "../api/client";
import { el } from "../dom";

export async function renderShow(
  root: HTMLElement,
  showId: string,
  navigate: (path: string) => void,
): Promise<void> {
  const back = el("a", { href: "/", class: "back" }, "New show");
  back.addEventListener("click", (event) => {
    event.preventDefault();
    navigate("/");
  });

  root.replaceChildren(el("main", { class: "setup" }, el("p", {}, "Raising the curtain...")));

  let show: ShowSession;
  try {
    show = await getShow(showId);
  } catch (error) {
    const message =
      error instanceof ApiError && error.status === 404 ? "This show does not exist." : "Could not load the show.";
    root.replaceChildren(el("main", { class: "setup" }, el("p", { role: "alert" }, message), back));
    return;
  }

  const oldKingText = show.old_king.is_mad_king
    ? "The Mad King (no previous winner given)"
    : `${show.old_king.name}${show.old_king.is_participant ? " (also competing)" : ""}`;

  root.replaceChildren(
    el(
      "main",
      { class: "setup" },
      el("header", {}, el("h1", {}, "The Bottle Throne"), el("p", { class: "subtitle" }, `Show ${show.id}`)),
      el(
        "section",
        { class: "panel" },
        el("p", {}, el("strong", {}, "Old King: "), oldKingText),
        el("p", {}, el("strong", {}, "Seed: "), show.seed_mode === "manual" ? "manual" : "automatic"),
        el("p", {}, el("strong", {}, `${show.participants.length} peasants:`)),
        el(
          "ul",
          { class: "roster-chips" },
          ...show.participants.map((p) => el("li", {}, p.is_old_king ? `${p.name} (Old King)` : p.name)),
        ),
        el("p", { class: "hint" }, "The stage is still being built. This placeholder shows the recorded show."),
        back,
      ),
    ),
  );
}
