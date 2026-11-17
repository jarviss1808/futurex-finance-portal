"use client";
import { useState } from "react";

export function IssueControl({ id, type, nextNumber }: { id: string; type: string; nextNumber: string | null }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [eStatus, setEStatus] = useState("UNRESOLVED");
  const [evidence, setEvidence] = useState({ irn: "", ack: "", qr: "" });
  const statutory = ["TAX_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"].includes(type);
  const label = type === "PROFORMA" ? "PI" : type.replaceAll("_", " ").toLowerCase();

  if (!nextNumber) return <div className="notice warning">No active {type.replaceAll("_", " ")} number series is enabled. An Admin must enable one under Administration → Document numbering before this can be issued.</div>;

  async function issue() {
    setPending(true);
    setError("");
    const body: Record<string, string> = {};
    if (statutory) {
      body.einvoiceStatus = eStatus;
      if (eStatus === "VERIFIED") Object.assign(body, { irn: evidence.irn, acknowledgementNumber: evidence.ack, signedQrPayload: evidence.qr });
    }
    const response = await fetch(`/api/documents/${id}/issue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (response.ok) window.location.reload();
    else { setError(data.error ?? "Issuance failed"); setPending(false); }
  }

  return <div className="issue-box">
    <div><strong>Ready to issue this {label}?</strong><p>The official number is assigned automatically in sequence at the moment you issue (next available: <b>{nextNumber}</b>). The PI is then locked.</p></div>
    {statutory && <div className="stack"><select value={eStatus} onChange={(event) => setEStatus(event.target.value)}><option value="UNRESOLVED">E-invoice applicability unresolved</option><option value="NOT_APPLICABLE">Not applicable — authorized decision</option><option value="VERIFIED">Verified IRP/import evidence</option></select>{eStatus === "VERIFIED" && <div className="evidence-fields"><input placeholder="Verified IRN" value={evidence.irn} onChange={(event) => setEvidence({ ...evidence, irn: event.target.value })} /><input placeholder="Acknowledgement number" value={evidence.ack} onChange={(event) => setEvidence({ ...evidence, ack: event.target.value })} /><textarea placeholder="Signed QR payload" value={evidence.qr} onChange={(event) => setEvidence({ ...evidence, qr: event.target.value })} /></div>}</div>}
    <button disabled={pending} onClick={issue}>{pending ? "Issuing…" : `Issue official ${label}`}</button>
    {error && <p className="error">{error}</p>}
  </div>;
}
