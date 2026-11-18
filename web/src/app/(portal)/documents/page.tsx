import Link from "next/link";
import { currentActor } from "@/lib/security/portal";
import { listVisibleDocuments } from "@/lib/documents/repository";
import { listVisibleClients } from "@/lib/clients/repository";
import { formatCurrencyMinor } from "@/lib/finance/money";
import { piBalance, PAYMENT_STATE_LABEL } from "@/lib/reports/balances";
import { formatIstDate } from "@/lib/reports/period";
import { db } from "@/lib/db";

const statuses = [["DRAFT", "Draft"], ["ISSUED", "Issued"], ["VOIDED", "Cancelled"]] as const;
const types = ["PROFORMA", "TAX_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE", "RECEIPT"] as const;
function dateValue(value: string | undefined) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000+05:30`) : undefined; }

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ status?: string; type?: string; employee?: string; client?: string; event?: string; from?: string; to?: string }> }) {
  const actor = (await currentActor())!;
  const query = await searchParams;
  const admin = actor.role === "ADMIN";
  const from = dateValue(query.from); const toDate = dateValue(query.to); const to = toDate ? new Date(toDate.getTime() + 86_400_000) : undefined;
  const status = statuses.find(([value]) => value === query.status)?.[0];
  const type = query.type === "ALL" ? undefined : types.find((item) => item === query.type) ?? "PROFORMA";
  const [docs, employees, clients, events] = await Promise.all([
    listVisibleDocuments(actor, { status, type, ownerId: admin ? query.employee || undefined : undefined, clientId: query.client || undefined, eventId: query.event || undefined, from, to }),
    admin ? db.user.findMany({ where: { organizationId: actor.organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    listVisibleClients(actor),
    db.event.findMany({ where: { organizationId: actor.organizationId }, select: { id: true, name: true }, orderBy: { startsOn: "asc" } }),
  ]);
  const exportQuery = new URLSearchParams(); for (const [key, value] of Object.entries(query)) if (value) exportQuery.set(key, value);
  const columns = admin ? 9 : 8;
  return <>
    <header className="page-head"><div><p className="eyebrow">{admin ? "ALL PIs" : "MY PIs"}</p><h1>Proforma invoices</h1><p>{admin ? "Every PI across the company — who created it, for which client and exhibition, and how much is still due." : "PIs you have created. Outstanding falls only when Admin approves a payment."}</p></div><Link className="button" href="/documents/new">Create PI</Link></header>
    <section className="panel">
      <form className="filter-bar" method="get">
        <label className="field"><small>Type</small><select name="type" defaultValue={query.type ?? "PROFORMA"}><option value="PROFORMA">Proforma invoices</option>{admin && <><option value="TAX_INVOICE">Tax invoices</option><option value="CREDIT_NOTE">Credit notes</option><option value="DEBIT_NOTE">Debit notes</option><option value="RECEIPT">Receipts</option></>}<option value="ALL">All documents</option></select></label>
        <label className="field"><small>Status</small><select name="status" defaultValue={query.status ?? ""}><option value="">Any status</option>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {admin && <label className="field"><small>Employee</small><select name="employee" defaultValue={query.employee ?? ""}><option value="">All employees</option>{employees.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>}
        <label className="field"><small>Exhibition</small><select name="event" defaultValue={query.event ?? ""}><option value="">All exhibitions</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>
        <label className="field"><small>Client</small><select name="client" defaultValue={query.client ?? ""}><option value="">All clients</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.legalName}</option>)}</select></label>
        <label className="field"><small>Created from</small><input name="from" type="date" defaultValue={query.from ?? ""} /></label>
        <label className="field"><small>Created to</small><input name="to" type="date" defaultValue={query.to ?? ""} /></label>
        <div className="filter-actions"><button className="button small">Apply</button><Link className="button small ghost" href="/documents">Reset</Link><a className="button small secondary" href={`/api/reports/documents?${exportQuery.toString()}`}>CSV</a></div>
      </form>
      <p className="hint">For period, exhibition and employee analysis with Excel/PDF downloads, use <Link href="/reports?view=register">Reports → PI register</Link>.</p>
      <div className="table-wrap"><table>
        <thead><tr><th>Number</th><th>Client</th><th>Exhibition</th>{admin && <th>Employee</th>}<th>Status</th><th>Date</th><th className="num">Value</th><th className="num">Received</th><th className="num">Outstanding</th></tr></thead>
        <tbody>{docs.map((document) => {
          const effectiveSnapshot = (document.correctedSnapshot ?? document.snapshot ?? {}) as { event?: { name?: string } };
          const balance = piBalance(document.netReceivablePaise, document.status, document.allocations.map((item) => ({ amountPaise: item.amountPaise, status: item.payment.status })));
          const issued = document.status === "ISSUED" && ["PROFORMA", "TAX_INVOICE"].includes(document.type);
          return <tr key={document.id}>
            <td><Link href={`/documents/${document.id}`}>{document.number ?? "Draft"}</Link>{document.type !== "PROFORMA" && <small className="block">{document.type.replaceAll("_", " ")}</small>}</td>
            <td>{document.client.legalName}</td><td>{document.event?.name ?? effectiveSnapshot.event?.name ?? "—"}{document.stallNumber && <small className="block">Stall {document.stallNumber}</small>}</td>{admin && <td>{document.owner.name}</td>}
            <td><span className={`badge ${document.status === "VOIDED" ? "rejected" : document.status.toLowerCase()}`}>{document.status === "VOIDED" ? "CANCELLED" : document.status}</span>{issued && <small className="block">{PAYMENT_STATE_LABEL[balance.state]}</small>}</td>
            <td>{formatIstDate(document.issuedAt ?? document.createdAt)}</td>
            <td className="num">{formatCurrencyMinor(document.totalPaise, document.currency)}{document.tdsPaise > 0n && <small className="block">Net {formatCurrencyMinor(document.netReceivablePaise, document.currency)}</small>}{document.correctionVersion === 1 && <small className="block">Corrected once</small>}</td>
            <td className="num">{issued ? formatCurrencyMinor(balance.approved, document.currency) : "—"}{issued && balance.pending > 0n && <small className="block warn">+{formatCurrencyMinor(balance.pending, document.currency)} pending</small>}</td>
            <td className="num">{issued ? <strong>{formatCurrencyMinor(balance.outstanding, document.currency)}</strong> : "—"}</td>
          </tr>;
        })}{!docs.length && <tr><td colSpan={columns} className="empty">No documents match these filters.</td></tr>}</tbody>
      </table></div>
    </section>
  </>;
}
