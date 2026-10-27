import { ApiError, createShow, getHealth } from "../api/client";
import { el } from "../dom";
import { renderCastPreview } from "./preview";
import "./setup.css";
import { splitLines, validateRoster, type RosterValidation } from "./validation";

const FOUNDRY_LABELS: Record<string, string> = {
  api_key: "FOUNDRY_API_KEY",
  endpoint: "FOUNDRY_API_ENDPOINT",
  deployment: "FOUNDRY_LLM_DEPLOYMENT_NAME",
};

export function renderSetup(root: HTMLElement, navigate: (path: string) => void): void {
  const participants = el("textarea", {
    id: "participants",
    rows: "16",
    spellcheck: "false",
    placeholder: "Matti\nAino\nJääskeläinen\n...",
  });
  const count = el("p", { class: "count", "aria-live": "polite" });
  const chips = el("ul", { class: "roster-chips", "aria-label": "Parsed roster" });

  const oldKing = el("input", { id: "old-king", type: "text", autocomplete: "off" });
  const seed = el("input", { id: "seed", type: "text", autocomplete: "off" });
  const issues = el("ul", { class: "issues", "aria-live": "polite" });
  const serverError = el("p", { class: "server-error", role: "alert", hidden: true });
  const configWarning = el("p", { class: "config-warning", role: "status", hidden: true });

  const preview = el("button", { type: "button", class: "secondary", disabled: true }, "Preview cast");
  const previewSlot = el("div", { class: "preview-slot" });
  const start = el("button", { type: "button", class: "start", disabled: true }, "START THE SHOW");

  const page = el(
    "main",
    { class: "setup" },
    el(
      "header",
      {},
      el("h1", {}, "The Bottle Throne"),
      el("p", { class: "subtitle" }, "A Friday bottle raffle in three acts"),
    ),
    configWarning,
    el(
      "section",
      { class: "setup-grid" },
      el(
        "div",
        { class: "panel" },
        el("label", { for: "participants" }, "Participants ", el("span", {}, "(one per line)")),
        participants,
        count,
        chips,
      ),
      el(
        "div",
        { class: "panel" },
        el("label", { for: "old-king" }, "Old King ", el("span", {}, "(last week's winner)")),
        oldKing,
        el("p", { class: "hint" }, "Leave empty and the Mad King holds the throne."),
        el(
          "details",
          { class: "advanced" },
          el("summary", {}, "Advanced: manual seed"),
          el("label", { for: "seed" }, "Seed"),
          seed,
          el("p", { class: "hint" }, "Only for replaying or verifying a show. Manual seeds are marked as such."),
        ),
        issues,
        el("div", { class: "actions" }, preview, start),
        serverError,
      ),
    ),
    previewSlot,
  );

  let current: RosterValidation = validateRoster([]);
  let submitting = false;

  function refresh(): void {
    current = validateRoster(splitLines(participants.value), oldKing.value);
    const n = current.entries.length;
    count.textContent = `${n} ${n === 1 ? "peasant" : "peasants"}`;

    chips.replaceChildren(
      ...current.entries.map((entry) =>
        el(
          "li",
          {
            class: entry.issues.length > 0 ? "flagged" : "",
            title: entry.issues.map((rule) => rule.replace(/_/g, " ")).join(", "),
          },
          entry.name,
        ),
      ),
    );
    oldKing.classList.toggle("flagged", current.oldKingIssues.length > 0);
    issues.replaceChildren(...current.issues.map((issue) => el("li", {}, issue.message)));
    start.disabled = !current.valid || submitting;
    preview.disabled = previewableNames().length === 0;
  }

  function previewableNames(): string[] {
    return current.entries.filter((entry) => entry.issues.length === 0).map((entry) => entry.name);
  }

  function showPreview(): void {
    const names = previewableNames();
    if (names.length === 0) return;
    previewSlot.replaceChildren(renderCastPreview(names, () => previewSlot.replaceChildren()));
    previewSlot.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submit(): Promise<void> {
    if (!current.valid || submitting) return;
    submitting = true;
    serverError.hidden = true;
    refresh();
    try {
      const seedValue = seed.value.trim();
      const show = await createShow({
        participants: current.names,
        old_king: current.oldKing,
        seed: seedValue.length > 0 ? seedValue : null,
      });
      navigate(`/show/${encodeURIComponent(show.id)}`);
    } catch (error) {
      serverError.textContent =
        error instanceof ApiError ? error.messages.join(" ") : "Could not reach the backend.";
      serverError.hidden = false;
    } finally {
      submitting = false;
      refresh();
    }
  }

  participants.addEventListener("input", refresh);
  oldKing.addEventListener("input", refresh);
  start.addEventListener("click", () => void submit());
  preview.addEventListener("click", showPreview);

  root.replaceChildren(page);
  refresh();
  participants.focus();

  getHealth()
    .then((health) => {
      const missing = Object.entries(health.foundry)
        .filter(([, present]) => !present)
        .map(([key]) => FOUNDRY_LABELS[key] ?? key);
      if (missing.length > 0) {
        configWarning.textContent =
          `Foundry configuration is incomplete (missing ${missing.join(", ")}). ` +
          "The show can still run, but AI-written dialogue will not be available.";
        configWarning.hidden = false;
      }
    })
    .catch(() => {
      configWarning.textContent = "Could not check the Foundry configuration: the backend is not responding.";
      configWarning.hidden = false;
    });
}
