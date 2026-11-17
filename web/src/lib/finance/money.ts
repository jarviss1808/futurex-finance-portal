import Decimal from "decimal.js";
import { z } from "zod";

export const moneyInput = z.union([z.string(), z.number(), z.instanceof(Decimal)]);

export function toPaise(value: z.infer<typeof moneyInput>): bigint {
  const amount = new Decimal(value instanceof Decimal ? value : String(value));
  if (!amount.isFinite() || amount.isNegative() || amount.decimalPlaces() > 2) {
    throw new Error("Money must be a non-negative value with at most two decimals");
  }
  return BigInt(amount.mul(100).toFixed(0));
}

export function minorUnitsToDecimal(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

function groupDigits(value: string, indian: boolean) {
  if (!indian || value.length <= 3) return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const tail = value.slice(-3);
  const head = value.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${head},${tail}`;
}

export function formatCurrencyMinor(value: bigint, currency = "INR"): string {
  const decimal = minorUnitsToDecimal(value);
  const negative = decimal.startsWith("-");
  const [integer, fraction] = (negative ? decimal.slice(1) : decimal).split(".");
  const code = currency.toUpperCase();
  const prefix = code === "INR" ? "₹" : code === "USD" ? "US$" : `${code} `;
  return `${negative ? "-" : ""}${prefix}${groupDigits(integer, code === "INR")}.${fraction}`;
}

export type InvoiceLine = {
  quantity: string | number;
  unitPricePaise: bigint;
};

export type InvoiceTotals = {
  basePaise: bigint;
  discountPaise: bigint;
  otherChargesPaise: bigint;
  taxablePaise: bigint;
  taxPaise: bigint;
  totalPaise: bigint;
};

export function calculateInvoice(input: {
  lines: InvoiceLine[];
  discountPaise?: bigint;
  otherChargesPaise?: bigint;
  taxRatePercent: string | number;
  taxable: boolean;
}): InvoiceTotals {
  if (!input.lines.length) throw new Error("At least one line item is required");
  const base = input.lines.reduce((sum, line) => {
    const quantity = new Decimal(String(line.quantity));
    if (!quantity.isFinite() || quantity.lte(0)) throw new Error("Quantity must be greater than zero");
    const linePaise = quantity.mul(line.unitPricePaise.toString());
    if (!linePaise.isInteger()) throw new Error("Line amount requires sub-paise rounding");
    return sum + BigInt(linePaise.toFixed(0));
  }, 0n);
  const discount = input.discountPaise ?? 0n;
  const otherCharges = input.otherChargesPaise ?? 0n;
  if (discount < 0n || otherCharges < 0n || discount > base + otherCharges) {
    throw new Error("Invalid discount or charges");
  }
  const taxablePaise = base + otherCharges - discount;
  const rate = new Decimal(String(input.taxRatePercent));
  if (!rate.isFinite() || rate.isNegative() || rate.greaterThan(100)) throw new Error("Invalid tax rate");
  const taxPaise = input.taxable
    ? BigInt(new Decimal(taxablePaise.toString()).mul(rate).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0))
    : 0n;
  return { basePaise: base, discountPaise: discount, otherChargesPaise: otherCharges, taxablePaise, taxPaise, totalPaise: taxablePaise + taxPaise };
}

export function calculateNetReceivable(grossPaise: bigint, tdsPaise: bigint): bigint {
  if (grossPaise < 0n) throw new Error("Gross value cannot be negative");
  if (tdsPaise < 0n) throw new Error("TDS cannot be negative");
  if (tdsPaise > grossPaise) throw new Error("TDS cannot exceed the gross PI value");
  return grossPaise - tdsPaise;
}
