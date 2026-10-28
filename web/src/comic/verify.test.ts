import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../stage/fixtures";
import { comicPanels } from "./content";
import { expectedStamps, renderedStamps, rosterNames, verifyCommand } from "./verify";

const REPO = resolve(__dirname, "../../..");
const PYTHON = [join(REPO, ".venv", "Scripts", "python.exe"), join(REPO, ".venv", "bin", "python")].find(existsSync);

/** Split the printed command the way a shell would (double quotes with backslash escapes). */
function shellSplit(command: string): string[] {
  return [...command.matchAll(/"((?:[^"\\]|\\.)*)"|(\S+)/g)].map((m) => (m[1] !== undefined ? m[1].replace(/\\(.)/g, "$1") : m[2]));
}

describe.skipIf(!PYTHON)("back-cover verify command", () => {
  it.each(Object.keys(FIXTURES))("recomputes the seal and the winner of fixture %s", (key) => {
    const { fate, seed } = FIXTURES[Number(key) as keyof typeof FIXTURES];
    const dir = mkdtempSync(join(tmpdir(), "bt-verify-"));
    writeFileSync(join(dir, "roster.txt"), rosterNames(fate).join("\n") + "\n", "utf8");
    const [python, ...args] = shellSplit(verifyCommand(fate, seed));
    expect(python).toBe("python");
    const out = execFileSync(PYTHON!, args, { cwd: dir, encoding: "utf8", env: { ...process.env, PYTHONPATH: join(REPO, "src"), PYTHONIOENCODING: "utf-8" } });
    const winner = fate.characters.find((c) => c.id === fate.winner)!.name;
    expect(out).toContain(`Seal of Fate: ${fate.seal}`);
    expect(out).toContain(`Winner:       ${winner}`);
  });
});


describe("comic stamps match the stage", () => {
  it.each([6, 15, 40] as const)("puts every single-elimination and return stamp in a panel of its scene (%i)", (size) => {
    const { fate, scenes, storyline } = FIXTURES[size];
    const panels = comicPanels(fate, scenes, storyline);
    const inPanels = [...panels.entries()].flatMap(([beat, list]) => list.flatMap((p) => p.stamps.map((s) => ({ beat, text: `${s.headline} | ${s.cause}` }))));
    const expected = storyline.beats
      .filter((b) => !b.announcements.some((a) => a.kind === "summary"))
      .flatMap((b) => b.announcements.map((a) => ({ beat: b.index, text: `${a.headline} | ${a.cause}` })));
    expect(inPanels).toEqual(expected);
  });

  it("lands an elimination stamp in the panel that shows the leaving line or after it", () => {
    const { fate, scenes, storyline } = FIXTURES[6];
    const beat = fate.beats.find((b) => b.kind !== "crowd" && b.eliminations.length === 1)!;
    const list = comicPanels(fate, scenes, storyline).get(beat.index)!;
    const at = list.findIndex((p) => p.stamps.length > 0);
    expect(at).toBeGreaterThanOrEqual(0);
    const scene = scenes[beat.index];
    const leaving = scene.stage_directions.find((d) => d.character === beat.eliminations[0].character)!.line;
    const lineOwner = list.findIndex((p) => p.texts.some((t) => t.text === scene.lines[leaving].text));
    expect(at).toBe(lineOwner);
  });

  it("flags ghost balloons", () => {
    const { fate, scenes, storyline } = FIXTURES[6];
    const first = fate.beats.find((b) => b.eliminations.length === 1)!;
    const dead = first.eliminations[0].character;
    const later = fate.beats.find((b) => b.index > first.index && b.card !== "coronation")!;
    const haunted = scenes.map((s) =>
      s.beat_index === later.index ? { ...s, lines: [...s.lines, { speaker: dead, emotion: "dead" as const, action: null, text: "Boo." }] } : s,
    );
    const texts = comicPanels(fate, haunted, storyline).get(later.index)!.flatMap((p) => p.texts);
    expect(texts.find((t) => t.text === "Boo.")?.ghost).toBe(true);
    expect(texts.filter((t) => t.text !== "Boo.").every((t) => !t.ghost)).toBe(true);
  });

  it("lists expected stamps from the storyline and reads rendered ones back", () => {
    const { storyline } = FIXTURES[15];
    const expected = expectedStamps(storyline);
    expect(expected.some((s) => s.includes(" RETURNS | "))).toBe(true);
    expect(expected.some((s) => / are OUT \| in /.test(s))).toBe(true);
    const fake = { querySelectorAll: () => expected.map((text) => ({ dataset: { stamp: text } })) } as unknown as ParentNode;
    expect(renderedStamps(fake)).toEqual(expected);
  });
});
