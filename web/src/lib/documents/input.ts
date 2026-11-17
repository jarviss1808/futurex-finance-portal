import { z } from "zod";
import Decimal from "decimal.js";
import { calculateInvoice, calculateNetReceivable, toPaise } from "@/lib/finance/money";

export const documentDraftInput = z.object({
  type: z.enum(["PROFORMA", "TAX_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"]).default("PROFORMA"),
  piCategory: z.enum(["EXHIBITION_PARTICIPATION", "BRANDING_FLEX_FRAME", "EXTRA_REQUIREMENTS", "STALL_FABRICATION"]).default("EXHIBITION_PARTICIPATION"),
  purpose: z.enum(["SPACE", "ADDITIONAL_ITEMS"]).default("ADDITIONAL_ITEMS"),
  sourceDocumentId: z.string().cuid().optional(),
  clientId: z.string().cuid(),
  eventId: z.string().cuid(),
  taxRuleId: z.string().cuid(),
  taxable: z.boolean(),
  taxRatePercent: z.union([z.string(), z.number()]),
  taxLabel: z.string().trim().min(1).max(50),
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(z.object({
    description: z.string().trim().min(1).max(500),
    classification: z.string().trim().min(1).max(20),
    unit: z.string().trim().min(1).max(20).default("NOS"),
    quantity: z.union([z.string(), z.number()]),
    unitPrice: z.union([z.string(), z.number()]),
  })).min(1).max(50),
  discount: z.union([z.string(), z.number()]).default("0"),
  otherCharges: z.union([z.string(), z.number()]).default("0"),
  tdsAmount: z.union([z.string(), z.number()]).default("0"),
}).superRefine((value, context) => {
  if (value.purpose === "SPACE" && value.lines.length !== 1) context.addIssue({ code: "custom", path: ["lines"], message: "Space PI requires exactly one area line" });
  if (value.purpose === "SPACE" && value.lines.some((line) => line.unit.toUpperCase() !== "SQM")) context.addIssue({ code: "custom", path: ["lines"], message: "Space PI must use SQM" });
});

export function buildDraftSnapshot(raw: unknown) {
  const input = documentDraftInput.parse(raw);
  const normalizedLines = input.lines.map((line) => ({ ...line, quantity: String(line.quantity), unitPricePaise: toPaise(line.unitPrice) }));
  const totals = calculateInvoice({ lines: normalizedLines, discountPaise: toPaise(input.discount), otherChargesPaise: toPaise(input.otherCharges), taxRatePercent: input.taxRatePercent, taxable: input.taxable });
  const tdsPaise = toPaise(input.tdsAmount);
  if (input.type !== "PROFORMA" && tdsPaise !== 0n) throw new Error("Manual TDS is available only for Proforma Invoices");
  const netReceivablePaise = calculateNetReceivable(totals.totalPaise, tdsPaise);
  const lines = normalizedLines.map((line) => ({ description: line.description, classification: line.classification, unit: line.unit.toUpperCase(), quantity: line.quantity, unitPricePaise: line.unitPricePaise.toString(), amountPaise: new Decimal(line.unitPricePaise.toString()).mul(line.quantity).toFixed(0) }));
  return { input, totals: { ...totals, tdsPaise, netReceivablePaise }, snapshot: { schemaVersion: 4, type: input.type, piCategory: input.piCategory, purpose: input.purpose, lines, taxable: input.taxable, taxRatePercent: String(input.taxRatePercent), taxLabel: input.taxLabel, discountPaise: totals.discountPaise.toString(), otherChargesPaise: totals.otherChargesPaise.toString(), taxablePaise: totals.taxablePaise.toString(), taxPaise: totals.taxPaise.toString(), totalPaise: totals.totalPaise.toString(), tdsPaise: tdsPaise.toString(), netReceivablePaise: netReceivablePaise.toString(), notes: input.notes ?? "" } };
}
