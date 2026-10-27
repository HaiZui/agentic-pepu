import { createProgram, NARRATOR } from "../stage/compiler";
import type { FateScript, PanelShot, Placement, SceneScript } from "../stage/types";

export interface PanelText {
  kind: "balloon" | "caption";
  text: string;
  /** Speaker id for balloons, null for captions and narration. */
  speaker: string | null;
}

export interface ComicPanel {
  shot: PanelShot;
  texts: PanelText[];
  sounds: string[];
}

/**
 * Every panel of every scene, with the stage blocking at its moment. Each line and caption of the
 * scene lands in exactly one panel (the last panel at or before it), so the comic carries the full dialogue.
 */
export function comicPanels(fate: FateScript, scenes: readonly SceneScript[]): Map<number, ComicPanel[]> {
  const program = createProgram(fate, scenes);
  const result = new Map<number, ComicPanel[]>();
  for (const segment of program.segments) {
    if (segment.beat === null || !segment.steps) continue;
    const scene = scenes.find((s) => s.beat_index === segment.beat);
    if (!scene) continue;
    const lineCast = new Map<number, Placement[]>();
    const captionCast = new Map<number, Placement[]>();
    for (const step of segment.steps) {
      if (step.kind === "line") lineCast.set(step.line, step.stateAfter.onStage);
      if (step.kind === "caption") captionCast.set(step.index, step.stateAfter.onStage);
    }
    const firstCast = lineCast.get(0) ?? [];

    const position = (p: SceneScript["panels"][number]) =>
      p.ref_kind === "line" ? p.ref_index : (scene.captions[p.ref_index]?.before_line ?? 0) - 0.5;
    const order = scene.panels.map((p, i) => ({ i, at: position(p) }));
    const owner = (at: number) => {
      const candidates = order.filter((o) => o.at <= at);
      const pick = candidates.length > 0 ? candidates.reduce((a, b) => (b.at >= a.at ? b : a)) : order.reduce((a, b) => (b.at < a.at ? b : a));
      return pick.i;
    };

    const panels: ComicPanel[] = scene.panels.map((p) => {
      const isLine = p.ref_kind === "line";
      let placements = (isLine ? lineCast.get(p.ref_index) : captionCast.get(p.ref_index)) ?? firstCast;
      if (placements.length === 0) placements = firstCast;
      return {
        shot: {
          framing: p.framing,
          focus: p.focus.filter((id) => placements.some((x) => x.id === id)),
          setting: scene.setting,
          placements: placements.map((x) => ({ ...x })),
          text: null,
          speaker: null,
          sound: null,
        },
        texts: [],
        sounds: [],
      };
    });
    if (panels.length === 0) continue;

    const items: { at: number; text: PanelText; sound?: string[] }[] = [
      ...scene.captions.map((c) => ({ at: c.before_line - 0.5, text: { kind: "caption" as const, text: c.text, speaker: null } })),
      ...scene.lines.map((line, i) => ({
        at: i,
        text: {
          kind: line.speaker === NARRATOR ? ("caption" as const) : ("balloon" as const),
          text: line.text,
          speaker: line.speaker === NARRATOR ? null : line.speaker,
        },
        sound: scene.onomatopoeia.filter((o) => o.line === i).map((o) => o.text),
      })),
    ].sort((a, b) => a.at - b.at);
    for (const item of items) {
      const panel = panels[owner(item.at)];
      panel.texts.push(item.text);
      panel.sounds.push(...(item.sound ?? []));
    }
    result.set(segment.beat, panels);
  }
  return result;
}
