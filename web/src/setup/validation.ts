export const MIN_PARTICIPANTS = 3;
export const MAX_PARTICIPANTS = 40;
export const MAX_NAME_LENGTH = 24;

export type RuleId =
  | "roster_too_small"
  | "roster_too_large"
  | "duplicate_name"
  | "name_too_long"
  | "old_king_too_long";

export interface RosterEntry {
  name: string;
  issues: RuleId[];
}

export interface Issue {
  rule: RuleId;
  message: string;
}

export interface RosterValidation {
  entries: RosterEntry[];
  names: string[];
  oldKing: string | null;
  oldKingIssues: RuleId[];
  issues: Issue[];
  valid: boolean;
}

// Mirrors bottle_throne.models.show: NFC + trim, duplicates ignore case.
export const cleanName = (raw: string): string => raw.normalize("NFC").trim();
export const nameKey = (name: string): string => cleanName(name).toLowerCase();
const codePointLength = (text: string): number => [...text].length;

export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

export function validateRoster(lines: string[], oldKingRaw: string | null = null): RosterValidation {
  const entries: RosterEntry[] = lines
    .map(cleanName)
    .filter((name) => name.length > 0)
    .map((name) => ({ name, issues: [] }));
  const issues: Issue[] = [];

  if (entries.length < MIN_PARTICIPANTS) {
    issues.push({
      rule: "roster_too_small",
      message: `At least ${MIN_PARTICIPANTS} participants are required (got ${entries.length}).`,
    });
  }
  if (entries.length > MAX_PARTICIPANTS) {
    issues.push({
      rule: "roster_too_large",
      message: `At most ${MAX_PARTICIPANTS} participants are allowed (got ${entries.length}).`,
    });
  }

  const tooLong = entries.filter((e) => codePointLength(e.name) > MAX_NAME_LENGTH);
  tooLong.forEach((e) => e.issues.push("name_too_long"));
  if (tooLong.length > 0) {
    issues.push({
      rule: "name_too_long",
      message: `Names may be at most ${MAX_NAME_LENGTH} characters: ${tooLong.map((e) => e.name).join(", ")}.`,
    });
  }

  const byKey = new Map<string, RosterEntry[]>();
  for (const entry of entries) {
    const key = nameKey(entry.name);
    byKey.set(key, [...(byKey.get(key) ?? []), entry]);
  }
  const duplicateGroups = [...byKey.values()].filter((group) => group.length > 1);
  duplicateGroups.flat().forEach((e) => e.issues.push("duplicate_name"));
  if (duplicateGroups.length > 0) {
    issues.push({
      rule: "duplicate_name",
      message: `Names must be unique (ignoring case): ${duplicateGroups.map((g) => g[0].name).join(", ")}.`,
    });
  }

  const oldKingClean = oldKingRaw === null ? "" : cleanName(oldKingRaw);
  const oldKing = oldKingClean.length > 0 ? oldKingClean : null;
  const oldKingIssues: RuleId[] = [];
  if (oldKing !== null && codePointLength(oldKing) > MAX_NAME_LENGTH) {
    oldKingIssues.push("old_king_too_long");
    issues.push({
      rule: "old_king_too_long",
      message: `The Old King's name may be at most ${MAX_NAME_LENGTH} characters.`,
    });
  }

  return {
    entries,
    names: entries.map((e) => e.name),
    oldKing,
    oldKingIssues,
    issues,
    valid: issues.length === 0,
  };
}
