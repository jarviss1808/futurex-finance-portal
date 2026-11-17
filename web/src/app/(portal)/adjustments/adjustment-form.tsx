"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

type Source = { id: string; label: string; clientId: string; eventId: string };
type Tax = { id: string; name: string; taxType: string; rateBasisPoints: number };

export function AdjustmentForm({ sources }: { sources: Source[] }) {
  const router = useRouter();
  const [taxRules, setTaxRules] = useState<Tax[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/tax-rules").then((response) => response.json()).then(setTaxRules);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const source = sources.find((item) => item.id === form.get("sourceDocumentId"));
    if (!source) { setError("Select a source Tax Invoice"); setBusy(false); return; }
    const body = {
      type: form.get("type"), sourceDocumentId: source.id, clientId: source.clientId,
      eventId: source.eventId, taxRuleId: form.get("taxRuleId"), discount: "0",
      otherCharges: "0", notes: form.get("notes"),
      lines: [{ description: form.get("description"), classification: form.get("classification"), quantity: "1", unitPrice: form.get("amount") }],
    };
    const response = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (response.ok) { router.push(`/documents/${data.id}`); router.refresh(); }
    else { setError(data.error ?? "Unable to create note"); setBusy(false); }
  }

  return <form className="form stack" onSubmit={submit}>
    <div className="form-grid">
      <label>Note type<select name="type"><option>CREDIT_NOTE</option><option>DEBIT_NOTE</option></select></label>
      <label>Source Tax Invoice<select name="sourceDocumentId" required defaultValue=""><option value="" disabled>Select invoice</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}</select></label>
      <label>Approved tax rule<select name="taxRuleId" required defaultValue=""><option value="" disabled>Select rule</option>{taxRules.map((rule) => <option key={rule.id} value={rule.id}>{rule.name} · {rule.taxType} {(rule.rateBasisPoints / 100).toFixed(2)}%</option>)}</select></label>
      <label>HSN/SAC<input name="classification" defaultValue="998596" required /></label>
      <label className="wide">Reason / description<input name="description" required /></label>
      <label>Taxable adjustment (₹)<input name="amount" type="number" min="0.01" step="0.01" required /></label>
      <label className="wide">Supporting note<textarea name="notes" required /></label>
    </div>
    {error && <p className="error">{error}</p>}
    <div className="form-actions"><button disabled={busy || !sources.length || !taxRules.length}>{busy ? "Creating…" : "Create adjustment draft"}</button></div>
  </form>;
}
