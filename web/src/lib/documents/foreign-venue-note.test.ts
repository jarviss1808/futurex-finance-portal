import { describe, expect, it } from "vitest";
import { documentNotes, OUTSIDE_INDIA_PI_NOTE } from "./foreign-venue-note";

describe("foreign venue PI note", () => {
  it("adds the approved note only to non-taxable foreign venue documents", () => {
    expect(documentNotes({ eventCountryCode: "NP", taxable: false })).toBe(OUTSIDE_INDIA_PI_NOTE);
    expect(documentNotes({ eventCountryCode: "IN", taxable: true })).toBe("");
    expect(documentNotes({ eventCountryCode: "IN", taxable: false })).toBe("");
    expect(documentNotes({ eventCountryCode: "NP", taxable: true })).toBe("");
  });

  it("preserves an entered note and appends the approved wording once", () => {
    expect(documentNotes({ eventCountryCode: "BD", taxable: false, userNotes: "Payment due in 7 days." }))
      .toBe(`Payment due in 7 days.\n\n${OUTSIDE_INDIA_PI_NOTE}`);
    expect(documentNotes({ eventCountryCode: "BD", taxable: false, userNotes: OUTSIDE_INDIA_PI_NOTE })).toBe(OUTSIDE_INDIA_PI_NOTE);
  });
});
