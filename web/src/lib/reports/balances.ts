import { formatCurrencyMinor } from "@/lib/finance/money";

export type PaymentState = "PAID" | "PARTIAL" | "UNPAID" | "CANCELLED";
export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = { PAID: "Fully paid", PARTIAL: "Partially paid", UNPAID: "Unpaid", CANCELLED: "Cancelled" };

/**
 * Official PI position. Only Admin-approved payments reduce the outstanding balance; pending and
 * declined entries are reported separately and never change it.
 */
export function piBalance(totalPaise: bigint, documentStatus: string, allocations: Array<{ amountPaise: bigint; status: string }>) {
  let approved = 0n, pending = 0n, declined = 0n;
  for (const allocation of allocations) {
    if (allocation.status === "VERIFIED") approved += allocation.amountPaise;
    else if (allocation.status === "PENDING") pending += allocation.amountPaise;
    else if (allocation.status === "REJECTED") declined += allocation.amountPaise;
  }
  const cancelled = documentStatus === "VOIDED";
  const outstanding = cancelled ? 0n : totalPaise - approved;
  const state: PaymentState = cancelled ? "CANCELLED" : approved <= 0n ? "UNPAID" : approved >= totalPaise ? "PAID" : "PARTIAL";
  return { approved, pending, declined, outstanding, state };
}

export type CurrencyTotals = Map<string, bigint>;

export function addTotal(totals: CurrencyTotals, currency: string, amount: bigint) {
  totals.set(currency, (totals.get(currency) ?? 0n) + amount);
}

/** Formats per-currency totals without ever mixing INR and USD into one number. */
export function formatTotals(totals: CurrencyTotals, empty = "₹0.00") {
  const parts = [...totals].filter(([, value]) => value !== 0n).sort(([a], [b]) => (a === "INR" ? -1 : b === "INR" ? 1 : a.localeCompare(b))).map(([currency, value]) => formatCurrencyMinor(value, currency));
  return parts.join(" · ") || empty;
}

/** Collected share as a one-decimal percentage string using integer arithmetic. */
export function collectionPercent(approved: bigint, value: bigint) {
  if (value <= 0n) return "—";
  const tenths = (approved * 1000n) / value;
  return `${tenths / 10n}.${tenths % 10n}%`;
}
