import Link from "next/link";
import { db } from "@/lib/db";
import { requirePortalIdentity } from "@/lib/security/portal";
import { formatCurrencyMinor } from "@/lib/finance/money";
import { approvedCollections, groupRows, loadPiRows, reportEmployees, totalsOf } from "@/lib/reports/sales";
import { financialYearLabel, formatIstDate, inPeriod, resolvePeriod } from "@/lib/reports/period";
import { collectionPercent, formatTotals, PAYMENT_STATE_LABEL } from "@/lib/reports/balances";
import { groupTable } from "@/lib/reports/tables";
import { findActiveSeries } from "@/lib/documents/series";
import { ReportTableView } from "@/components/report-table";

const CHIPS = [["today", "Today"], ["this_week", "This week"], ["this_month", "This month"], ["last_month", "Last month"], ["this_quarter", "This quarter"], ["this_fy", "This FY"]] as const;

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { actor, user } = await requirePortalIdentity();
  const admin = actor.role === "ADMIN";
  const period = resolvePeriod((await searchParams).period, undefined, undefined, new Date(), "this_month");
  const [rows, collections, pending, declined, employees, series] = await Promise.all([
    loadPiRows(actor, {}),
    approvedCollections(actor, period),
    db.payment.findMany({ where: admin ? { organizationId: actor.organizationId, status: "PENDING" } : { organizationId: actor.organizationId, status: "PENDING", reportedById: actor.id }, select: { amountPaise: true, currency: true, submittedAt: true } }),
    db.payment.findMany({ where: { organizationId: actor.organizationId, status: "REJECTED", ...(admin ? {} : { reportedById: actor.id }) }, select: { id: true, amountPaise: true, currency: true, reviewNote: true, allocations: { select: { document: { select: { number: true, client: { select: { legalName: true } } } } }, take: 1 } }, orderBy: { reviewedAt: "desc" }, take: 5 }),
    reportEmployees(actor),
    admin ? findActiveSeries(db, actor.organizationId, "PROFORMA") : Promise.resolve(null),
  ]);
  const inRange = rows.filter((row) => inPeriod(row.issuedAt, period));
  const periodTotals = totalsOf(inRange);
  const overall = totalsOf(rows);
  const pendingTotals = new Map<string, bigint>();
  for (const row of pending) pendingTotals.set(row.currency, (pendingTotals.get(row.currency) ?? 0n) + row.amountPaise);
  const oldestPending = pending.reduce<Date | null>((oldest, row) => (!oldest || row.submittedAt < oldest ? row.submittedAt : oldest), null);
  const currentFy = financialYearLabel();
  const seed = admin ? employees.filter((item) => item.active && item.role === "EMPLOYEE").map((item) => ({ key: item.id, label: item.name })) : [];
  const byEmployee = admin ? groupTable(groupRows(inRange, "employee", seed), "employee", { title: "", subtitle: "" }) : null;
  const byEvent = groupTable(groupRows(inRange, "event").slice(0, 8), "event", { title: "", subtitle: "" });
  const topOutstanding = groupRows(rows.filter((row) => row.outstanding > 0n), "client").sort((a, b) => Number((b.outstanding.get("INR") ?? 0n) - (a.outstanding.get("INR") ?? 0n))).slice(0, 6);
  const recent = rows.slice(0, 8);

  return <>
    <header className="page-head">
      <div><p className="eyebrow">{admin ? "COMPANY OVERVIEW" : "MY WORKSPACE"}</p><h1>{greeting()}, {user.name.split(" ")[0]}</h1><p>{admin ? "Company-wide sales, collections and approvals at a glance." : "Your sales, collections and the payments that need your attention."}</p></div>
      <div className="head-actions"><Link className="button" href="/documents/new">Create PI</Link><Link className="button secondary" href="/payments">Record payment</Link></div>
    </header>

    {admin && series && series.financialYear !== currentFy && <div className="notice warning">The active PI series is for FY {series.financialYear}, but the current financial year is {currentFy}. Create and enable the new series under <Link href="/admin#numbering">Administration → Document numbering</Link>.</div>}
    {admin && !series && <div className="notice warning">No PI number series is enabled, so PIs cannot be issued. Enable one under <Link href="/admin#numbering">Administration → Document numbering</Link>.</div>}

    <nav className="chips" aria-label="Period">{CHIPS.map(([value, label]) => <Link key={value} href={`/dashboard?period=${value}`} className={period.preset === value ? "active" : undefined}>{label}</Link>)}<Link href="/reports">Custom range →</Link></nav>

    <section className="metrics six">
      <article><span>PIs issued</span><strong>{periodTotals.count}</strong><small>{period.label}</small></article>
      <article><span>Gross PI value</span><strong>{formatTotals(periodTotals.value)}</strong><small>Manual TDS {formatTotals(periodTotals.tds)} · Confirmed {formatTotals(periodTotals.confirmedTds)} · Net {formatTotals(periodTotals.netReceivable)}</small></article>
      <article className="good"><span>Approved collections</span><strong>{formatTotals(collections.totals)}</strong><small>payments dated in this period</small></article>
      <article className="alert"><span>Total outstanding</span><strong>{formatTotals(overall.outstanding)}</strong><small>all open PIs · {collectionPercent(overall.approved.get("INR") ?? 0n, overall.netReceivable.get("INR") ?? 0n)} of net receivable collected</small></article>
      <article><span>Awaiting approval</span><strong>{pending.length}</strong><small>{formatTotals(pendingTotals, "₹0.00")}{oldestPending ? ` · oldest ${formatIstDate(oldestPending)}` : ""}</small></article>
      <article className={declined.length ? "alert" : undefined}><span>{admin ? "Recently declined" : "Declined — fix & resubmit"}</span><strong>{declined.length}</strong><small>{declined.length ? "open Payments to review" : "nothing to correct"}</small></article>
    </section>

    {(admin ? pending.length > 0 : declined.length > 0) && <section className="panel attention">
      <div className="panel-head"><h2>Needs your attention</h2><Link href="/payments">Open payments →</Link></div>
      {admin ? <p>{pending.length} payment {pending.length === 1 ? "entry is" : "entries are"} waiting for approval ({formatTotals(pendingTotals)}). Employees see the result as soon as you approve or decline.</p>
        : <ul className="attention-list">{declined.map((row) => <li key={row.id}><b>{formatCurrencyMinor(row.amountPaise, row.currency)}</b> · {row.allocations[0]?.document.number} · {row.allocations[0]?.document.client.legalName}<span>Reason: {row.reviewNote}</span></li>)}</ul>}
    </section>}

    {byEmployee && <section className="panel"><div className="panel-head"><h2>Employee performance · {period.label}</h2><Link href={`/reports?view=employee&period=${period.preset}`}>Full report & download →</Link></div><ReportTableView table={byEmployee} barKey="value" /></section>}

    <div className="split even">
      <section className="panel"><div className="panel-head"><h2>{admin ? "Exhibitions" : "My exhibitions"} · {period.label.split(" (")[0]}</h2><Link href={`/reports?view=event&period=${period.preset}`}>Report →</Link></div><ReportTableView table={byEvent} barKey="value" /></section>
      <section className="panel"><div className="panel-head"><h2>Highest balances due</h2><Link href="/reminders">Send reminders →</Link></div>
        <div className="table-wrap"><table><thead><tr><th>Client</th><th className="num">PIs</th><th className="num">Outstanding</th></tr></thead><tbody>
          {topOutstanding.map((group) => <tr key={group.key}><td>{group.label}</td><td className="num">{group.count}</td><td className="num"><strong>{formatTotals(group.outstanding)}</strong></td></tr>)}
          {!topOutstanding.length && <tr><td colSpan={3} className="empty">No balance is due. Excellent!</td></tr>}
        </tbody></table></div>
      </section>
    </div>

    <section className="panel"><div className="panel-head"><h2>Latest PIs</h2><Link href="/documents">All PIs →</Link></div>
      <div className="table-wrap"><table><thead><tr><th>PI</th><th>Client</th><th>Exhibition</th>{admin && <th>Employee</th>}<th className="num">Gross / TDS / Net</th><th className="num">Outstanding</th><th>Status</th></tr></thead><tbody>
        {recent.map((row) => <tr key={row.id}><td><Link href={`/documents/${row.id}`}>{row.number}</Link><small className="block">{formatIstDate(row.issuedAt)}</small></td><td>{row.client.legalName}</td><td>{row.event?.name ?? "—"}</td>{admin && <td>{row.owner.name}</td>}<td className="num">{formatCurrencyMinor(row.total, row.currency)}<small className="block">TDS {formatCurrencyMinor(row.tds, row.currency)} · Net {formatCurrencyMinor(row.netReceivable, row.currency)}</small></td><td className="num">{formatCurrencyMinor(row.outstanding, row.currency)}</td><td><span className={`badge state-${row.state.toLowerCase()}`}>{PAYMENT_STATE_LABEL[row.state]}</span></td></tr>)}
        {!recent.length && <tr><td colSpan={admin ? 7 : 6} className="empty">No PI issued yet. <Link href="/documents/new">Create your first PI</Link>.</td></tr>}
      </tbody></table></div>
    </section>
  </>;
}
