"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";
import { PAYMENT_MODES, REFERENCE_OPTIONAL_MODES } from "@/lib/payments/modes";
import type { PaymentView } from "@/lib/payments/view";

export type PiOption = { id: string; number: string; client: string; event: string; owner: string; currency: string; total: string; approved: string; pending: string; open: string; openDecimal: string; manualTds: string; confirmedTds: string; pendingTds: string; openTds: string };

const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

function PaymentFields({ defaults, currency }: { defaults?: Partial<PaymentView>; currency: string }) {
  const [mode, setMode] = useState(defaults?.mode ?? "NEFT");
  const referenceOptional = REFERENCE_OPTIONAL_MODES.includes(mode);
  return <>
    <label>Amount received ({currency})<input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" defaultValue={defaults?.amountDecimal} required /></label>
    <label>TDS deducted ({currency}) <small>(manual; not cash received)</small><input name="tdsAmount" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={defaults?.tdsDecimal ?? "0.00"} required /></label>
    <label>Payment date<input name="paidOn" type="date" max={today()} defaultValue={defaults?.paidOn ?? today()} required /></label>
    <label>Payment mode<select name="mode" value={mode} onChange={(event) => setMode(event.target.value)}>{PAYMENT_MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    <label>{mode === "CHEQUE" ? "Cheque / DD number" : "UTR / transaction reference"}{referenceOptional && <small> (optional)</small>}<input name="reference" defaultValue={defaults?.reference} required={!referenceOptional} autoComplete="off" /></label>
    <label className="wide">Remarks for Admin <small>(optional — e.g. bank, part payment, TDS deducted)</small><textarea name="remarks" rows={2} maxLength={1000} defaultValue={defaults?.remarks} /></label>
    <label className="wide">Payment proof <small>(screenshot or PDF, max 4 MB — optional but speeds up approval)</small><input name="proof" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" /></label>
  </>;
}

export function PaymentForm({ pis, preselect, showOwner }: { pis: PiOption[]; preselect?: string; showOwner: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [documentId, setDocumentId] = useState(pis.some((pi) => pi.id === preselect) ? preselect! : "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const visible = useMemo(() => { const term = filter.trim().toLowerCase(); return term ? pis.filter((pi) => `${pi.number} ${pi.client} ${pi.event} ${pi.owner}`.toLowerCase().includes(term)) : pis; }, [filter, pis]);
  const selected = pis.find((pi) => pi.id === documentId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setMessage(null);
    try {
      await api("/api/payments", new FormData(form));
      form.reset();
      setDocumentId("");
      setMessage({ tone: "ok", text: "Payment submitted. It is now waiting for Admin approval — you will see the result in your payment list." });
      router.refresh();
    } catch (error) { setMessage({ tone: "error", text: (error as Error).message }); }
    setBusy(false);
  }

  if (!pis.length) return <p className="empty">No issued PI has an open balance right now. Payments can be recorded only against an issued PI.</p>;
  return <form className="form stack" onSubmit={submit}>
    <div className="form-grid">
      <label>Find PI<input type="search" placeholder="PI number, client or exhibition" value={filter} onChange={(event) => setFilter(event.target.value)} /></label>
      <label>PI<select name="documentId" value={documentId} onChange={(event) => setDocumentId(event.target.value)} required>
        <option value="">Select PI ({visible.length})</option>
        {visible.map((pi) => <option key={pi.id} value={pi.id}>{pi.number} — {pi.client} · open {pi.open}</option>)}
      </select></label>
    </div>
    {selected && <div className="pi-summary">
      <div><small>Client</small><strong>{selected.client}</strong></div>
      <div><small>Exhibition</small><strong>{selected.event}</strong></div>
      {showOwner && <div><small>Employee</small><strong>{selected.owner}</strong></div>}
      <div><small>PI total</small><strong>{selected.total}</strong></div>
      <div><small>PI manual TDS</small><strong>{selected.manualTds}</strong></div>
      <div><small>Confirmed / pending TDS</small><strong>{selected.confirmedTds} / {selected.pendingTds}</strong></div>
      <div><small>TDS available to record</small><strong>{selected.openTds}</strong></div>
      <div><small>Approved received</small><strong>{selected.approved}</strong></div>
      <div><small>Awaiting approval</small><strong>{selected.pending}</strong></div>
      <div><small>Can be recorded now</small><strong className="accent">{selected.open}</strong></div>
    </div>}
    <div className="form-grid"><PaymentFields key={documentId} currency={selected?.currency ?? "INR"} defaults={selected ? { amountDecimal: selected.openDecimal, tdsDecimal: "0.00" } : undefined} /></div>
    {message && <p className={message.tone === "ok" ? "success" : "error"} role="status">{message.text}</p>}
    <div className="form-actions"><button disabled={busy || !documentId}>{busy ? "Submitting…" : "Submit for approval"}</button></div>
  </form>;
}

export function PaymentCard({ payment, emphasis = false }: { payment: PaymentView; emphasis?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [panel, setPanel] = useState<"none" | "decline" | "edit" | "withdraw">("none");
  const [notifyClient, setNotifyClient] = useState(false);
  const declinedBefore = payment.history.filter((item) => item.label === "Declined").at(-1);

  async function run(work: () => Promise<unknown>, done?: string) {
    setBusy(true); setError(""); setNotice("");
    try { await work(); if (done) setNotice(done); setPanel("none"); router.refresh(); }
    catch (caught) { setError((caught as Error).message); }
    setBusy(false);
  }
  const approve = () => run(async () => {
    const result = await api<{ email?: { status: string; error?: string } }>(`/api/payments/${payment.id}/verify`, { notifyClient });
    // The approval is saved either way; an email problem must not look like a failed approval.
    if (result.email?.status === "FAILED") window.alert(`Payment approved ✔\n\nThe confirmation email to the client was NOT sent:\n${result.email.error}`);
  });
  const decline = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const reason = String(new FormData(event.currentTarget).get("reason") ?? ""); run(() => api(`/api/payments/${payment.id}/reject`, { reason })); };
  const withdraw = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const reason = String(new FormData(event.currentTarget).get("reason") ?? ""); run(() => api(`/api/payments/${payment.id}/withdraw`, { reason })); };
  const correct = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); run(() => api(`/api/payments/${payment.id}`, data, "PATCH"), payment.status === "REJECTED" ? "Resubmitted for approval." : "Changes saved."); };

  return <article className={`entry ${payment.status.toLowerCase()}${emphasis ? " emphasis" : ""}`}>
    <header>
      <div><strong className="entry-amount">{payment.amount}</strong>{payment.tdsDecimal !== "0.00" && <span className="badge info">TDS {payment.tds}</span>}<span className={`badge ${payment.status.toLowerCase()}`}>{payment.statusLabel}</span>{payment.submissionCount > 1 && <span className="badge info">Resubmitted ×{payment.submissionCount - 1}</span>}</div>
      {payment.pi && <p><Link href={`/documents/${payment.pi.id}`}>{payment.pi.number}</Link> · {payment.pi.client} · {payment.pi.event}</p>}
    </header>
    <dl className="entry-meta">
      <div><dt>Payment date</dt><dd>{payment.paidOnLabel}</dd></div>
      <div><dt>Mode</dt><dd>{payment.modeLabel}</dd></div>
      <div><dt>UTR / reference</dt><dd>{payment.reference || "—"}</dd></div>
      <div><dt>Employee</dt><dd>{payment.pi?.owner ?? payment.reporter}</dd></div>
      <div><dt>Submitted</dt><dd>{payment.submittedLabel}{payment.reporter !== payment.pi?.owner ? ` by ${payment.reporter}` : ""}</dd></div>
      {payment.reviewer && <div><dt>{payment.status === "VERIFIED" ? "Approved by" : "Reviewed by"}</dt><dd>{payment.reviewer}, {payment.reviewedLabel}</dd></div>}
    </dl>
    {payment.remarks && <p className="entry-note"><b>Remarks:</b> {payment.remarks}</p>}
    {payment.status === "REJECTED" && payment.reviewNote && <p className="entry-alert"><b>Declined by {payment.reviewer}:</b> {payment.reviewNote}</p>}
    {payment.status === "WITHDRAWN" && payment.reviewNote && <p className="entry-note"><b>Withdrawn:</b> {payment.reviewNote}</p>}
    {payment.status === "PENDING" && declinedBefore?.detail && <p className="entry-note"><b>Previously declined:</b> {declinedBefore.detail.replace(/^Reason: /, "")}</p>}
    {payment.proofs.length > 0 && <p className="entry-proofs">Proof: {payment.proofs.map((proof) => <a key={proof.id} href={`/api/payment-proofs/${proof.id}`} target="_blank" rel="noreferrer">{proof.fileName}</a>)}</p>}

    {(payment.canReview || payment.canEdit) && <div className="entry-actions">
      {payment.canReview && <>
        <label className="check-inline"><input type="checkbox" checked={notifyClient} onChange={(event) => setNotifyClient(event.target.checked)} /> Email payment confirmation to client</label>
        <button className="button small" disabled={busy} onClick={approve}>{busy ? "Working…" : "Approve — received in bank"}</button>
        <button className="button small secondary" disabled={busy} onClick={() => setPanel(panel === "decline" ? "none" : "decline")}>Decline</button>
      </>}
      {payment.canEdit && <>
        <button className={`button small ${payment.status === "REJECTED" ? "" : "secondary"}`} disabled={busy} onClick={() => setPanel(panel === "edit" ? "none" : "edit")}>{payment.status === "REJECTED" ? "Correct & resubmit" : "Edit details"}</button>
        <button className="button small ghost" disabled={busy} onClick={() => setPanel(panel === "withdraw" ? "none" : "withdraw")}>Withdraw</button>
      </>}
    </div>}

    {panel === "decline" && <form className="form inline-panel" onSubmit={decline}><label>Reason (the employee will see this)<textarea name="reason" rows={2} minLength={3} maxLength={500} required placeholder="e.g. Amount not credited in Axis Bank as of today / UTR does not match" autoFocus /></label><div className="form-actions"><button type="button" className="button small secondary" onClick={() => setPanel("none")}>Cancel</button><button className="button small danger" disabled={busy}>Decline entry</button></div></form>}
    {panel === "withdraw" && <form className="form inline-panel" onSubmit={withdraw}><label>Why are you withdrawing this entry?<input name="reason" minLength={3} maxLength={500} required placeholder="e.g. Recorded against the wrong PI / duplicate entry" autoFocus /></label><div className="form-actions"><button type="button" className="button small secondary" onClick={() => setPanel("none")}>Cancel</button><button className="button small danger" disabled={busy}>Withdraw entry</button></div></form>}
    {panel === "edit" && <form className="form inline-panel" onSubmit={correct}><div className="form-grid"><PaymentFields currency={payment.currency} defaults={payment} /></div><div className="form-actions"><button type="button" className="button small secondary" onClick={() => setPanel("none")}>Cancel</button><button className="button small" disabled={busy}>{payment.status === "REJECTED" ? "Resubmit for approval" : "Save changes"}</button></div></form>}

    {error && <p className="error">{error}</p>}
    {notice && <p className="success">{notice}</p>}
    {payment.history.length > 0 && <details className="entry-history"><summary>History ({payment.history.length})</summary><ol>{payment.history.map((item, index) => <li key={index}><b>{item.label}</b> — {item.actor}, {item.at}{item.detail && <span>{item.detail}</span>}</li>)}</ol></details>}
  </article>;
}
