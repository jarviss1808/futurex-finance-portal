import { describe, expect, it } from "vitest";
import { calculateTaxBreakdown, deriveDocumentTaxTreatment } from "./document-treatment";

const companyGstin = "07AABCF8175F1ZK";

describe("client-wise GST treatment", () => {
  it("splits Delhi-to-Delhi GST into CGST and SGST at 9% each", () => {
    const treatment = deriveDocumentTaxTreatment({ eventCountryCode: "IN", taxType: "GST", rateBasisPoints: 1800, companyGstin, clientGstin: "07AAAAA0000A1Z5" });
    expect(treatment.label).toBe("CGST 9% + SGST 9%");
    expect(calculateTaxBreakdown(3_000_000n, treatment)).toEqual([
      { label: "CGST 9%", ratePercent: "9", amountPaise: 270_000n },
      { label: "SGST 9%", ratePercent: "9", amountPaise: 270_000n },
    ]);
  });

  it("uses IGST 18% for a non-Delhi GSTIN", () => {
    const treatment = deriveDocumentTaxTreatment({ eventCountryCode: "IN", taxType: "GST", rateBasisPoints: 1800, companyGstin, clientGstin: "27AABCT1234F1ZK" });
    expect(treatment.label).toBe("IGST 18%");
    expect(calculateTaxBreakdown(8_100_000n, treatment)[0].amountPaise).toBe(1_458_000n);
  });

  it("prints GST Not Applicable for a foreign-venue exhibition", () => {
    expect(deriveDocumentTaxTreatment({ eventCountryCode: "BD", taxType: "NO_GST", rateBasisPoints: 0, companyGstin, clientGstin: "27AABCT1234F1ZK" })).toMatchObject({ taxable: false, label: "GST Not Applicable", components: [] });
  });

  it("blocks an Indian taxable draft when the client GSTIN cannot determine state", () => {
    expect(() => deriveDocumentTaxTreatment({ eventCountryCode: "IN", taxType: "GST", rateBasisPoints: 1800, companyGstin, clientGstin: null })).toThrow(/client GSTIN/);
  });
});
