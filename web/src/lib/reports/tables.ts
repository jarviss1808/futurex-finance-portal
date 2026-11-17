import { paymentModeLabel, PAYMENT_STATUS_LABEL } from "@/lib/payments/modes";
import { collectionPercent, PAYMENT_STATE_LABEL, type CurrencyTotals } from "./balances";
import type { Group, PiRow } from "./sales";
import { PI_CATEGORIES } from "@/lib/documents/pi-category";
import { DIMENSION_LABEL, type Dimension } from "./dimension";

export type Cell = string | number | bigint | Date | null | undefined;
export type Column = { key: string; label: string; kind?: "text" | "money" | "count" | "date" | "percent"; width?: number };
export type ReportRow = Record<string, Cell>;
export type ReportTable = { title: string; subtitle: string; columns: Column[]; rows: ReportRow[]; footer: ReportRow[] };
export type PaymentRow = {
  paidOn: Date; submittedAt: Date; reviewedAt: Date | null; status: string; mode: string; reference: string | null; remarks: string | null; reviewNote: string | null;
  amountPaise: bigint; currency: string; submissionCount: number;
  reportedBy: { name: string }; verifiedBy: { name: string } | null;
  allocations: Array<{ tdsPaise: bigint; document: { number: string | null; owner: { name: string }; client: { legalName: string }; event: { name: string } | null } }>;
};

function currencies(...totals: CurrencyTotals[]) {
  const set = new Set<string>();
  for (const map of totals) for (const [currency, value] of map) if (value !== 0n) set.add(currency);
  return set.size ? [...set].sort((a, b) => (a === "INR" ? -1 : b === "INR" ? 1 : a.localeCompare(b))) : ["INR"];
}

function footerByCurrency(rows: ReportRow[], columns: Column[], labelKey: string) {
  const byCurrency = new Map<string, ReportRow>();
  for (const row of rows) {
    const currency = String(row.currency ?? "INR");
    const total = byCurrency.get(currency) ?? { [labelKey]: `Total (${currency})`, currency };
    for (const column of columns) {
      if (column.kind === "money" && typeof row[column.key] === "bigint") total[column.key] = ((total[column.key] as bigint | undefined) ?? 0n) + (row[column.key] as bigint);
      if (column.kind === "count" && typeof row[column.key] === "number") total[column.key] = ((total[column.key] as number | undefined) ?? 0) + (row[column.key] as number);
    }
    byCurrency.set(currency, total);
  }
  const footer = [...byCurrency.values()];
  const value = columns.find((column) => column.key === "value");
  const percent = columns.find((column) => column.kind === "percent");
  if (value && percent) for (const row of footer) row[percent.key] = collectionPercent((row.approved as bigint) ?? 0n, (row.value as bigint) ?? 0n);
  return footer;
}

export function piRegisterTable(rows: PiRow[], meta: { title: string; subtitle: string }): ReportTable {
  const columns: Column[] = [
    { key: "number", label: "PI number", width: 1.3 }, { key: "issuedAt", label: "PI date", kind: "date", width: 0.9 }, { key: "employee", label: "Employee", width: 1.1 },
    { key: "client", label: "Client", width: 2 }, { key: "event", label: "Exhibition", width: 2 }, { key: "venue", label: "Venue", width: 1.6 }, { key: "category", label: "PI category", width: 1.5 },
    { key: "area", label: "Area (SQM)", width: 0.8 }, { key: "rate", label: "Rate / SQM", kind: "money", width: 1.1 }, { key: "currency", label: "Cur.", width: 0.5 },
    { key: "taxable", label: "Taxable value", kind: "money", width: 1.2 }, { key: "cgst", label: "CGST", kind: "money", width: 1 }, { key: "sgst", label: "SGST", kind: "money", width: 1 }, { key: "igst", label: "IGST", kind: "money", width: 1 }, { key: "tax", label: "Total GST", kind: "money", width: 1.1 }, { key: "value", label: "Gross PI value", kind: "money", width: 1.2 }, { key: "tds", label: "Manual TDS", kind: "money", width: 1.1 }, { key: "confirmedTds", label: "Confirmed TDS", kind: "money", width: 1.1 }, { key: "netReceivable", label: "Net receivable", kind: "money", width: 1.2 }, { key: "approved", label: "Approved received", kind: "money", width: 1.2 },
    { key: "pending", label: "Awaiting approval", kind: "money", width: 1.2 }, { key: "outstanding", label: "Outstanding", kind: "money", width: 1.2 }, { key: "state", label: "Payment status", width: 1 },
  ];
  const body = rows.map((row) => ({ number: row.number, issuedAt: row.issuedAt, employee: row.owner.name, client: row.client.legalName, event: row.event?.name ?? "—", venue: row.event ? `${row.event.venue}, ${row.event.city}, ${row.event.countryCode}` : "—", category: PI_CATEGORIES.find((item) => item.value === row.category)?.label ?? row.category, area: row.area, rate: row.rate, currency: row.currency, taxable: row.status === "VOIDED" ? 0n : row.taxable, cgst: row.cgst, sgst: row.sgst, igst: row.igst, tax: row.tax, value: row.status === "VOIDED" ? 0n : row.total, tds: row.status === "VOIDED" ? 0n : row.tds, confirmedTds: row.status === "VOIDED" ? 0n : row.confirmedTds, netReceivable: row.status === "VOIDED" ? 0n : row.netReceivable, approved: row.approved, pending: row.pending, outstanding: row.outstanding, state: PAYMENT_STATE_LABEL[row.state] }));
  return { ...meta, columns, rows: body, footer: footerByCurrency(body, columns, "number") };
}

export function groupTable(groups: Group[], dimension: Dimension, meta: { title: string; subtitle: string }): ReportTable {
  const columns: Column[] = [
    { key: "label", label: DIMENSION_LABEL[dimension], width: 2.4 }, { key: "count", label: "PIs", kind: "count", width: 0.6 }, { key: "currency", label: "Cur.", width: 0.5 },
    { key: "value", label: "Gross PI value", kind: "money", width: 1.4 }, { key: "tds", label: "Manual TDS", kind: "money", width: 1.2 }, { key: "confirmedTds", label: "Confirmed TDS", kind: "money", width: 1.2 }, { key: "netReceivable", label: "Net receivable", kind: "money", width: 1.4 }, { key: "approved", label: "Approved received", kind: "money", width: 1.4 },
    { key: "pending", label: "Awaiting approval", kind: "money", width: 1.4 }, { key: "outstanding", label: "Outstanding", kind: "money", width: 1.4 }, { key: "collected", label: "Collected", kind: "percent", width: 0.8 },
  ];
  const body: ReportRow[] = [];
  for (const group of groups) {
    const list = currencies(group.value, group.tds, group.confirmedTds, group.netReceivable, group.approved, group.pending, group.outstanding);
    list.forEach((currency, index) => {
      const value = group.value.get(currency) ?? 0n, approved = group.approved.get(currency) ?? 0n;
      const netReceivable = group.netReceivable.get(currency) ?? 0n;
      body.push({ label: group.label, count: index === 0 ? group.count : 0, currency, value, tds: group.tds.get(currency) ?? 0n, confirmedTds: group.confirmedTds.get(currency) ?? 0n, netReceivable, approved, pending: group.pending.get(currency) ?? 0n, outstanding: group.outstanding.get(currency) ?? 0n, collected: collectionPercent(approved, netReceivable) });
    });
  }
  return { ...meta, columns, rows: body, footer: footerByCurrency(body, columns, "label") };
}

export function paymentTable(payments: PaymentRow[], meta: { title: string; subtitle: string }): ReportTable {
  const columns: Column[] = [
    { key: "paidOn", label: "Payment date", kind: "date", width: 0.9 }, { key: "number", label: "PI number", width: 1.2 }, { key: "client", label: "Client", width: 1.8 },
    { key: "event", label: "Exhibition", width: 1.6 }, { key: "employee", label: "Employee", width: 1 }, { key: "mode", label: "Mode", width: 0.8 }, { key: "reference", label: "UTR / reference", width: 1.2 },
    { key: "currency", label: "Cur.", width: 0.5 }, { key: "amount", label: "Cash received", kind: "money", width: 1.1 }, { key: "tds", label: "TDS deducted", kind: "money", width: 1.1 }, { key: "status", label: "Status", width: 1 },
    { key: "reviewedBy", label: "Reviewed by", width: 0.9 }, { key: "reviewedAt", label: "Reviewed on", kind: "date", width: 0.9 }, { key: "note", label: "Decline reason / remarks", width: 1.8 },
  ];
  const body = payments.map((payment) => {
    const document = payment.allocations[0]?.document;
    return {
      paidOn: payment.paidOn, number: payment.allocations.map((item) => item.document.number ?? "Draft").join(", ") || "—", client: document?.client.legalName ?? "—", event: document?.event?.name ?? "—",
      employee: document?.owner.name ?? payment.reportedBy.name, mode: paymentModeLabel(payment.mode), reference: payment.reference ?? "", currency: payment.currency, amount: payment.amountPaise, tds: payment.allocations.reduce((sum, allocation) => sum + allocation.tdsPaise, 0n),
      status: `${PAYMENT_STATUS_LABEL[payment.status] ?? payment.status}${payment.submissionCount > 1 ? ` (resubmitted ×${payment.submissionCount - 1})` : ""}`,
      reviewedBy: payment.verifiedBy?.name ?? "", reviewedAt: payment.reviewedAt, note: [payment.reviewNote, payment.remarks].filter(Boolean).join(" | "),
    };
  });
  return { ...meta, columns, rows: body, footer: footerByCurrency(body, columns, "paidOn") };
}
