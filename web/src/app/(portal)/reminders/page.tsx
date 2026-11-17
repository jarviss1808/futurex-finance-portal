import { requirePortalIdentity } from "@/lib/security/portal";
import { db } from "@/lib/db";
import { formatCurrencyMinor } from "@/lib/finance/money";
import { formatIstDate } from "@/lib/reports/period";
import { loadPiRows, parseReportFilters, reportEmployees, reportEvents } from "@/lib/reports/sales";
import { formatTotals, addTotal, type CurrencyTotals } from "@/lib/reports/balances";
import { clientDocumentRecipients } from "@/lib/email/recipients";
import { emailSettings, sendgridCredits } from "@/lib/email/sendgrid";
import { reminderCooldownCutoff } from "@/lib/email/messages";
import { FilterBar } from "@/components/filter-bar";
import { ReminderList, type ReminderRow } from "./reminder-list";

type Search = Record<string, string | string[] | undefined>;

export default async function RemindersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { actor } = await requirePortalIdentity();
  const admin = actor.role === "ADMIN";
  const filters = parseReportFilters(await searchParams, actor, "all");
  const [rows, employees, events] = await Promise.all([loadPiRows(actor, filters), reportEmployees(actor), reportEvents(actor)]);
  const open = rows.filter((row) => row.outstanding > 0n);
  const last = open.length ? await db.documentEmailDelivery.groupBy({ by: ["documentId"], where: { documentId: { in: open.map((row) => row.id) }, kind: "PAYMENT_REMINDER", status: { in: ["SENT", "PREVIEWED"] } }, _max: { createdAt: true }, _count: { _all: true } }) : [];
  const lastBy = new Map(last.map((item) => [item.documentId, item]));
  const cutoff = reminderCooldownCutoff();
  const outstanding: CurrencyTotals = new Map();
  const list: ReminderRow[] = open.map((row) => {
    addTotal(outstanding, row.currency, row.outstanding);
    const recipients = (() => { try { return clientDocumentRecipients(row.client.contactEmail, row.client.additionalEmails); } catch { return []; } })();
    const reminded = lastBy.get(row.id);
    const lastAt = reminded?._max.createdAt ?? null;
    return {
      id: row.id, number: row.number, client: row.client.legalName, contact: row.client.contactName ?? "", recipients, event: row.event?.name ?? "—", owner: row.owner.name,
      issued: formatIstDate(row.issuedAt), total: formatCurrencyMinor(row.total, row.currency), approved: formatCurrencyMinor(row.approved, row.currency),
      pending: row.pending > 0n ? formatCurrencyMinor(row.pending, row.currency) : "", outstanding: formatCurrencyMinor(row.outstanding, row.currency),
      pendingCoversBalance: row.pending >= row.outstanding, lastReminded: lastAt ? formatIstDate(lastAt) : "", reminderCount: reminded?._count._all ?? 0,
      recentlyReminded: Boolean(lastAt && lastAt > cutoff),
    };
  });
  const settings = emailSettings();
  const credits = await sendgridCredits();

  return <>
    <header className="page-head"><div><p className="eyebrow">COLLECTIONS</p><h1>Payment reminders</h1><p>Send a personalised email to clients with a balance due — one client, a selection, or everyone in the list. Each email shows that client&apos;s own PI, amount received, balance and bank details, and comes from {settings.fromEmail || "the accounts mailbox"}{admin ? "" : " with you named as their contact"}.</p></div></header>
    {!settings.configured && !settings.dryRun && <div className="notice warning">Email sending is not configured yet. An Admin must add the SendGrid settings before reminders can be sent.</div>}
    {credits && credits.remain <= 0 && <div className="notice danger">Emails cannot be sent right now: the SendGrid account has no credits left. {admin ? "Renew the SendGrid plan (Settings → Billing); sending resumes automatically." : "Please inform an Admin."}</div>}
    {settings.dryRun && <div className="notice warning">Test mode: reminders are logged but not actually emailed (SENDGRID_DRY_RUN=true).</div>}
    <section className="metrics three">
      <article><span>PIs with a balance due</span><strong>{list.length}</strong></article>
      <article className="alert"><span>Total outstanding</span><strong>{formatTotals(outstanding)}</strong></article>
      <article><span>Missing client email</span><strong>{list.filter((row) => !row.recipients.length).length}</strong><small>add it on the Clients page</small></article>
    </section>
    <section className="panel">
      <FilterBar action="/reminders" filters={filters} employees={admin ? employees.map((item) => ({ id: item.id, name: item.name })) : []} events={events.map((event) => ({ id: event.id, name: event.name }))} showState dateLabel="PI date" />
      <ReminderList rows={list} showOwner={admin} />
    </section>
  </>;
}
