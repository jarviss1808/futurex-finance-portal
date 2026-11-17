import Link from "next/link";
import { requirePortalIdentity } from "@/lib/security/portal";
import { filtersToQuery, loadPiRows, parseReportFilters, reportEmployees, reportEvents, totalsOf } from "@/lib/reports/sales";
import { buildReportTable, REPORT_VIEWS, resolveView } from "@/lib/reports/views";
import { collectionPercent, formatTotals } from "@/lib/reports/balances";
import { PAYMENT_STATUS_LABEL } from "@/lib/payments/modes";
import { FilterBar } from "@/components/filter-bar";
import { ReportTableView } from "@/components/report-table";

type Search = Record<string, string | string[] | undefined>;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { actor, user } = await requirePortalIdentity();
  const query = await searchParams;
  const admin = actor.role === "ADMIN";
  const view = resolveView(actor, typeof query.view === "string" ? query.view : undefined);
  const filters = parseReportFilters(query, actor);
  const [table, piRows, employees, events] = await Promise.all([
    buildReportTable(actor, view, filters, user.name),
    loadPiRows(actor, { ...filters, includeCancelled: false }),
    reportEmployees(actor),
    reportEvents(actor),
  ]);
  const totals = totalsOf(piRows);
  const inr = (map: Map<string, bigint>) => map.get("INR") ?? 0n;
  const exportBase = filtersToQuery(filters, { view }).toString();
  const tabQuery = (next: string) => filtersToQuery(filters, { view: next }).toString();

  return <>
    <header className="page-head"><div><p className="eyebrow">{admin ? "COMPANY REPORTS" : "MY REPORTS"}</p><h1>Reports</h1><p>{admin ? "Compare employees, exhibitions, clients and months for any period. Every view downloads as Excel, PDF or CSV." : "Your own sales, collections and outstanding balances for any period. Downloads include only your records."}</p></div></header>

    <section className="metrics six">
      <article><span>PIs issued</span><strong>{totals.count}</strong><small>{filters.period.label}</small></article>
      <article><span>Gross PI value</span><strong>{formatTotals(totals.value)}</strong><small>Manual TDS {formatTotals(totals.tds)} · Confirmed {formatTotals(totals.confirmedTds)}</small></article>
      <article><span>Approved received</span><strong>{formatTotals(totals.approved)}</strong><small>against these PIs</small></article>
      <article><span>Awaiting approval</span><strong>{formatTotals(totals.pending)}</strong></article>
      <article className="alert"><span>Outstanding</span><strong>{formatTotals(totals.outstanding)}</strong></article>
      <article><span>Collected</span><strong>{collectionPercent(inr(totals.approved), inr(totals.netReceivable))}</strong><small>of INR net receivable · {formatTotals(totals.netReceivable)}</small></article>
    </section>

    <nav className="tabs" aria-label="Report views">{REPORT_VIEWS.filter((item) => !item.adminOnly || admin).map((item) => <Link key={item.value} href={`/reports?${tabQuery(item.value)}`} className={item.value === view ? "active" : undefined}>{item.label}</Link>)}</nav>

    <section className="panel">
      <FilterBar action="/reports" hidden={{ view }} filters={filters} employees={admin ? employees.map((item) => ({ id: item.id, name: item.active ? item.name : `${item.name} (inactive)` })) : []} events={events.map((event) => ({ id: event.id, name: event.name }))} showState={view !== "payments"} showCancelled={view === "register"} showPiCategory={view !== "payments"} showPaymentStatus={view === "payments"} statusOptions={(["PENDING", "VERIFIED", "REJECTED", "WITHDRAWN"] as const).map((status) => ({ value: status, label: PAYMENT_STATUS_LABEL[status] }))} dateLabel={view === "payments" ? "Payment date" : "PI date"} />
      <div className="report-head">
        <div><h2>{table.title}</h2><p>{table.subtitle}</p></div>
        <div className="export-row"><span>Download:</span><a className="button small" href={`/api/reports/export?${exportBase}&format=xlsx`}>Excel</a><a className="button small secondary" href={`/api/reports/export?${exportBase}&format=pdf`}>PDF</a><a className="button small secondary" href={`/api/reports/export?${exportBase}&format=csv`}>CSV</a></div>
      </div>
      {view !== "payments" && view !== "register" && <p className="hint">Sales = value of PIs issued in the period (cancelled PIs excluded). Approved received and outstanding are the current position of those PIs. Pending entries never reduce outstanding.</p>}
      <ReportTableView table={table} barKey={["employee", "event", "client", "month"].includes(view) ? "value" : undefined} />
    </section>
  </>;
}
