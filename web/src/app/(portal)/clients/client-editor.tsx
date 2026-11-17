"use client";
import { useState, type FormEvent } from "react";
import { COUNTRIES } from "@/lib/clients/countries";
import { GstinVerification } from "./gstin-verification";

type Client = { id: string; legalName: string; billingAddress: string; gstin: string | null; gstTradeName: string | null; gstRegistrationStatus: string | null; gstVerifiedAt: Date | null; gstVerifiedBy: { name: string } | null; countryCode: string; defaultCurrency: string; contactName: string | null; contactEmail: string | null; additionalEmails: string[]; contactDialCode: string | null; contactPhone: string | null; privateNotes: string | null };

export function ClientEditor({ client, owner }: { client: Client; owner?: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch(`/api/clients/${client.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(data.error ?? "Unable to update client"); setBusy(false); return; }
    setMessage("Saved"); setBusy(false); window.location.reload();
  }
  return <details className="config-editor"><summary><span><strong>{client.legalName}</strong><small>{[client.contactEmail, ...client.additionalEmails].filter(Boolean).join(", ") || "No email — add one to send PIs and reminders"}{owner ? ` · managed by ${owner}` : ""}</small></span><span>Edit</span></summary><form className="form form-grid" onSubmit={save}><label>Country<select name="countryCode" defaultValue={client.countryCode}>{COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.name} ({country.code})</option>)}</select></label><label>Currency<select name="defaultCurrency" defaultValue={client.defaultCurrency}><option value="INR">INR — Indian Rupee</option><option value="USD">USD — US Dollar</option></select></label><label>Contact name<input name="contactName" defaultValue={client.contactName ?? ""} required /></label><label>Primary email<input name="contactEmail" type="email" defaultValue={client.contactEmail ?? ""} required /></label><label>Dialing code<select name="contactDialCode" defaultValue={client.contactDialCode ?? "+91"}>{COUNTRIES.map((country) => <option key={country.code} value={country.dialCode}>{country.dialCode} · {country.name}</option>)}</select></label><label>Phone<input name="contactPhone" inputMode="tel" defaultValue={client.contactPhone ?? ""} required /></label><GstinVerification defaults={{ gstin: client.gstin, legalName: client.legalName, tradeName: client.gstTradeName, status: client.gstRegistrationStatus, address: client.billingAddress, verifiedAt: client.gstVerifiedAt?.toISOString().slice(0, 10), verifiedBy: client.gstVerifiedBy?.name }} /><label className="wide">Additional PI recipients <small>(maximum 2)</small><input name="additionalEmails" defaultValue={client.additionalEmails.join(", ")} /></label><label className="wide">Billing address<textarea name="billingAddress" rows={3} defaultValue={client.billingAddress} required /></label><label className="wide">Private notes<textarea name="privateNotes" rows={2} defaultValue={client.privateNotes ?? ""} /></label><div className="wide form-actions">{message && <small>{message}</small>}<button disabled={busy}>{busy ? "Saving…" : "Save client"}</button></div></form></details>;
}
