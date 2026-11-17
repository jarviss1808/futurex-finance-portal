import { describe, expect, it } from "vitest";
import { issuanceBlockers } from "./issuance";

describe("statutory issuance gates", () => {
  it("blocks unconfigured numbering, tax, and unresolved e-invoicing", () => {
    expect(issuanceBlockers({ documentType: "TAX_INVOICE", seriesConfigured: false, taxConfigApproved: false, snapshotComplete: true, einvoiceStatus: "UNRESOLVED" })).toEqual([
      "NUMBER_SERIES_UNCONFIGURED", "TAX_CONFIGURATION_UNAPPROVED", "EINVOICE_APPLICABILITY_UNRESOLVED",
    ]);
  });
  it("never accepts a fabricated partial e-invoice response", () => {
    expect(issuanceBlockers({ documentType: "TAX_INVOICE", seriesConfigured: true, taxConfigApproved: true, snapshotComplete: true, einvoiceStatus: "VERIFIED", irn: "real-import", acknowledgementNumber: null, signedQrPayload: null })).toContain("EINVOICE_EVIDENCE_INCOMPLETE");
  });
  it("blocks official receipts for unverified payments", () => {
    expect(issuanceBlockers({ documentType: "RECEIPT", seriesConfigured: true, taxConfigApproved: true, snapshotComplete: true, paymentVerified: false })).toContain("PAYMENT_NOT_VERIFIED");
  });
});
