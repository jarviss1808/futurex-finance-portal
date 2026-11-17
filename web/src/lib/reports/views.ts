import "server-only";
import { HttpError } from "@/lib/http";
import type { Actor } from "@/lib/security/policy";
import { PAYMENT_STATE_LABEL } from "./balances";
import { PAYMENT_STATUS_LABEL } from "@/lib/payments/modes";
import { groupRows, loadPaymentRows, loadPiRows, reportEmployees, reportEvents, type ReportFilters } from "./sales";
import { groupTable, paymentTable, piRegisterTable, type ReportTable } from "./tables";

export const REPORT_VIEWS = [
  { value: "employee", label: "Employee performance", adminOnly: true },
  { value: "event", label: "Exhibition-wise", adminOnly: false },
  { value: "client", label: "Client-wise", adminOnly: false },
  { value: "month", label: "Month-wise", adminOnly: false },
  { value: "register", label: "PI register", adminOnly: false },
  { value: "payments", label: "Payments", adminOnly: false },
] as const;
export type ReportView = (typeof REPORT_VIEWS)[number]["value"];

export function resolveView(actor: Actor, raw: string | undefined): ReportView {
  const allowed = REPORT_VIEWS.filter((view) => !view.adminOnly || actor.role === "ADMIN");
  return (allowed.find((view) => view.value === raw) ?? allowed[0]).value;
}

export async function describeFilters(actor: Actor, filters: ReportFilters, view: ReportView, userName: string) {
  const [employees, events] = await Promise.all([filters.employeeIds.length ? reportEmployees(actor) : [], filters.eventIds.length ? reportEvents(actor) : []]);
  const parts = [filters.period.label];
  if (actor.role === "ADMIN") parts.push(filters.employeeIds.length ? `Employees: ${employees.filter((item) => filters.employeeIds.includes(item.id)).map((item) => item.name).join(", ")}` : "All employees");
  else parts.push(`Employee: ${userName}`);
  if (filters.eventIds.length) parts.push(`Exhibitions: ${events.filter((item) => filters.eventIds.includes(item.id)).map((item) => item.name).join(", ")}`);
  if (filters.search) parts.push(`Search: "${filters.search}"`);
  if (view === "payments") { if (filters.paymentStatuses.length) parts.push(`Status: ${filters.paymentStatuses.map((status) => PAYMENT_STATUS_LABEL[status]).join(", ")}`); }
  else {
    if (filters.state !== "ALL") parts.push(PAYMENT_STATE_LABEL[filters.state]);
    if (filters.includeCancelled && view === "register") parts.push("Including cancelled PIs");
  }
  return parts.join(" · ");
}

export async function buildReportTable(actor: Actor, view: ReportView, filters: ReportFilters, userName: string): Promise<ReportTable> {
  if (view === "employee" && actor.role !== "ADMIN") throw new HttpError(403, "Employee comparison is available to Admin only");
  const subtitle = await describeFilters(actor, filters, view, userName);
  const title = REPORT_VIEWS.find((item) => item.value === view)!.label;
  if (view === "payments") return paymentTable(await loadPaymentRows(actor, filters), { title: "Payment register", subtitle: `Payment date: ${subtitle}` });
  const rows = await loadPiRows(actor, { ...filters, includeCancelled: view === "register" && filters.includeCancelled });
  if (view === "register") return piRegisterTable(rows, { title: "PI register", subtitle: `PI date: ${subtitle}` });
  let seed: Array<{ key: string; label: string }> = [];
  if (view === "employee") {
    const employees = await reportEmployees(actor);
    seed = employees.filter((user) => user.active && user.role === "EMPLOYEE" && (!filters.employeeIds.length || filters.employeeIds.includes(user.id))).map((user) => ({ key: user.id, label: user.name }));
  }
  return groupTable(groupRows(rows, view, seed), view, { title: `${title} – sales & collections`, subtitle: `PIs issued: ${subtitle}` });
}

export function exportFileName(table: ReportTable, extension: string) {
  const stamp = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return `Futurex-${table.title.replace(/[^a-zA-Z0-9]+/g, "-").replace(/-+$/, "")}-${stamp}.${extension}`;
}
