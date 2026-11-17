import { describe, expect, it } from "vitest";
import { buildDraftSnapshot } from "./input";

const base = { type: "PROFORMA", purpose: "SPACE", clientId: "cm1234567890123456789012", eventId: "cm2234567890123456789012", taxRuleId: "cm3234567890123456789012", taxable: true, taxRatePercent: "18", taxLabel: "IGST 18%", discount: "0", otherCharges: "0", lines: [{ description: "Exhibition space", classification: "998596", unit: "SQM", quantity: "30", unitPrice: "8000" }] };
describe("server-side document draft calculation", () => {
  it("ignores client-computed totals and produces the contract value", () => { const result = buildDraftSnapshot({ ...base, totalPaise: "1" }); expect(result.totals.totalPaise).toBe(28320000n); expect(result.snapshot.lines[0].amountPaise).toBe("24000000"); });
  it("supports decimal quantities without floating point arithmetic", () => { const result = buildDraftSnapshot({ ...base, lines: [{ ...base.lines[0], quantity: "9.5", unitPrice: "9000" }] }); expect(result.totals.basePaise).toBe(8550000n); });
  it("preserves an exact 9 SQM quantity", () => { const result = buildDraftSnapshot({ ...base, lines: [{ ...base.lines[0], quantity: "9", unitPrice: "9000" }] }); expect(result.snapshot.lines[0].quantity).toBe("9"); expect(result.totals.basePaise).toBe(8100000n); });
  it("rejects zero quantity", () => { expect(() => buildDraftSnapshot({ ...base, lines: [{ ...base.lines[0], quantity: "0" }] })).toThrow(/greater than zero/); });
  it("rejects sub-paise line values", () => { expect(() => buildDraftSnapshot({ ...base, lines: [{ ...base.lines[0], quantity: "0.333", unitPrice: "1" }] })).toThrow(/sub-paise/); });
  it("supports item quantities and preserves the unit", () => { const result = buildDraftSnapshot({ ...base, purpose: "ADDITIONAL_ITEMS", lines: [{ description: "LED television", classification: "998596", unit: "NOS", quantity: "3", unitPrice: "5000" }] }); expect(result.totals.basePaise).toBe(1500000n); expect(result.snapshot.lines[0].unit).toBe("NOS"); });
  it("rejects a space PI that is not measured in SQM", () => { expect(() => buildDraftSnapshot({ ...base, lines: [{ ...base.lines[0], unit: "NOS" }] })).toThrow(/SQM/); });
  it("stores manual TDS separately and derives net receivable without treating it as payment", () => { const result = buildDraftSnapshot({ ...base, tdsAmount: "3200.50" }); expect(result.totals.tdsPaise).toBe(320050n); expect(result.totals.netReceivablePaise).toBe(27999950n); expect(result.snapshot).toMatchObject({ tdsPaise: "320050", netReceivablePaise: "27999950" }); });
  it("defaults manual TDS to zero and rejects TDS above the gross value", () => { expect(buildDraftSnapshot(base).totals.tdsPaise).toBe(0n); expect(() => buildDraftSnapshot({ ...base, tdsAmount: "283200.01" })).toThrow(/exceed the gross PI value/); });
  it("does not apply the PI-only TDS deduction to statutory documents", () => { expect(() => buildDraftSnapshot({ ...base, type: "TAX_INVOICE", tdsAmount: "1" })).toThrow(/only for Proforma Invoices/); });
});
