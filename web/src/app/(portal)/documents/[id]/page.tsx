import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePortalActor } from "@/lib/security/portal";
import { findVisibleDocument } from "@/lib/documents/repository";
import { IssueControl } from "./issue-control";
import { EmailControl } from "./email-control";
import { clientDocumentRecipients } from "@/lib/email/recipients";
import { VoidControl } from "./void-control";
import { ReminderButton } from "./reminder-button";
import { findActiveSeries, previewNumber } from "@/lib/documents/series";
import { listVisiblePayments, paymentHistory } from "@/lib/payments/repository";
import { toPaymentView } from "@/lib/payments/view";
import { piBalance, PAYMENT_STATE_LABEL } from "@/lib/reports/balances";
import { formatIstDate } from "@/lib/reports/period";
import { PaymentCard } from "../../payments/payment-ui";
import { amountInWords, documentMoney } from "@/lib/finance/amount-words";
type Snapshot = { client?: { legalName?: string; billingAddress?: string; gstin?: string | null }; purpose?: "SPACE" | "ADDITIONAL_ITEMS"; stallNumber?: string; event?: { name: string; edition?: string | null; startsOn?: string; endsOn?: string; venue: string; city: string; stateRegion?: string | null; countryCode: string }; lines?: Array<{ description: string; classification: string; unit?: string; quantity: string; unitPricePaise: string; amountPaise: string }>; taxLabel?: string; taxBreakdown?: Array<{ label: string; ratePercent: string; amountPaise: string }>; notes?: string };
export default function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<section className="panel"><p>Loading invoice details...</p></section>}>
      <DocumentContent params={params} />
    </Suspense>
  );
}

async function DocumentContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePortalActor();
  const document = await findVisibleDocument(actor, id);
  if (!document) notFound();
  const snapshot = (document.correctedSnapshot ?? document.snapshot ?? {}) as Snapshot;
  // Issued/corrected documents display the same client identity as the export snapshot.
  // Drafts continue to display their live client record.
  const billToName = document.status === "DRAFT"
    ? document.client.legalName
    : snapshot.client?.legalName?.trim() || document.client.legalName;
  const billToAddress = document.status === "DRAFT"
    ? document.client.billingAddress
    : snapshot.client?.billingAddress ?? document.client.billingAddress;
  const billToGstin = document.status === "DRAFT"
    ? document.client.gstin
    : snapshot.client?.gstin ?? document.client.gstin;
  const money = (value: bigint | string) => documentMoney(BigInt(value), document.currency);
  const eventDate = (value: Date | string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: typeof value === "string" ? "UTC" : document.event?.timezone ?? "Asia/Kolkata" }).format(typeof value === "string" ? new Date(`${value}T00:00:00.000Z`) : value);
  const effectiveEvent = snapshot.event ?? (document.event ? { name: document.event.name, edition: document.event.edition, startsOn: document.event.startsOn.toISOString().slice(0, 10), endsOn: document.event.endsOn.toISOString().slice(0, 10), venue: document.event.venue, city: document.event.city, stateRegion: document.event.stateRegion, countryCode: document.event.countryCode } : undefined);
  const payable = document.status === "ISSUED" && ["PROFORMA", "TAX_INVOICE"].includes(document.type);
  const [series, profile, payments, cancellation] = await Promise.all([
    document.status === "DRAFT" ? findActiveSeries(db, actor.organizationId, document.type) : null,
    db.companyProfile.findUnique({ where: { organizationId: actor.organizationId } }),
    ["ISSUED", "VOIDED"].includes(document.status) ? listVisiblePayments(actor, { documentId: document.id }) : [],
    document.status === "VOIDED" ? db.auditEvent.findFirst({ where: { organizationId: actor.organizationId, entityType: "FinancialDocument", entityId: document.id, action: "PROFORMA_VOIDED" }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" } }) : null,
  ]);
  const bank = profile?.bankDetails as { bankName?: string; accountNumber?: string; branch?: string; ifsc?: string; swift?: string } | null;
  const recipients = (() => { try { return clientDocumentRecipients(document.client.contactEmail, document.client.additionalEmails); } catch { return []; } })();
  const latestDelivery = document.status === "ISSUED" ? await db.documentEmailDelivery.findFirst({ where: { documentId: document.id, kind: "DOCUMENT" }, orderBy: { createdAt: "desc" }, select: { status: true, createdAt: true, sentAt: true, recipients: true } }) : null;
  const lastReminder = payable ? await db.documentEmailDelivery.findFirst({ where: { documentId: document.id, kind: "PAYMENT_REMINDER", status: { in: ["SENT", "PREVIEWED"] } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }) : null;
  const balance = piBalance(document.netReceivablePaise, document.status, payments.flatMap((payment) => payment.allocations.filter((item) => item.documentId === document.id).map((item) => ({ amountPaise: item.amountPaise, status: payment.status }))));
  const history = await paymentHistory(actor.organizationId, payments.map((payment) => payment.id));
  return <>
    <header className="page-head"><div><p className="eyebrow">{document.type.replaceAll("_", " ")}{document.status === "VOIDED" ? " · CANCELLED" : ""}</p><h1>{document.number ?? "Draft preview"}</h1><p>{billToName} · {effectiveEvent?.name ?? "Exhibition"} · created by {document.owner.name}</p></div><div className="head-actions">{payable && <Link className="button" href={`/payments?pi=${document.id}`}>Record payment</Link>}<Link className="button secondary" href="/documents">All PIs</Link></div></header>
    {document.correctionVersion === 1 && <div className="notice warning">This is the effective one-time corrected PI snapshot. The original remains preserved for audit.{document.correctionReason ? ` Reason: ${document.correctionReason}` : ""}</div>}
    {document.status === "VOIDED" && <div className="notice danger">This PI was cancelled{cancellation ? ` by ${cancellation.actor.name} on ${formatIstDate(cancellation.createdAt)}` : ""}{cancellation && typeof (cancellation.metadata as { reason?: unknown } | null)?.reason === "string" ? ` — reason: ${(cancellation.metadata as { reason: string }).reason}` : ""}. Its number stays reserved and is never reused.</div>}
    {document.status === "DRAFT" && <IssueControl id={document.id} type={document.type} nextNumber={series ? previewNumber(series) : null} />}
    {payable && <section className="pi-balance">
      <div><small>Gross PI value</small><strong>{money(document.totalPaise)}</strong></div>
      {document.tdsPaise !== 0n && <div><small>Manual TDS</small><strong>{money(document.tdsPaise)}</strong></div>}
      <div><small>Approved received</small><strong className="good">{money(balance.approved)}</strong></div>
      <div><small>Awaiting approval</small><strong>{money(balance.pending)}</strong></div>
      <div><small>Outstanding</small><strong className="accent">{money(balance.outstanding)}</strong></div>
      <div><small>Status</small><span className={`badge state-${balance.state.toLowerCase()}`}>{PAYMENT_STATE_LABEL[balance.state]}</span></div>
      {balance.outstanding > 0n && <ReminderButton id={document.id} disabled={!recipients.length} lastReminded={lastReminder ? formatIstDate(lastReminder.createdAt) : null} />}
    </section>}
    <section className="document-sheet">
      <div className="doc-title"><div><Image className="doc-logo" src="/branding/futurex-logo.png" width={3359} height={751} priority alt="Futurex — Let's build the future together" /><strong className="company-legal">{profile?.legalName ?? "Futurex Trade Fair and Events Private Limited"}</strong><p>{profile?.gstin && `GSTIN ${profile.gstin}`} {profile?.pan && `· PAN ${profile.pan}`} {profile?.cin && `· CIN ${profile.cin}`}</p></div><div><h2>{document.type.replaceAll("_", " ")}</h2><p>{document.number ?? "DRAFT — NOT OFFICIAL"}</p></div></div>
      {profile && <div className="company-addresses"><p><strong>GST registered office</strong>{profile.gstRegisteredAddress}</p><p><strong>Registered office</strong>{profile.registeredAddress}</p><p><strong>Corporate office</strong>{profile.corporateAddress}</p></div>}
      <div className="doc-party"><div><small>BILL TO</small><strong>{billToName}</strong><p>{billToAddress}</p><p>{billToGstin && `GSTIN ${billToGstin}`}</p></div><div><small>EXHIBITION</small><strong>{effectiveEvent?.name}{effectiveEvent?.edition ? ` — ${effectiveEvent.edition}` : ""}</strong>{effectiveEvent && <><p>{effectiveEvent.startsOn && effectiveEvent.endsOn ? `${eventDate(effectiveEvent.startsOn)} – ${eventDate(effectiveEvent.endsOn)}` : ""}</p><p>{effectiveEvent.venue}, {effectiveEvent.city}{effectiveEvent.stateRegion ? `, ${effectiveEvent.stateRegion}` : ""}, {effectiveEvent.countryCode}</p><p>Stall No: {snapshot.stallNumber ?? document.stallNumber ?? ""}</p></>}</div></div>
      <table><thead><tr><th>Description</th><th>HSN/SAC</th><th>Qty.</th><th>Unit</th><th>Rate ({document.currency})</th><th>Amount ({document.currency})</th></tr></thead><tbody>{snapshot.lines?.map((line, index) => <tr key={index}><td>{line.description}</td><td>{line.classification}</td><td>{line.quantity}</td><td>{line.unit ?? "NOS"}</td><td>{money(line.unitPricePaise)}</td><td>{money(line.amountPaise)}</td></tr>)}</tbody></table>
      <div className="doc-totals"><p><span>Taxable value</span><strong>{money(document.taxablePaise)}</strong></p>{snapshot.taxBreakdown?.length ? snapshot.taxBreakdown.map((tax) => <p key={tax.label}><span>{tax.label}</span><strong>{money(tax.amountPaise)}</strong></p>) : <p><span>{snapshot.taxLabel ?? "Tax"}</span><strong>{money(document.taxPaise)}</strong></p>}<p><span>Gross PI value</span><strong>{money(document.totalPaise)}</strong></p>{document.tdsPaise !== 0n && <p><span>Manual TDS amount</span><strong>{money(document.tdsPaise)}</strong></p>}<p className="grand"><span>Net receivable</span><strong>{money(document.netReceivablePaise)}</strong></p></div>
      <div className="doc-notes"><small>AMOUNT IN WORDS</small><p>{amountInWords(document.totalPaise, document.currency)}</p></div>
      {snapshot.notes && <div className="doc-notes"><small>NOTES</small><p>{snapshot.notes}</p></div>}
      {bank?.accountNumber && <div className="doc-bank"><small>BANK DETAILS</small><p><strong>Account holder: {profile?.legalName ?? "Futurex Trade Fair and Events Private Limited"}</strong></p><p><strong>{bank.bankName}</strong> · A/C {bank.accountNumber} · {bank.branch}</p><p>IFSC {bank.ifsc} · SWIFT {bank.swift}</p></div>}
    </section>
    {document.status === "ISSUED" && <section className="download-bar"><strong>Official snapshot downloads</strong><div><a className="button" href={`/api/documents/${document.id}/download?format=pdf`}>PDF</a><a className="button secondary" href={`/api/documents/${document.id}/download?format=docx`}>DOCX</a><a className="button secondary" href={`/api/documents/${document.id}/download?format=xlsx`}>XLSX</a></div></section>}
    {document.status === "ISSUED" && document.type === "PROFORMA" && document.correctionVersion === 0 && (actor.role === "ADMIN" || document.ownerId === actor.id) && <section className="panel narrow"><h2>One-time correction</h2><p>Creates a separate corrected snapshot. The original stays immutable and a second correction is blocked.</p><Link className="button secondary" href={`/documents/${document.id}/correct`}>Correct this PI once</Link></section>}
    {document.correctionVersion === 1 && actor.role === "ADMIN" && <section className="panel narrow"><h2>Audit history</h2><a className="button secondary" href={`/api/documents/${document.id}/download?format=pdf&version=original`}>Download original PDF</a></section>}
    {document.status === "ISSUED" && <EmailControl id={document.id} recipients={recipients} latest={latestDelivery ? { ...latestDelivery, createdAt: latestDelivery.createdAt.toISOString(), sentAt: latestDelivery.sentAt?.toISOString() ?? null } : null} />}
    {payments.length > 0 && <section className="panel narrow"><div className="panel-head"><h2>Payments against this PI</h2><span className="muted-text">{payments.length}</span></div><div className="entry-list">{payments.map((payment) => <PaymentCard key={payment.id} payment={toPaymentView(actor, payment, history.get(payment.id))} />)}</div></section>}
    {document.type === "PROFORMA" && ["DRAFT", "ISSUED"].includes(document.status) && (actor.role === "ADMIN" || document.ownerId === actor.id) && <VoidControl id={document.id} label={document.number ?? "draft PI"} />}
  </>;
}
