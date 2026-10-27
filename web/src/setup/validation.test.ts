import { describe, expect, it } from "vitest";
import fixture from "../../../tests/fixtures/roster_cases.json";
import { splitLines, validateRoster } from "./validation";

interface RosterCase {
  name: string;
  participants: string[];
  old_king?: string;
  valid: boolean;
  error?: string;
  flagged?: string[];
  roster?: string[];
}

const cases = (fixture as { cases: RosterCase[] }).cases;

describe("roster validation (shared fixture)", () => {
  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, testCase) => {
    const result = validateRoster(testCase.participants, testCase.old_king ?? null);

    expect(result.valid).toBe(testCase.valid);
    if (testCase.valid) {
      if (testCase.roster) expect(result.names).toEqual(testCase.roster);
    } else {
      expect(new Set(result.issues.map((i) => i.rule))).toEqual(new Set([testCase.error]));
      const flagged = result.entries.filter((e) => e.issues.length > 0).map((e) => e.name);
      expect(flagged).toEqual(testCase.flagged);
    }
  });
});

describe("roster validation details", () => {
  it("parses pasted text with blank lines and CRLF", () => {
    const result = validateRoster(splitLines("Matti\r\n\r\n  Aino  \nKalle\n"));
    expect(result.names).toEqual(["Matti", "Aino", "Kalle"]);
  });

  it("flags the overlong old king", () => {
    const result = validateRoster(["A", "B", "C"], "x".repeat(25));
    expect(result.oldKingIssues).toEqual(["old_king_too_long"]);
    expect(result.valid).toBe(false);
  });

  it("reports several problems at once", () => {
    const result = validateRoster(["Matti", "matti"]);
    expect(result.issues.map((i) => i.rule).sort()).toEqual(["duplicate_name", "roster_too_small"]);
  });
});
