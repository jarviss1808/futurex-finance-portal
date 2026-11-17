import { describe, expect, it } from "vitest";
import { companyCanonicalKey, defaultCurrencyForCountry, normalizeCompanyName } from "./identity";

describe("company identity", () => {
  it("normalizes punctuation without exposing relationship data", () => {
    expect(normalizeCompanyName(" Q-Green (India) Pvt. Ltd. ")).toBe("Q GREEN INDIA PVT LTD");
  });

  it("uses verified GSTIN as the strongest canonical key", () => {
    expect(companyCanonicalKey({ legalName: "Any spelling", countryCode: "in", gstin: "07aabcf8175f1zk" }))
      .toBe("GSTIN:07AABCF8175F1ZK");
  });

  it("derives currency only from client country", () => {
    expect(defaultCurrencyForCountry("IN")).toBe("INR");
    expect(defaultCurrencyForCountry("CN")).toBe("USD");
  });
});
