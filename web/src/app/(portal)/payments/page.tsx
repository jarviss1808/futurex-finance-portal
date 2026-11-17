import Link from "next/link";
import { requirePortalIdentity } from "@/lib/security/portal";
import { listVisiblePayments, paymentHistory } from "@/lib/payments/repository";
import { toPaymentView } from "@/lib/payments/view";
import { formatCurrencyMinor, minorUnitsToDecimal } from "@/lib/finance/money";
import { loadPiRows, parseReportFilters, filtersToQuery, reportEmployees, reportEvents } from "@/lib/reports/sales";
import { PAYMENT_STATUS_LABEL } from "@/lib/payments/modes";
import { FilterBar } from "@/components/filter-bar";
import { PaymentCard, PaymentForm, type PiOption } from "./payment-ui";

type Search = Record<string, string | string[] | undefined>;

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { actor } = await requirePortalIdentity();
  const query = await searchParams;
  const admin = actor.role === "ADMIN";
  const filters = parseReportFilters(query, actor, "all");
  const [pis, queue, declined, entries, employees, events] = await Promise.all([
    loadPiRows(actor, {}),
    admin ? listVisiblePayments(actor, { statuses: ["PENDING"] }) : Promise.resolve([]),
    admin ? Promise.resolve([]) : listVisiblePayments(actor, { statuses: ["REJECTED"] }).then((rows) => rows.filter((row) => row.reportedById === actor.id)),
    listVisiblePayments(actor, { statuses: filters.paymentStatuses, ownerIds: filters.employeeIds, eventIds: filters.eventIds, search: filters.search || undefined, from: filters.period.from, to: filters.period.to, take: 300 }),
    reportEmployees(actor),
    reportEvents(actor),
  ]);
  const history = await paymentHistory(actor.organizationId, [...new Set([...queue, ...declined, ...entries].map((row) => row.id))]);
  const view = (row: (typeof entries)[number]) => toPaymentView(actor, row, history.get(row.id));
  const options: PiOption[] = pis.map((pi) => ({ pi, open: pi.netReceivable - pi.approved - pi.pending, openTds: pi.tds - pi.confirmedTds - pi.pendingTds })).filter(({ open }) => open > 0n).map(({ pi, open, openTds }) => ({
    id: pi.id, number: pi.number, client: pi.client.legalName, event: pi.event?.name ?? "—", owner: pi.owner.name, currency: pi.currency,
    total: formatCurrencyMinor(pi.total, pi.currency), approved: formatCurrencyMinor(pi.approved, pi.currency), pending: formatCurrencyMinor(pi.pending, pi.currency), open: formatCurrencyMinor(open, pi.currency), openDecimal: minorUnitsToDecimal(open), manualTds: formatCurrencyMinor(pi.tds, pi.currency), confirmedTds: formatCurrencyMinor(pi.confirmedTds, pi.currency), pendingTds: formatCurrencyMinor(pi.pendingTds, pi.currency), openTds: formatCurrencyMinor(openTds, pi.currency),
  }));
  const preselect = typeof query.pi === "string" ? query.pi : undefined;
  const oldestFirst = [...queue].sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
  const pendingTotal = new Map<string, bigint>();
  const pendingTds = new Map<string, bigint>();
  for (const row of queue) { pendingTotal.set(row.currency, (pendingTotal.get(row.currency) ?? 0n) + row.amountPaise); const tds = row.allocations.reduce((sum, allocation) => sum + allocation.tdsPaise, 0n); pendingTds.set(row.currency, (pendingTds.get(row.currency) ?? 0n) + tds); }
  const exportQuery = filtersToQuery(filters, { view: "payments" });

  return <>
    <header className="page-head"><div><p className="eyebrow">{admin ? "PAYMENT VERIFICATION" : "MY COLLECTIONS"}</p><h1>{admin ? "Payments & approvals" : "Payments"}</h1><p>{admin ? "Check each entry against the bank statement, then approve or decline it with a reason. Only approved payments reduce a PI's outstanding balance." : "Record the payments your clients make. Admin checks each entry against the bank and approves or declines it — the result appears here, with the reason if declined."}</p></div></header>

    {admin && <section className="panel">
      <div className="panel-head"><h2>Awaiting your approval <span className="count">{queue.length}</span></h2><span className="muted-text">Cash {[...pendingTotal].map(([currency, total]) => formatCurrencyMinor(total, currency)).join(" · ") || "—"} · TDS {[...pendingTds].map(([currency, total]) => formatCurrencyMinor(total, currency)).join(" · ") || "—"}</span></div>
      <div className="entry-list">{oldestFirst.map((row) => <PaymentCard key={row.id} payment={view(row)} emphasis />)}{!queue.length && <p className="empty">All caught up — no payment is waiting for approval.</p>}</div>
    </section>}

    {!admin && declined.length > 0 && <section className="panel attention">
      <div className="panel-head"><h2>Declined — needs your action <span className="count">{declined.length}</span></h2></div>
      <p className="muted-text">Check the reason with your client, then correct the details and resubmit. The entry goes back to Admin for approval.</p>
      <div className="entry-list">{declined.map((row) => <PaymentCard key={row.id} payment={view(row)} emphasis />)}</div>
    </section>}

    <details className="panel collapsible" open={!admin || Boolean(preselect)}>
      <summary><h2>Record a client payment</h2><span>Against an issued PI</span></summary>
      <PaymentForm pis={options} preselect={preselect} showOwner={admin} />
    </details>

    <section className="panel">
      <div className="panel-head"><h2>{admin ? "All payment entries" : "My payment entries"}</h2><span className="muted-text">{entries.length}{entries.length === 300 ? "+ (showing latest 300 — narrow the filters)" : ""}</span></div>
      <FilterBar action="/payments" filters={filters} employees={admin ? employees.map((user) => ({ id: user.id, name: user.name })) : []} events={events.map((event) => ({ id: event.id, name: event.name }))} showPaymentStatus statusOptions={(["PENDING", "VERIFIED", "REJECTED", "WITHDRAWN"] as const).map((status) => ({ value: status, label: PAYMENT_STATUS_LABEL[status] }))} dateLabel="Payment date" />
      <div className="export-row"><span>Download this list:</span><Link className="button small secondary" href={`/api/reports/export?${exportQuery}&format=xlsx`}>Excel</Link><Link className="button small secondary" href={`/api/reports/export?${exportQuery}&format=pdf`}>PDF</Link><Link className="button small secondary" href={`/api/reports/export?${exportQuery}&format=csv`}>CSV</Link></div>
      <div className="entry-list">{entries.map((row) => <PaymentCard key={row.id} payment={view(row)} />)}{!entries.length && <p className="empty">No payment entries match these filters.</p>}</div>
    </section>
  </>;
}
