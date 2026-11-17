"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";
import { COUNTRIES, dialCodeForCountry } from "@/lib/clients/countries";
import { GstinVerification } from "./gstin-verification";

export function ClientForm() {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [countryCode, setCountryCode] = useState("IN");
  const [currency, setCurrency] = useState<"INR" | "USD">("INR");
  const [dialCode, setDialCode] = useState("+91");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Capture the form before awaiting: React clears event.currentTarget after the handler yields.
    const form = event.currentTarget;
    setPending(true);
    setMessage(null);
    try {
      await api("/api/clients", Object.fromEntries(new FormData(form)));
      form.reset();
      setMessage({ ok: true, text: "Client added. You can now create a PI for them." });
      router.refresh();
    } catch (error) { setMessage({ ok: false, text: (error as Error).message }); }
    setPending(false);
  }
  return <form className="form form-grid" onSubmit={submit}>
    <label>Legal company name<input name="legalName" required /></label>
    <label>Country<select name="countryCode" value={countryCode} onChange={(event) => { const code = event.target.value; setCountryCode(code); setDialCode(dialCodeForCountry(code)); setCurrency(code === "IN" ? "INR" : "USD"); }}>{COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.name} ({country.code})</option>)}</select></label>
    <label>Currency<select name="defaultCurrency" value={currency} onChange={(event) => setCurrency(event.target.value as "INR" | "USD")}><option value="INR">INR — Indian Rupee</option><option value="USD">USD — US Dollar</option></select></label>
    <GstinVerification />
    <label className="wide">Billing address<textarea name="billingAddress" required rows={3} /></label>
    <label>Primary contact<input name="contactName" required /></label>
    <label>Primary email<input name="contactEmail" type="email" required /></label>
    <label>Dialing code<select name="contactDialCode" value={dialCode} onChange={(event) => setDialCode(event.target.value)}>{COUNTRIES.map((country) => <option key={country.code} value={country.dialCode}>{country.dialCode} · {country.name}</option>)}</select></label>
    <label>Contact phone<input name="contactPhone" inputMode="tel" required /></label>
    <label className="wide">Additional email recipients <small>(optional, maximum 2; comma separated — they also get PIs and reminders)</small><input name="additionalEmails" placeholder="buyer@example.com, owner@example.com" /></label>
    <label className="wide">Private notes<textarea name="privateNotes" rows={2} /></label>
    <div className="wide form-actions">{message && <p className={message.ok ? "success" : "error"}>{message.text}</p>}<button disabled={pending}>{pending ? "Saving…" : "Add client"}</button></div>
  </form>;
}
