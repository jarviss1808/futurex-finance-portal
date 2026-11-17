import { describe, expect, it } from "vitest";
import { effectiveSnapshot } from "./effective";

describe("effective document snapshot", () => {
  it("keeps the original immutable and selects the one corrected snapshot", () => {
    const original = { totalPaise: "100" };
    const corrected = { totalPaise: "90" };
    expect(effectiveSnapshot({ snapshot: original, correctedSnapshot: corrected, correctionVersion: 1 })).toBe(corrected);
    expect(effectiveSnapshot({ snapshot: original, correctedSnapshot: corrected, correctionVersion: 0 })).toBe(original);
  });
});
