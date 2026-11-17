"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";

export type ReminderRow = {
  id: string; number: string; client: string; contact: string; recipients: string[]; event: string; owner: string; issued: string;
  total: string; approved: string; pending: string; outstanding: string; pendingCoversBalance: boolean;
  lastReminded: string; reminderCount: number; recentlyReminded: boolean;
};
type Outcome = { id: string; number: string; client: string; status: string; reason?: string };
type Result = { sent: number; previewed: number; skipped: number; failed: number; outcomes: Outcome[] };

const sendable = (row: ReminderRow) => row.recipients.length > 0;
const suggested = (row: ReminderRow) => sendable(row) && !row.recentlyReminded && !row.pendingCoversBalance;

export function ReminderList({ rows, showOwner }: { rows: ReminderRow[]; showOwner: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState("");
  const [attachPdf, setAttachPdf] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const selectedRows = useMemo(() => rows.filter((row) => selected.has(row.id)), [rows, selected]);
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  async function send(ids: string[]) {
    if (!ids.length) return;
    const recent = rows.filter((row) => ids.includes(row.id) && row.recentlyReminded);
    const single = ids.length === 1 ? rows.find((row) => row.id === ids[0]) : undefined;
    const force = Boolean(single?.recentlyReminded);
    const question = single
      ? force ? `${single.client} was already reminded on ${single.lastReminded}. Send another reminder for ${single.number} anyway?` : `Send a payment reminder to ${single.client} for ${single.number} (balance ${single.outstanding})?`
      : `Send a personalised payment reminder for ${ids.length} PIs?${recent.length ? `\n\n${recent.length} of them were already reminded in the last 20 hours and will be skipped.` : ""}`;
    if (!window.confirm(question)) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await api<Result>("/api/reminders", { documentIds: ids, message: message.trim() || undefined, attachPdf, force });
      setResult(response);
      setSelected(new Set());
      router.refresh();
    } catch (caught) { setError((caught as Error).message); }
    setBusy(false);
  }

  if (!rows.length) return <p className="empty">No PI with a balance due matches these filters. 🎉</p>;
  return <div className="stack">
    <div className="reminder-compose">
      <label className="wide">Personal note <small>(optional — added to every selected email)</small><textarea rows={2} maxLength={1000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="e.g. Kindly clear the balance before 30 November so that we can confirm your stall location." /></label>
      <div className="reminder-actions">
        <label className="check-inline"><input type="checkbox" checked={attachPdf} onChange={(event) => setAttachPdf(event.target.checked)} /> Attach PI PDF</label>
        <button type="button" className="button small ghost" onClick={() => setSelected(new Set(rows.filter(suggested).map((row) => row.id)))}>Select all due ({rows.filter(suggested).length})</button>
        <button type="button" className="button small ghost" onClick={() => setSelected(new Set())}>Clear</button>
        <button type="button" className="button" disabled={busy || !selectedRows.length} onClick={() => send(selectedRows.map((row) => row.id))}>{busy ? "Sending…" : `Send to ${selectedRows.length} selected`}</button>
      </div>
      <small className="muted-text">Already-reminded (last 20 h), fully-paid and no-email PIs are skipped automatically. Clients never see each other&apos;s addresses.</small>
    </div>
    {error && <p className="error">{error}</p>}
    {result && <div className="notice success-box"><strong>{result.sent} sent{result.previewed ? `, ${result.previewed} logged in test mode` : ""}, {result.skipped} skipped, {result.failed} failed.</strong>{result.outcomes.some((item) => item.status !== "SENT") && <ul>{result.outcomes.filter((item) => item.status !== "SENT").map((item) => <li key={item.id}>{item.number} · {item.client}: {item.status === "PREVIEWED" ? "logged (test mode)" : item.reason}</li>)}</ul>}</div>}
    <div className="table-wrap"><table className="select-table">
      <thead><tr><th><input type="checkbox" aria-label="Select all" checked={selectedRows.length > 0 && selectedRows.length === rows.filter(sendable).length} onChange={(event) => setSelected(event.target.checked ? new Set(rows.filter(sendable).map((row) => row.id)) : new Set())} /></th><th>PI</th><th>Client & email</th><th>Exhibition</th>{showOwner && <th>Employee</th>}<th className="num">PI value</th><th className="num">Received</th><th className="num">Balance due</th><th>Last reminder</th><th></th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id} className={selected.has(row.id) ? "selected" : undefined}>
        <td><input type="checkbox" aria-label={`Select ${row.number}`} disabled={!sendable(row)} checked={selected.has(row.id)} onChange={() => toggle(row.id)} /></td>
        <td><Link href={`/documents/${row.id}`}>{row.number}</Link><small className="block">{row.issued}</small></td>
        <td><strong>{row.client}</strong><small className="block">{row.recipients.length ? row.recipients.join(", ") : <span className="error">No email — add on Clients page</span>}</small></td>
        <td>{row.event}</td>
        {showOwner && <td>{row.owner}</td>}
        <td className="num">{row.total}</td>
        <td className="num">{row.approved}{row.pending && <small className="block warn">+{row.pending} awaiting approval</small>}</td>
        <td className="num"><strong>{row.outstanding}</strong></td>
        <td>{row.lastReminded ? <>{row.lastReminded}<small className="block">{row.reminderCount} sent</small></> : <small className="muted-text">Never</small>}{row.pendingCoversBalance && <small className="block warn">Payment awaiting approval</small>}</td>
        <td><button type="button" className="button small secondary" disabled={busy || !sendable(row)} onClick={() => send([row.id])}>Send</button></td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}
