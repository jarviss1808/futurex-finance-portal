import Decimal from "decimal.js";

export type TaxComponent = { label: string; rateBasisPoints: number };

export type DocumentTaxTreatment = {
  taxable: boolean;
  ratePercent: string;
  label: string;
  components: TaxComponent[];
};

const gstinState = (gstin: string | null | undefined) => {
  const value = gstin?.trim().toUpperCase() ?? "";
  return /^[0-9]{2}[0-9A-Z]{13}$/.test(value) ? value.slice(0, 2) : null;
};

export function basisPointsToPercent(rateBasisPoints: number) {
  const whole = Math.trunc(rateBasisPoints / 100);
  const fraction = Math.abs(rateBasisPoints % 100).toString().padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function deriveDocumentTaxTreatment(input: {
  eventCountryCode: string;
  taxType: string;
  rateBasisPoints: number;
  companyGstin?: string | null;
  clientGstin?: string | null;
}): DocumentTaxTreatment {
  const nonTaxable = input.eventCountryCode.toUpperCase() !== "IN" || ["NO_GST", "NIL", "EXEMPT"].includes(input.taxType);
  if (nonTaxable) return { taxable: false, ratePercent: "0", label: "GST Not Applicable", components: [] };

  const fullRate = input.rateBasisPoints;
  if (fullRate <= 0) throw new Error("A positive approved GST rate is required");
  const fullPercent = basisPointsToPercent(fullRate);
  if (input.taxType === "IGST") return { taxable: true, ratePercent: fullPercent, label: `IGST ${fullPercent}%`, components: [{ label: "IGST", rateBasisPoints: fullRate }] };

  const companyState = gstinState(input.companyGstin);
  const clientState = gstinState(input.clientGstin);
  if (!companyState) throw new Error("Company GSTIN is required to determine GST split");
  if (!clientState) throw new Error("A valid client GSTIN is required to determine CGST/SGST or IGST");

  if (input.taxType === "CGST_SGST" || companyState === clientState) {
    if (fullRate % 2 !== 0) throw new Error("CGST/SGST rate must split evenly");
    const half = fullRate / 2;
    const halfPercent = basisPointsToPercent(half);
    return { taxable: true, ratePercent: fullPercent, label: `CGST ${halfPercent}% + SGST ${halfPercent}%`, components: [{ label: "CGST", rateBasisPoints: half }, { label: "SGST", rateBasisPoints: half }] };
  }
  return { taxable: true, ratePercent: fullPercent, label: `IGST ${fullPercent}%`, components: [{ label: "IGST", rateBasisPoints: fullRate }] };
}

export function calculateTaxBreakdown(taxablePaise: bigint, treatment: DocumentTaxTreatment) {
  return treatment.components.map((component) => ({
    label: `${component.label} ${basisPointsToPercent(component.rateBasisPoints)}%`,
    ratePercent: basisPointsToPercent(component.rateBasisPoints),
    amountPaise: BigInt(new Decimal(taxablePaise.toString()).mul(component.rateBasisPoints).div(10_000).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0)),
  }));
}
