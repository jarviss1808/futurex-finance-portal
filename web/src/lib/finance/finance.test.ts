import { describe, expect, it } from "vitest";
import { calculateInvoice, calculateNetReceivable, formatCurrencyMinor, minorUnitsToDecimal, toPaise } from "./money";
import { assertAllocationAllowed, confirmedOutstanding } from "./ledger";

describe("financial calculations", () => {
  it("formats arbitrarily large minor-unit values without floating-point conversion", () => {
    expect(minorUnitsToDecimal(900719925474099312n)).toBe("9007199254740993.12");
    expect(formatCurrencyMinor(900719925474099312n, "INR")).toBe("₹9,00,71,99,25,47,40,993.12");
    expect(formatCurrencyMinor(-123456n, "USD")).toBe("-US$1,234.56");
  });
  it("matches the 30 SQM domestic GST contract example", () => {
    expect(calculateInvoice({ lines: [{ quantity: 30, unitPricePaise: toPaise(8000) }], taxRatePercent: 18, taxable: true }).totalPaise).toBe(toPaise(283200));
  });
  it("matches the fabrication GST source example", () => {
    expect(calculateInvoice({ lines: [{ quantity: 1, unitPricePaise: toPaise(590000) }], taxRatePercent: 18, taxable: true }).totalPaise).toBe(toPaise(696200));
  });
  it("requires explicit non-taxable configuration for the international example", () => {
    expect(calculateInvoice({ lines: [{ quantity: 1, unitPricePaise: toPaise(107500) }], taxRatePercent: 18, taxable: false }).totalPaise).toBe(toPaise(107500));
  });
  it("rounds tax to the nearest paise and rejects excess precision", () => {
    expect(calculateInvoice({ lines: [{ quantity: 1, unitPricePaise: 101n }], taxRatePercent: "18", taxable: true }).taxPaise).toBe(18n);
    expect(() => toPaise("1.001")).toThrow(/two decimals/);
  });
  it("deducts only the manually entered TDS amount", () => {
    expect(calculateNetReceivable(118_000n, 10_000n)).toBe(108_000n);
    expect(calculateNetReceivable(118_000n, 0n)).toBe(118_000n);
    expect(() => calculateNetReceivable(100n, 101n)).toThrow(/exceed/);
  });
});

describe("ledger and payment allocation", () => {
  it("matches the JAMNA outstanding regression", () => {
    const invoices = [{ id: "114", totalPaise: toPaise(354000) }, { id: "115", totalPaise: toPaise(8260) }];
    const allocations = [{ invoiceId: "114", amountPaise: toPaise(150000), paymentVerified: true }];
    expect(confirmedOutstanding(invoices, allocations)).toBe(toPaise(212260));
  });
  it("ignores pending and reversed payments", () => {
    expect(confirmedOutstanding([{ id: "pi", totalPaise: 10000n }], [
      { invoiceId: "pi", amountPaise: 4000n, paymentVerified: false },
      { invoiceId: "pi", amountPaise: 3000n, paymentVerified: true, paymentReversed: true },
    ])).toBe(10000n);
  });
  it("blocks unverified and over allocations", () => {
    expect(() => assertAllocationAllowed({ paymentStatus: "PENDING", paymentAmountPaise: 100n, alreadyAllocatedPaise: 0n, requestedPaise: 50n, invoiceOutstandingPaise: 50n })).toThrow(/verified/);
    expect(() => assertAllocationAllowed({ paymentStatus: "VERIFIED", paymentAmountPaise: 100n, alreadyAllocatedPaise: 80n, requestedPaise: 30n, invoiceOutstandingPaise: 50n })).toThrow(/Payment is over-allocated/);
  });
});
