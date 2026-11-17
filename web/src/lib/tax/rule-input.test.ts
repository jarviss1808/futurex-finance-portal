import { describe, expect, it } from "vitest";
import { isTaxableType, taxRuleInput } from "./rule-input";

describe("tax treatment validation", () => {
  it("accepts the management-approved 18% GST rule", () => {
    const result = taxRuleInput.parse({ name: "India venue GST 18%", taxType: "GST", ratePercent: 18, placeOfSupplyRule: "Venue is in India", exemptionNote: "", approved: true });
    expect(result.ratePercent).toBe(18);
    expect(isTaxableType(result.taxType)).toBe(true);
  });

  it("accepts a documented no-GST foreign venue rule", () => {
    const result = taxRuleInput.parse({ name: "Foreign venue - no GST", taxType: "NO_GST", ratePercent: 0, placeOfSupplyRule: "Venue is outside India", exemptionNote: "Management instruction pending accountant classification", approved: true });
    expect(isTaxableType(result.taxType)).toBe(false);
  });

  it("rejects a no-GST rule without a supporting note", () => {
    expect(() => taxRuleInput.parse({ name: "Foreign venue - no GST", taxType: "NO_GST", ratePercent: 0, placeOfSupplyRule: "Venue is outside India", approved: true })).toThrow();
  });
});
