"use client";
import { useState, type FormEvent } from "react";
import { api } from "@/components/api";

export function PasswordForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get("next") !== data.get("confirm")) return setMessage({ ok: false, text: "The new passwords do not match" });
    setBusy(true); setMessage(null);
    try { await api("/api/account/password", { current: data.get("current"), next: data.get("next") }); form.reset(); setMessage({ ok: true, text: "Password changed." }); }
    catch (error) { setMessage({ ok: false, text: (error as Error).message }); }
    setBusy(false);
  }
  return <form className="form stack" onSubmit={submit}>
    <label>Current password<input name="current" type="password" autoComplete="current-password" required /></label>
    <label>New password<input name="next" type="password" autoComplete="new-password" minLength={12} required /></label>
    <label>Confirm new password<input name="confirm" type="password" autoComplete="new-password" minLength={12} required /></label>
    {message && <p className={message.ok ? "success" : "error"}>{message.text}</p>}
    <div className="form-actions"><button disabled={busy}>{busy ? "Saving…" : "Change password"}</button></div>
  </form>;
}
