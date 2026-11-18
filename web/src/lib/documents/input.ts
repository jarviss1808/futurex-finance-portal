import { z } from "zod";
import Decimal from "decimal.js";
import { calculateInvoice, calculateNetReceivable, toPaise } from "@/lib/finance/money";

export const documentDraftInput = z.object({
  type: z.enum(["PROFORMA", "TAX_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"]).default("PROFORMA"),
  piCategory: z.enum(["EXHIBITION_PARTICIPATION", "BRANDING_FLEX_FRAME", "EXTRA_REQUIREMENTS", "STALL_FABRICATION"]).default("EXHIBITION_PARTICIPATION"),
  purpose: z.enum(["SPACE", "ADDITIONAL_ITEMS"]).default("ADDITIONAL_ITEMS"),
  sourceDocumentId: z.string().cuid().optional(),
  clientId: z.string().cuid(),
  eventSource: z.enum(["LISTED", "CUSTOM"]).default("LISTED"),
  eventId: z.string().cuid().optional(),
  customEvent: z.object({
    name: z.string().trim().min(1).max(200),
    edition: z.string().trim().max(100).optional().default(""),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid start date"),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid end date"),
    venue: z.string().trim().min(1).max(300),
    city: z.string().trim().min(1).max(120),
    stateRegion: z.string().trim().max(120).optional().default(""),
    countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use a two-letter country code"),
  }).optional(),
  stallNumber: z.string().trim().max(100).optional().default(""),
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
  const customAllowed = value.type === "PROFORMA" && ["BRANDING_FLEX_FRAME", "STALL_FABRICATION"].includes(value.piCategory);
  if (value.eventSource === "CUSTOM" && !customAllowed) context.addIssue({ code: "custom", path: ["eventSource"], message: "Custom exhibitions are available only for Branding and Stall Fabrication PIs" });
  if (value.eventSource === "CUSTOM" && !value.customEvent) context.addIssue({ code: "custom", path: ["customEvent"], message: "Enter the custom exhibition details" });
  if (value.eventSource === "LISTED" && !value.eventId) context.addIssue({ code: "custom", path: ["eventId"], message: "Select an exhibition" });
  if (value.customEvent && value.customEvent.endsOn < value.customEvent.startsOn) context.addIssue({ code: "custom", path: ["customEvent", "endsOn"], message: "End date cannot be before start date" });
});

export function buildDraftSnapshot(raw: unknown) {
  const input = documentDraftInput.parse(raw);
  const normalizedLines = input.lines.map((line) => ({ ...line, quantity: String(line.quantity), unitPricePaise: toPaise(line.unitPrice) }));
  const totals = calculateInvoice({ lines: normalizedLines, discountPaise: toPaise(input.discount), otherChargesPaise: toPaise(input.otherCharges), taxRatePercent: input.taxRatePercent, taxable: input.taxable });
  const tdsPaise = toPaise(input.tdsAmount);
  if (input.type !== "PROFORMA" && tdsPaise !== 0n) throw new Error("Manual TDS is available only for Proforma Invoices");
  const netReceivablePaise = calculateNetReceivable(totals.totalPaise, tdsPaise);
  const lines = normalizedLines.map((line) => ({ description: line.description, classification: line.classification, unit: line.unit.toUpperCase(), quantity: line.quantity, unitPricePaise: line.unitPricePaise.toString(), amountPaise: new Decimal(line.unitPricePaise.toString()).mul(line.quantity).toFixed(0) }));
  return { input, totals: { ...totals, tdsPaise, netReceivablePaise }, snapshot: { schemaVersion: 5, type: input.type, piCategory: input.piCategory, purpose: input.purpose, lines, stallNumber: input.stallNumber, taxable: input.taxable, taxRatePercent: String(input.taxRatePercent), taxLabel: input.taxLabel, discountPaise: totals.discountPaise.toString(), otherChargesPaise: totals.otherChargesPaise.toString(), taxablePaise: totals.taxablePaise.toString(), taxPaise: totals.taxPaise.toString(), totalPaise: totals.totalPaise.toString(), tdsPaise: tdsPaise.toString(), netReceivablePaise: netReceivablePaise.toString(), notes: input.notes ?? "" } };
}
