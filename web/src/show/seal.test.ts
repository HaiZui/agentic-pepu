import { describe, expect, it } from "vitest";
import { shortSeal } from "./seal";

describe("shortSeal", () => {
  it("matches the backend short form", () => {
    expect(shortSeal("0123456789abcdef".repeat(4))).toBe("0123 4567 89ab");
  });
});
