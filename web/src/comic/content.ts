import { createProgram, NARRATOR } from "../stage/compiler";
import type { Announcement, FateScript, PanelShot, Placement, SceneScript, Storyline } from "../stage/types";

export interface PanelText {
  kind: "balloon" | "caption";
  text: string;
  /** Speaker id for balloons, null for captions and narration. */
  speaker: string | null;
  /** The speaker is out of the contest and speaks as a ghost. */
  ghost?: boolean;
}

export interface ComicPanel {
  shot: PanelShot;
  texts: PanelText[];
  sounds: string[];
  /** OUT / RETURNS stamps that land in this panel, worded exactly as on stage. */
  stamps: Announcement[];
}

/**
 * Every panel of every scene, with the stage blocking at its moment. Each line and caption of the
 * scene lands in exactly one panel (the last panel at or before it), so the comic carries the full dialogue.
 */
export function comicPanels(fate: FateScript, scenes: readonly SceneScript[], storyline: Storyline | null = null): Map<number, ComicPanel[]> {
  const program = createProgram(fate, scenes, storyline);
  const result = new Map<number, ComicPanel[]>();
  for (const segment of program.segments) {
    if (segment.beat === null || !segment.steps) continue;
    const scene = scenes.find((s) => s.beat_index === segment.beat);
    if (!scene) continue;
    const lineCast = new Map<number, Placement[]>();
    const captionCast = new Map<number, Placement[]>();
    const ghostLines = new Set<number>();
    // Each stamp belongs to the last line before it: the panel showing the elimination or the return.
    const stamps: { at: number; announcement: Announcement }[] = [];
    let lastLine = -1;
    for (const step of segment.steps) {
      if (step.kind === "line") {
        lineCast.set(step.line, step.stateAfter.onStage);
        if (step.ghost) ghostLines.add(step.line);
        lastLine = step.line;
      }
      if (step.kind === "caption") captionCast.set(step.index, step.stateAfter.onStage);
      if (step.kind === "stamp") stamps.push({ at: Math.max(lastLine, 0), announcement: step.announcement });
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
        stamps: [],
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
          ghost: ghostLines.has(i),
        },
        sound: scene.onomatopoeia.filter((o) => o.line === i).map((o) => o.text),
      })),
    ].sort((a, b) => a.at - b.at);
    for (const item of items) {
      const panel = panels[owner(item.at)];
      panel.texts.push(item.text);
      panel.sounds.push(...(item.sound ?? []));
    }
    for (const stamp of stamps) panels[owner(stamp.at)].stamps.push(stamp.announcement);
    result.set(segment.beat, panels);
  }
  return result;
}
