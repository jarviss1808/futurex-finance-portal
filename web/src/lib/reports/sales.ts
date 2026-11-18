import "server-only";
import type { PaymentStatus, PiCategory, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { documentScope, type Actor } from "@/lib/security/policy";
import { listVisiblePayments } from "@/lib/payments/repository";
import { addTotal, piBalance, type CurrencyTotals, type PaymentState } from "./balances";
import { istMonth, resolvePeriod, type Period } from "./period";
import type { Dimension } from "./dimension";
import { PI_CATEGORIES } from "@/lib/documents/pi-category";

export type ReportFilters = {
  period: Period;
  employeeIds: string[];
  eventIds: string[];
  search: string;
  state: "ALL" | Exclude<PaymentState, "CANCELLED">;
  includeCancelled: boolean;
  paymentStatuses: PaymentStatus[];
  piCategories: PiCategory[];
};

type Params = Record<string, string | string[] | undefined>;
const list = (value: string | string[] | undefined) => (Array.isArray(value) ? value : value ? [value] : []).flatMap((item) => item.split(",")).map((item) => item.trim()).filter((item) => /^[a-z0-9]{10,40}$/i.test(item));
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? undefined;
const PAYMENT_STATUSES: PaymentStatus[] = ["PENDING", "VERIFIED", "REJECTED", "WITHDRAWN"];

/** Parses URL filters. Cross-employee filters are honoured only for Admin. */
export function parseReportFilters(params: Params, actor: Actor, fallback: Parameters<typeof resolvePeriod>[4] = "this_month"): ReportFilters {
  const state = one(params.state);
  const statuses = (Array.isArray(params.pstatus) ? params.pstatus : params.pstatus ? [params.pstatus] : []).flatMap((item) => item.split(","));
  const categories = (Array.isArray(params.category) ? params.category : params.category ? [params.category] : []).flatMap((item) => item.split(","));
  return {
    period: resolvePeriod(one(params.period), one(params.from), one(params.to), new Date(), fallback),
    employeeIds: actor.role === "ADMIN" ? list(params.employee) : [],
    eventIds: list(params.event),
    search: (one(params.q) ?? "").trim().slice(0, 100),
    state: state === "PAID" || state === "PARTIAL" || state === "UNPAID" ? state : "ALL",
    includeCancelled: one(params.cancelled) === "1",
    paymentStatuses: PAYMENT_STATUSES.filter((status) => statuses.includes(status)),
    piCategories: PI_CATEGORIES.map((item) => item.value).filter((category) => categories.includes(category)),
  };
}

export function filtersToQuery(filters: ReportFilters, extra: Record<string, string> = {}) {
  const query = new URLSearchParams();
  query.set("period", filters.period.preset);
  if (filters.period.preset === "custom") { if (filters.period.fromDate) query.set("from", filters.period.fromDate); if (filters.period.toDate) query.set("to", filters.period.toDate); }
  for (const id of filters.employeeIds) query.append("employee", id);
  for (const id of filters.eventIds) query.append("event", id);
  if (filters.search) query.set("q", filters.search);
  if (filters.state !== "ALL") query.set("state", filters.state);
  if (filters.includeCancelled) query.set("cancelled", "1");
  for (const status of filters.paymentStatuses) query.append("pstatus", status);
  for (const category of filters.piCategories) query.append("category", category);
  for (const [key, value] of Object.entries(extra)) query.set(key, value);
  return query;
}

export type PiRow = {
  id: string; number: string; issuedAt: Date; status: string; currency: string;
  category: PiCategory; stallNumber: string; area: string; rate: bigint; taxable: bigint; cgst: bigint; sgst: bigint; igst: bigint; tax: bigint; tds: bigint; confirmedTds: bigint; pendingTds: bigint; netReceivable: bigint;
  total: bigint; approved: bigint; pending: bigint; declined: bigint; outstanding: bigint; state: PaymentState;
  owner: { id: string; name: string }; client: { id: string; legalName: string; contactName: string | null; contactEmail: string | null; additionalEmails: string[] }; event: { id: string; name: string; venue: string; city: string; countryCode: string } | null;
};

/** Issued (and optionally cancelled) PIs visible to the actor, with official balances. */
export async function loadPiRows(actor: Actor, filters: Partial<ReportFilters> & { period?: Pick<Period, "from" | "to"> } = {}): Promise<PiRow[]> {
  const and: Prisma.FinancialDocumentWhereInput[] = [documentScope(actor), { type: "PROFORMA", number: { not: null }, status: filters.includeCancelled ? { in: ["ISSUED", "VOIDED"] } : "ISSUED" }];
  if (filters.period?.from || filters.period?.to) and.push({ issuedAt: { ...(filters.period.from ? { gte: filters.period.from } : {}), ...(filters.period.to ? { lt: filters.period.to } : {}) } });
  if (filters.employeeIds?.length && actor.role === "ADMIN") and.push({ ownerId: { in: filters.employeeIds } });
  if (filters.eventIds?.length) and.push({ eventId: { in: filters.eventIds } });
  if (filters.piCategories?.length) and.push({ piCategory: { in: filters.piCategories } });
  if (filters.search) and.push({ OR: [{ number: { contains: filters.search, mode: "insensitive" } }, { stallNumber: { contains: filters.search, mode: "insensitive" } }, { client: { legalName: { contains: filters.search, mode: "insensitive" } } }] });
  const documents = await db.financialDocument.findMany({
    where: { AND: and },
    select: { id: true, number: true, issuedAt: true, status: true, currency: true, piCategory: true, stallNumber: true, taxablePaise: true, taxPaise: true, totalPaise: true, tdsPaise: true, netReceivablePaise: true, snapshot: true, correctedSnapshot: true, owner: { select: { id: true, name: true } }, client: { select: { id: true, legalName: true, contactName: true, contactEmail: true, additionalEmails: true } }, event: { select: { id: true, name: true, venue: true, city: true, countryCode: true } }, allocations: { select: { amountPaise: true, tdsPaise: true, payment: { select: { status: true } } } } },
    orderBy: [{ issuedAt: "desc" }],
  });
  const rows = documents.map((document) => {
    const snapshot = (document.correctedSnapshot ?? document.snapshot ?? {}) as { purpose?: string; stallNumber?: string; event?: { name: string; venue: string; city: string; countryCode: string }; lines?: Array<{ unit?: string; quantity?: string; unitPricePaise?: string }>; taxBreakdown?: Array<{ label?: string; amountPaise?: string }> };
    const space = snapshot.lines?.find((line) => line.unit?.toUpperCase() === "SQM");
    const taxes = snapshot.taxBreakdown ?? [];
    const component = (name: string) => taxes.filter((item) => item.label?.toUpperCase().startsWith(name)).reduce((sum, item) => sum + BigInt(item.amountPaise ?? "0"), 0n);
    const balance = piBalance(document.netReceivablePaise, document.status, document.allocations.map((allocation) => ({ amountPaise: allocation.amountPaise, status: allocation.payment.status })));
    const confirmedTds = document.allocations.filter((allocation) => allocation.payment.status === "VERIFIED").reduce((sum, allocation) => sum + allocation.tdsPaise, 0n);
    const pendingTds = document.allocations.filter((allocation) => allocation.payment.status === "PENDING").reduce((sum, allocation) => sum + allocation.tdsPaise, 0n);
    const event = document.event ?? (snapshot.event ? { id: `custom:${document.id}`, name: snapshot.event.name, venue: snapshot.event.venue, city: snapshot.event.city, countryCode: snapshot.event.countryCode } : null);
    return { id: document.id, number: document.number!, issuedAt: document.issuedAt ?? new Date(0), status: document.status, currency: document.currency, category: document.piCategory ?? (snapshot.purpose === "ADDITIONAL_ITEMS" ? "EXTRA_REQUIREMENTS" : "EXHIBITION_PARTICIPATION"), stallNumber: snapshot.stallNumber ?? document.stallNumber ?? "", area: space?.quantity ?? "", rate: BigInt(space?.unitPricePaise ?? "0"), taxable: document.taxablePaise, cgst: component("CGST"), sgst: component("SGST"), igst: component("IGST"), tax: document.taxPaise, tds: document.tdsPaise, confirmedTds, pendingTds, netReceivable: document.netReceivablePaise, total: document.totalPaise, ...balance, owner: document.owner, client: document.client, event };
  });
  return filters.state && filters.state !== "ALL" ? rows.filter((row) => row.state === filters.state) : rows;
}

export type Group = { key: string; label: string; count: number; value: CurrencyTotals; tds: CurrencyTotals; confirmedTds: CurrencyTotals; netReceivable: CurrencyTotals; approved: CurrencyTotals; pending: CurrencyTotals; outstanding: CurrencyTotals };
export { DIMENSION_LABEL, type Dimension } from "./dimension";

function emptyGroup(key: string, label: string): Group {
  return { key, label, count: 0, value: new Map(), tds: new Map(), confirmedTds: new Map(), netReceivable: new Map(), approved: new Map(), pending: new Map(), outstanding: new Map() };
}

/** Groups PI rows. Cancelled PIs are counted only in the register, never in sales totals. */
export function groupRows(rows: PiRow[], dimension: Dimension, seed: Array<{ key: string; label: string }> = []) {
  const groups = new Map<string, Group>(seed.map((item) => [item.key, emptyGroup(item.key, item.label)]));
  for (const row of rows) {
    if (row.status === "VOIDED") continue;
    const { key, label } = dimension === "employee" ? { key: row.owner.id, label: row.owner.name }
      : dimension === "event" ? { key: row.event?.id ?? "none", label: row.event?.name ?? "No exhibition" }
      : dimension === "client" ? { key: row.client.legalName.trim().toLowerCase(), label: row.client.legalName }
      : istMonth(row.issuedAt);
    const group = groups.get(key) ?? emptyGroup(key, label);
    group.count += 1;
    addTotal(group.value, row.currency, row.total);
    addTotal(group.tds, row.currency, row.tds);
    addTotal(group.confirmedTds, row.currency, row.confirmedTds);
    addTotal(group.netReceivable, row.currency, row.netReceivable);
    addTotal(group.approved, row.currency, row.approved);
    addTotal(group.pending, row.currency, row.pending);
    addTotal(group.outstanding, row.currency, row.outstanding);
    groups.set(key, group);
  }
  const sorted = [...groups.values()];
  if (dimension === "month") sorted.sort((a, b) => b.key.localeCompare(a.key));
  else sorted.sort((a, b) => Number((b.value.get("INR") ?? 0n) - (a.value.get("INR") ?? 0n)) || b.count - a.count || a.label.localeCompare(b.label));
  return sorted;
}

export function totalsOf(rows: PiRow[]) {
  const total = emptyGroup("total", "Total");
  for (const row of rows) {
    if (row.status === "VOIDED") continue;
    total.count += 1;
    addTotal(total.value, row.currency, row.total);
    addTotal(total.tds, row.currency, row.tds);
    addTotal(total.confirmedTds, row.currency, row.confirmedTds);
    addTotal(total.netReceivable, row.currency, row.netReceivable);
    addTotal(total.approved, row.currency, row.approved);
    addTotal(total.pending, row.currency, row.pending);
    addTotal(total.outstanding, row.currency, row.outstanding);
  }
  return total;
}

export async function loadPaymentRows(actor: Actor, filters: ReportFilters) {
  return listVisiblePayments(actor, { statuses: filters.paymentStatuses, ownerIds: filters.employeeIds, eventIds: filters.eventIds, search: filters.search || undefined, from: filters.period.from, to: filters.period.to });
}

/** Approved collections whose payment date falls in the period (by currency). */
export async function approvedCollections(actor: Actor, period: Pick<Period, "from" | "to">, employeeIds: string[] = []) {
  const payments = await listVisiblePayments(actor, { statuses: ["VERIFIED"], from: period.from, to: period.to, ownerIds: employeeIds });
  const totals: CurrencyTotals = new Map();
  for (const payment of payments) addTotal(totals, payment.currency, payment.amountPaise);
  return { totals, count: payments.length, payments };
}

export function reportEmployees(actor: Actor) {
  return actor.role === "ADMIN" ? db.user.findMany({ where: { organizationId: actor.organizationId }, select: { id: true, name: true, role: true, active: true }, orderBy: [{ active: "desc" }, { name: "asc" }] }) : Promise.resolve([]);
}

export function reportEvents(actor: Actor) {
  return db.event.findMany({ where: { organizationId: actor.organizationId }, select: { id: true, name: true, edition: true, startsOn: true }, orderBy: { startsOn: "asc" } });
}
