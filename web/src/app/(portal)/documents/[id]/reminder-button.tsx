"use client";
import { useState } from "react";
import { api } from "@/components/api";

type Result = { sent: number; previewed: number; outcomes: Array<{ status: string; reason?: string }> };

export function ReminderButton({ id, disabled, lastReminded }: { id: string; disabled: boolean; lastReminded: string | null }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(lastReminded ? `Last reminder: ${lastReminded}` : "");
  async function send() {
    if (!window.confirm(lastReminded ? `A reminder was last sent on ${lastReminded}. Send another one now?` : "Email a payment reminder with the balance due to this client?")) return;
    setBusy(true);
    try {
      const result = await api<Result>("/api/reminders", { documentIds: [id], attachPdf: true, force: true });
      const outcome = result.outcomes[0];
      setMessage(outcome?.status === "SENT" ? "Reminder sent just now" : outcome?.status === "PREVIEWED" ? "Logged in test mode (not emailed)" : outcome?.reason ?? "Not sent");
    } catch (error) { setMessage((error as Error).message); }
    setBusy(false);
  }
  return <div className="reminder-cell"><button className="button small secondary" disabled={busy || disabled} title={disabled ? "Add a client email first" : undefined} onClick={send}>{busy ? "Sending…" : "Send payment reminder"}</button>{message && <small>{message}</small>}</div>;
}
