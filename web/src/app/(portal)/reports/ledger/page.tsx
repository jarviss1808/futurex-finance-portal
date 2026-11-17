import { redirect } from "next/navigation";
import { currentActor } from "@/lib/security/portal";
import { formatCurrencyMinor } from "@/lib/finance/money";
import { db } from "@/lib/db";
import { TallyExport } from "../tally-export";

type LedgerRow = { id: string; legalName: string; currency: string; commitments: bigint; receivables: bigint; piPaid: bigint; statutoryPaid: bigint; piOpen: bigint; taxOpen: bigint };

function summarize(rows: LedgerRow[], key: "piOpen" | "taxOpen" | "piPaid") {
  const totals = new Map<string, bigint>();
  for (const row of rows) totals.set(row.currency, (totals.get(row.currency) ?? 0n) + row[key]);
  return [...totals].map(([currency, total]) => formatCurrencyMinor(total, currency)).join(" · ") || "—";
}

export default async function LedgerPage() {
  const actor = (await currentActor())!;
  if (!["ACCOUNTANT", "ADMIN"].includes(actor.role)) redirect("/reports");
  const [clients, tallyDocuments, unallocatedRows] = await Promise.all([
    db.client.findMany({ where: { organizationId: actor.organizationId }, include: { documents: { where: { status: "ISSUED", type: { in: ["PROFORMA", "TAX_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"] } }, include: { allocations: { where: { payment: { status: "VERIFIED" } } } } } }, orderBy: { legalName: "asc" } }),
    db.financialDocument.findMany({ where: { organizationId: actor.organizationId, status: "ISSUED", type: { in: ["TAX_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"] }, tallyExportItem: null, number: { not: null } }, select: { id: true, number: true, type: true, client: { select: { legalName: true } } }, orderBy: { issuedAt: "asc" } }),
    db.payment.groupBy({ by: ["currency"], where: { organizationId: actor.organizationId, status: "VERIFIED", allocations: { none: {} } }, _sum: { amountPaise: true } }),
  ]);

  const rows: LedgerRow[] = clients.flatMap((client) => {
    const currencies = [...new Set(client.documents.map((document) => document.currency))];
    return currencies.map((currency) => {
      const documents = client.documents.filter((document) => document.currency === currency);
      const proformas = documents.filter((document) => document.type === "PROFORMA");
      const statutory = documents.filter((document) => ["TAX_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"].includes(document.type));
      const commitments = proformas.reduce((sum, document) => sum + document.totalPaise, 0n);
      const piPaid = proformas.reduce((sum, document) => sum + document.allocations.reduce((allocated, allocation) => allocated + allocation.amountPaise, 0n), 0n);
      const receivables = statutory.reduce((sum, document) => sum + (document.type === "CREDIT_NOTE" ? -document.totalPaise : document.totalPaise), 0n);
      const statutoryPaid = statutory.reduce((sum, document) => sum + document.allocations.reduce((allocated, allocation) => allocated + allocation.amountPaise, 0n), 0n);
      return { id: `${client.id}:${currency}`, legalName: client.legalName, currency, commitments, receivables, piPaid, statutoryPaid, piOpen: commitments - piPaid, taxOpen: receivables - statutoryPaid };
    });
  });
  const unallocated = unallocatedRows.map((row) => formatCurrencyMinor(row._sum.amountPaise ?? 0n, row.currency)).join(" · ") || "—";

  return <>
    <header className="page-head"><div><p className="eyebrow">ACCOUNTS</p><h1>Client ledger & Tally</h1><p>PI commitments and statutory receivables are separated by currency. Credit notes reduce statutory receivables.</p></div></header>
    <section className="metrics"><article><span>Open PI commitments</span><strong>{summarize(rows, "piOpen")}</strong></article><article><span>Open statutory receivables</span><strong>{summarize(rows, "taxOpen")}</strong></article><article><span>Confirmed PI allocations</span><strong>{summarize(rows, "piPaid")}</strong></article><article><span>Unallocated verified payments</span><strong>{unallocated}</strong></article></section>
    <section className="panel"><div className="table-wrap"><table><thead><tr><th>Client</th><th>Currency</th><th>PI committed</th><th>PI open</th><th>Statutory receivable</th><th>Statutory open</th></tr></thead><tbody>
      {rows.map((row) => <tr key={row.id}><td>{row.legalName}</td><td>{row.currency}</td><td>{formatCurrencyMinor(row.commitments, row.currency)}</td><td><strong>{formatCurrencyMinor(row.piOpen, row.currency)}</strong></td><td>{formatCurrencyMinor(row.receivables, row.currency)}</td><td><strong>{formatCurrencyMinor(row.taxOpen, row.currency)}</strong></td></tr>)}
      {!rows.length && <tr><td colSpan={6} className="empty">No ledger activity.</td></tr>}
    </tbody></table></div></section>
    <TallyExport documents={tallyDocuments.map((document) => ({ id: document.id, number: document.number!, type: document.type, client: document.client.legalName }))} />
  </>;
}
