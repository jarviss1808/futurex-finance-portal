import { describe, expect, it } from "vitest";
import { toOutputSnapshot } from "./output";

function snapshot(currency?: string) {
  return {
    type: "TAX_INVOICE",
    number: "INV-1",
    issuedAt: "2026-11-12T00:00:00.000Z",
    ...(currency ? { currency } : {}),
    taxLabel: "IGST",
    taxablePaise: "10000",
    taxPaise: "1800",
    totalPaise: "11800",
    organization: { name: "Futurex", legalName: "FUTUREX TRADE FAIR AND EVENTS PRIVATE LIMITED", gstin: "07AABCF8175F1ZK", registeredAddress: "Chennai", gstRegisteredAddress: "Delhi", signatureImageBase64: "approved-image-bytes" },
    client: { legalName: "Client", billingAddress: "Address", gstin: null },
    event: { name: "India EV International Show", edition: "9th Edition", startsOn: "2027-10-14", endsOn: "2027-10-16", venue: "Auto Cluster Exhibition Centre", city: "Pune", stateRegion: "Maharashtra", countryCode: "IN" },
    taxBreakdown: [{ label: "IGST 18%", ratePercent: "18", amountPaise: "1800" }],
    lines: [{ description: "Service", classification: "9983", quantity: "1", unitPricePaise: "10000", amountPaise: "10000" }],
  };
}

describe("toOutputSnapshot", () => {
  it("preserves an issued document's currency", () => {
    expect(toOutputSnapshot(snapshot("USD")).currency).toBe("USD");
    expect(toOutputSnapshot(snapshot("USD")).companyGstin).toBe("07AABCF8175F1ZK");
    expect(toOutputSnapshot(snapshot("USD")).lines[0].unit).toBe("NOS");
    expect(toOutputSnapshot(snapshot("USD")).event?.startsOn).toBe("2027-10-14");
    expect(toOutputSnapshot(snapshot("USD")).taxBreakdown?.[0].amountPaise).toBe(1800n);
    expect(toOutputSnapshot(snapshot("USD")).signatureImageBase64).toBe("approved-image-bytes");
  });

  it("defaults legacy snapshots to INR", () => {
    expect(toOutputSnapshot(snapshot()).currency).toBe("INR");
  });

  it("preserves immutable document notes", () => {
    expect(toOutputSnapshot({ ...snapshot(), notes: "Approved foreign-venue note" }).notes).toBe("Approved foreign-venue note");
  });

  it("preserves the optional stall number", () => {
    expect(toOutputSnapshot({ ...snapshot(), stallNumber: "A-12" }).stallNumber).toBe("A-12");
    expect(toOutputSnapshot(snapshot()).stallNumber).toBe("");
  });
});
