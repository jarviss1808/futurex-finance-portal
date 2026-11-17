import { z } from "zod";

export const taxTypes = ["GST", "IGST", "CGST_SGST", "NO_GST", "NIL", "EXEMPT"] as const;

export const taxRuleInput = z.object({
  name: z.string().trim().min(2).max(150),
  taxType: z.enum(taxTypes),
  ratePercent: z.coerce.number().min(0).max(100),
  placeOfSupplyRule: z.string().trim().min(2).max(500),
  exemptionNote: z.string().trim().max(1000).optional(),
  approved: z.boolean(),
}).superRefine((value, context) => {
  const nonTaxable = ["NO_GST", "NIL", "EXEMPT"].includes(value.taxType);
  if (nonTaxable && value.ratePercent !== 0) {
    context.addIssue({ code: "custom", path: ["ratePercent"], message: "Non-taxable treatments must use a zero rate" });
  }
  if (nonTaxable && !value.exemptionNote) {
    context.addIssue({ code: "custom", path: ["exemptionNote"], message: "Non-taxable treatments require an evidence or management note" });
  }
  if (!nonTaxable && value.ratePercent <= 0) {
    context.addIssue({ code: "custom", path: ["ratePercent"], message: "Taxable treatments require a positive rate" });
  }
});

export function isTaxableType(taxType: string) {
  return !["NO_GST", "NIL", "EXEMPT"].includes(taxType);
}
