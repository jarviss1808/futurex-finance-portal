"use client";

import { useState } from "react";

type Delivery = { status: string; createdAt: string; sentAt: string | null; recipients: string[] };

export function EmailControl({ id, recipients, latest }: { id: string; recipients: string[]; latest: Delivery | null }) {
  const [message, setMessage] = useState(latest ? `${latest.status}: ${latest.recipients.join(", ")}` : "");
  const [busy, setBusy] = useState(false);
  const alreadySent = latest?.status === "SENT";
  async function send() {
    if (alreadySent && !window.confirm("This PI was already emailed. Send it again to the listed recipients?")) return;
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/documents/${id}/email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resend: alreadySent }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(data.error ?? "Unable to send email"); setBusy(false); return; }
    setMessage(`${data.status}: ${data.recipients.join(", ")}`);
    setBusy(false);
  }
  return <section className="download-bar"><div><strong>Email official PI</strong><p>{recipients.length ? `To: ${recipients.join(", ")}` : "Add a client email before sending."}</p>{message && <small>{message}</small>}</div><button className="button" disabled={busy || !recipients.length} onClick={send}>{busy ? "Sending…" : alreadySent ? "Resend PDF" : "Send PDF by email"}</button></section>;
}
