import { describe, expect, it } from "vitest";
import { UPCOMING_EXHIBITIONS } from "./upcoming";

describe("Futurex upcoming exhibition poster data", () => {
  it("contains unique exhibitions and preserves visible edition data", () => {
    expect(UPCOMING_EXHIBITIONS).toHaveLength(16);
    expect(new Set(UPCOMING_EXHIBITIONS.map((event) => event.canonicalKey)).size).toBe(16);
    for (const event of UPCOMING_EXHIBITIONS) {
      expect(new Date(event.endsOn).getTime()).toBeGreaterThanOrEqual(new Date(event.startsOn).getTime());
      expect(event.countryCode).toMatch(/^[A-Z]{2}$/);
    }
    expect(UPCOMING_EXHIBITIONS.find((event) => event.canonicalKey === "nepal-wood-2027")?.edition).toBe("12th Edition");
    expect(UPCOMING_EXHIBITIONS.find((event) => event.canonicalKey === "tanzania-buildcon-2027")?.edition).toBeNull();
  });
});
