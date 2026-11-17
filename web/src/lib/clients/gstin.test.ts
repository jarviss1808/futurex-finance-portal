import { describe, expect, it } from "vitest";
import { isValidGstin, normalizeGstin, OFFICIAL_GST_SEARCH_URL } from "./gstin";

describe("GSTIN local validation", () => {
  it("validates the verified Futurex GSTIN including checksum", () => {
    expect(isValidGstin("07AABCF8175F1ZK")).toBe(true);
    expect(normalizeGstin(" 07aabcf8175f1zk ")).toBe("07AABCF8175F1ZK");
  });
  it("rejects malformed and checksum-invalid values", () => {
    expect(isValidGstin("07AABCF8175F1ZA")).toBe(false);
    expect(isValidGstin("NOT-A-GSTIN")).toBe(false);
  });
  it("uses only the official taxpayer search URL", () => expect(OFFICIAL_GST_SEARCH_URL).toBe("https://services.gst.gov.in/services/searchtp"));
});
