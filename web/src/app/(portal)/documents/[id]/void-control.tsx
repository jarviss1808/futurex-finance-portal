"use client";
import { useState } from "react";

export function VoidControl({ id, label }: { id: string; label: string }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function cancel() {
    const reason = window.prompt(`Reason for cancelling ${label}:`); if (!reason?.trim()) return;
    setBusy(true); setError("");
    const response = await fetch(`/api/documents/${id}/void`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: reason.trim() }) });
    const data = await response.json().catch(() => ({}));
    if (response.ok) window.location.reload(); else { setError(data.error ?? "Unable to cancel PI"); setBusy(false); }
  }
  return <section className="download-bar"><div><strong>Cancel this PI</strong><p>The record and issued number remain in the audit trail and are never reused.</p>{error&&<small className="error">{error}</small>}</div><button className="button secondary" disabled={busy} onClick={cancel}>{busy?"Cancelling…":"Cancel / Void PI"}</button></section>;
}
