import type { FateScript, Storyline } from "../stage/types";

const MAD_KING = "the Mad King";

/** Participant names in roster order (character ids p01.. follow the canonical roster). */
export function rosterNames(fate: FateScript): string[] {
  return fate.characters
    .filter((c) => c.kind === "participant")
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => c.name);
}

/** Name to pass as --old-king, or null when the Mad King held the throne (nobody was entered). */
export function oldKingArgument(fate: FateScript): string | null {
  const king = fate.characters.find((c) => c.id === fate.old_king);
  if (!king || (king.kind === "old_king" && king.name === MAD_KING)) return null;
  return king.name;
}

/** Every OUT / RETURNS announcement and crowd summary of the show, as "headline | cause". */
export function expectedStamps(storyline: Storyline): string[] {
  return storyline.beats.flatMap((b) => b.announcements.map((a) => `${a.headline} | ${a.cause}`));
}

/** The stamps a rendered comic actually shows (stamp captions and montage tile causes). */
export function renderedStamps(root: ParentNode): string[] {
  return [...root.querySelectorAll<HTMLElement>("[data-stamp]")].map((n) => n.dataset.stamp ?? "");
}

const quote = (value: string) => `"${value.replace(/"/g, '\\"')}"`;

/** The command printed on the back cover; anyone can rerun it to recompute the seal and the winner. */
export function verifyCommand(fate: FateScript, seed: string): string {
  const oldKing = oldKingArgument(fate);
  return [
    "python -m bottle_throne verify",
    `--seed ${quote(seed)}`,
    "--roster roster.txt",
    oldKing ? `--old-king ${quote(oldKing)}` : null,
    `--engine ${fate.engine_version}`,
  ]
    .filter(Boolean)
    .join(" ");
}
