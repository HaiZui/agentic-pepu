import { preloadAudio, sharedEngine, unlockAudio } from "../audio/context";
import { el } from "../dom";

/** Setup-screen sound check: lists missing audio files and plays a test sound on the room speakers. */
export function renderAudioCheck(): HTMLElement {
  const status = el("p", { class: "hint", "aria-live": "polite", "data-testid": "audio-status" }, "Checking sound files...");
  const missingList = el("ul", { class: "issues", "data-testid": "audio-missing" });
  const test = el("button", { type: "button", class: "secondary", "data-testid": "test-sound" }, "Test sound");
  const panel = el("details", { class: "advanced audio-check" }, el("summary", {}, "Sound check"), status, missingList, test);

  if (!sharedEngine()) {
    status.textContent = "This browser has no Web Audio support; the show will be silent.";
    test.disabled = true;
    return panel;
  }
  void preloadAudio().then((report) => {
    if (report.missing.length === 0) {
      status.textContent = `All ${report.loaded.length} sounds are ready.`;
      return;
    }
    status.textContent = `${report.missing.length} sound${report.missing.length === 1 ? " is" : "s are"} missing; the show plays on without them:`;
    missingList.replaceChildren(...report.missing.map((stem) => el("li", {}, stem.split("/").pop()!.replace(/_/g, " ") + ` (${stem})`)));
    panel.open = true;
  });
  test.addEventListener("click", () => {
    unlockAudio();
    void preloadAudio().then(() => sharedEngine()?.play("stingers/roll_call"));
  });
  return panel;
}
