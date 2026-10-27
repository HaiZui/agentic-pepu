import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../stage/fixtures";
import { rosterNames, verifyCommand } from "./verify";

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
