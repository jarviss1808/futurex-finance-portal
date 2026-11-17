"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, randomPassword } from "@/components/api";

type UserRow = { id: string; name: string; login: string; email: string; role: string; active: boolean; lastSignIn: string };
type EventRow = { id: string; name: string; taxRuleId: string | null; taxConfigApproved: boolean };
type SeriesRow = { id: string; documentType: string; prefix: string; suffix: string; padding: number; financialYear: string; nextNumber: string; configured: boolean; preview: string; lastIssued: string | null };
type TaxRuleRow = { id: string; name: string; taxType: string; rateBasisPoints: number; placeOfSupplyRule: string; exemptionNote: string | null; approved: boolean };
type EmailStatus = { configured: boolean; dryRun: boolean; fromEmail: string; fromName: string; replyTo: string; credits: { remain: number; total: number; nextReset: string | null } | null };

const taxTypeOptions = ["GST", "IGST", "CGST_SGST", "NO_GST", "NIL", "EXEMPT"];

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (work: () => Promise<unknown>, after?: () => void) => {
    setBusy(true); setError("");
    try { await work(); after?.(); router.refresh(); } catch (caught) { setError((caught as Error).message); }
    setBusy(false);
  };
  return { busy, error, run, setError };
}

function UserRowView({ user, self, domain }: { user: UserRow; self: boolean; domain: string }) {
  const { busy, error, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState("");
  const reset = () => {
    const password = randomPassword();
    if (!window.confirm(`Reset the password for ${user.name}? They will be signed out everywhere and must use the new password.`)) return;
    run(() => api(`/api/admin/users/${user.id}`, { password }, "PATCH"), () => setRevealed(password));
  };
  const save = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); run(() => api(`/api/admin/users/${user.id}`, { name: data.get("name"), login: data.get("login") }, "PATCH"), () => setEditing(false)); };
  return <tr className={user.active ? undefined : "muted-row"}>
    <td><strong>{user.name}</strong>{self && <small className="badge info">you</small>}<small className="block">Login ID: <b>{user.login}</b></small><small className="block">Last sign-in: {user.lastSignIn || "never"}</small>
      {editing && <form className="form inline-panel" onSubmit={save}><div className="form-grid"><label>Name<input name="name" defaultValue={user.name} required /></label><label>Login ID<input name="login" defaultValue={user.login} required /><small>Short ID becomes {user.login.includes("@") ? user.login : `${user.login}@${domain}`}</small></label></div><div className="form-actions"><button type="button" className="button small secondary" onClick={() => setEditing(false)}>Cancel</button><button className="button small" disabled={busy}>Save</button></div></form>}
      {revealed && <div className="password-reveal"><span>New password for <b>{user.name}</b> — copy it now, it is not shown again:</span><code>{revealed}</code><button type="button" className="button small secondary" onClick={() => navigator.clipboard?.writeText(`Login ID: ${user.login}\nPassword: ${revealed}`)}>Copy login details</button><button type="button" className="button small ghost" onClick={() => setRevealed("")}>Done</button></div>}
      {error && <small className="error block">{error}</small>}
    </td>
    <td><select aria-label={`Role for ${user.name}`} disabled={self || busy} value={user.role === "ADMIN" ? "ADMIN" : "EMPLOYEE"} onChange={(event) => run(() => api(`/api/admin/users/${user.id}`, { role: event.target.value }, "PATCH"))}><option value="EMPLOYEE">Employee</option><option value="ADMIN">Admin</option></select></td>
    <td><span className={`badge ${user.active ? "verified" : "rejected"}`}>{user.active ? "ACTIVE" : "DISABLED"}</span></td>
    <td><div className="inline-actions">
      <button className="button small secondary" disabled={busy} onClick={() => setEditing(!editing)}>Edit</button>
      <button className="button small secondary" disabled={busy} onClick={reset}>Reset password</button>
      {!self && <button className="button small ghost" disabled={busy} onClick={() => run(() => api(`/api/admin/users/${user.id}`, { active: !user.active }, "PATCH"))}>{user.active ? "Disable" : "Enable"}</button>}
    </div></td>
  </tr>;
}

function TeamSection({ users, currentUserId, domain }: { users: UserRow[]; currentUserId: string; domain: string }) {
  const { busy, error, run } = useAction();
  const [password, setPassword] = useState("");
  const [created, setCreated] = useState("");
  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const details = `Login ID: ${data.get("login")}\nPassword: ${data.get("password")}`;
    run(() => api("/api/admin/users", { name: data.get("name"), login: data.get("login"), password: data.get("password"), role: data.get("role") }), () => { setCreated(details); form.reset(); setPassword(""); });
  };
  const admins = users.filter((user) => user.role === "ADMIN" && user.active).length;
  const employees = users.filter((user) => user.role !== "ADMIN" && user.active).length;
  return <section className="panel span-2" id="team">
    <div className="panel-head"><h2>Team & access</h2><span className="muted-text">{admins} admins · {employees} employees active</span></div>
    <p className="muted-text">Admin sees and manages everything. An Employee sees only their own clients, PIs, payments and reports. Staff sign in with a short login ID (e.g. <b>jagriti</b>) — there is no public sign-up.</p>
    <div className="table-wrap"><table><thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>{users.map((user) => <UserRowView key={user.id} user={user} self={user.id === currentUserId} domain={domain} />)}</tbody></table></div>
    <details className="config-editor"><summary><span><strong>Add a team member</strong><small>Create a login for a new employee or admin</small></span><span>+</span></summary>
      <form className="form form-grid" onSubmit={create}>
        <label>Full name<input name="name" required placeholder="e.g. Priya Sharma" /></label>
        <label>Login ID<input name="login" required placeholder="e.g. priya" autoCapitalize="none" /></label>
        <label>Temporary password<span className="input-with-button"><input name="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} required /><button type="button" className="button small secondary" onClick={() => setPassword(randomPassword())}>Generate</button></span></label>
        <label>Role<select name="role"><option value="EMPLOYEE">Employee</option><option value="ADMIN">Admin</option></select></label>
        <div className="wide form-actions">{error && <span className="error">{error}</span>}<button disabled={busy}>Create login</button></div>
      </form>
      {created && <div className="password-reveal"><span>Login created — share these details privately:</span><code>{created}</code><button type="button" className="button small secondary" onClick={() => navigator.clipboard?.writeText(created)}>Copy</button><button type="button" className="button small ghost" onClick={() => setCreated("")}>Done</button></div>}
    </details>
  </section>;
}

function SeriesEditor({ series }: { series: SeriesRow }) {
  const { busy, error, run } = useAction();
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = String(data.get("nextNumber"));
    if (!window.confirm(`Save ${series.documentType.replaceAll("_", " ")} numbering? The very next document will be numbered ${String(data.get("prefix"))}${next.padStart(Number(data.get("padding")), "0")}${String(data.get("suffix") ?? "")}.`)) return;
    run(() => api(`/api/admin/series/${series.id}`, { prefix: data.get("prefix"), suffix: data.get("suffix"), financialYear: data.get("financialYear"), padding: data.get("padding"), nextNumber: next, configured: data.get("configured") === "on" }, "PATCH"));
  };
  return <details className="config-editor" open={series.documentType === "PROFORMA" && series.configured}>
    <summary><span><strong>{series.documentType === "PROFORMA" ? "Proforma Invoice (PI)" : series.documentType.replaceAll("_", " ")} · FY {series.financialYear}</strong><small>Next number: <b>{series.preview}</b>{series.lastIssued ? ` · last issued ${series.lastIssued}` : " · none issued yet"}</small></span><span className={`badge ${series.configured ? "verified" : "pending"}`}>{series.configured ? "ACTIVE" : "OFF"}</span></summary>
    <form className="form form-grid" onSubmit={save}>
      <label>Prefix<input name="prefix" defaultValue={series.prefix} required /></label>
      <label>Next number<input name="nextNumber" type="number" min="1" defaultValue={series.nextNumber} required /></label>
      <label>Digits (zero padding)<input name="padding" type="number" min="1" max="12" defaultValue={series.padding} required /></label>
      <label>Financial year<input name="financialYear" defaultValue={series.financialYear} required /></label>
      <label>Suffix <small>(optional)</small><input name="suffix" defaultValue={series.suffix} /></label>
      <label className="check"><input type="checkbox" name="configured" defaultChecked={series.configured} /> Active (only one series per document type can be active)</label>
      <div className="wide form-actions">{error && <span className="error">{error}</span>}<button disabled={busy}>Save numbering</button></div>
    </form>
  </details>;
}

function NumberingSection({ series }: { series: SeriesRow[] }) {
  const { busy, error, run } = useAction();
  const create = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); run(() => api("/api/admin/series", { documentType: data.get("documentType"), financialYear: data.get("financialYear"), prefix: data.get("prefix"), suffix: data.get("suffix"), padding: data.get("padding"), nextNumber: data.get("nextNumber"), configured: data.get("configured") === "on" })); };
  return <section className="panel" id="numbering">
    <h2>Document numbering</h2>
    <p className="muted-text">Numbers are assigned automatically, one at a time, at the moment a PI is issued — even when many people issue together, no two PIs get the same number. A change here applies to the very next PI. Numbers already issued or cancelled can never be reused.</p>
    {series.map((item) => <SeriesEditor key={item.id} series={item} />)}
    <details className="config-editor"><summary><span><strong>Start a new series</strong><small>e.g. for a new financial year: FUT/PI/27-28/ from 001</small></span><span>+</span></summary>
      <form className="form form-grid" onSubmit={create}>
        <label>Document type<select name="documentType"><option value="PROFORMA">Proforma Invoice</option><option value="TAX_INVOICE">Tax Invoice</option><option value="RECEIPT">Receipt</option><option value="CREDIT_NOTE">Credit note</option><option value="DEBIT_NOTE">Debit note</option></select></label>
        <label>Financial year<input name="financialYear" placeholder="27-28" required /></label>
        <label>Prefix<input name="prefix" placeholder="FUT/PI/27-28/" required /></label>
        <label>Suffix <small>(optional)</small><input name="suffix" /></label>
        <label>Digits<input name="padding" type="number" min="1" max="12" defaultValue="3" required /></label>
        <label>First number<input name="nextNumber" type="number" min="1" defaultValue="1" required /></label>
        <label className="check wide"><input type="checkbox" name="configured" /> Make this the active series now (the current one switches off)</label>
        <div className="wide form-actions">{error && <span className="error">{error}</span>}<button disabled={busy}>Create series</button></div>
      </form>
    </details>
  </section>;
}

function EmailSection({ status, defaultTo }: { status: EmailStatus; defaultTo: string }) {
  const { busy, error, run } = useAction();
  const [result, setResult] = useState("");
  const send = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); setResult(""); run(async () => { const response = await api<{ status: string; subject: string; to: string }>("/api/admin/email-test", { to: data.get("to"), template: data.get("template") }); setResult(`${response.status === "SENT" ? "Sent" : "Logged (test mode)"}: “${response.subject}” → ${response.to}`); }); };
  return <section className="panel" id="email">
    <h2>Email (SendGrid)</h2>
    <dl className="kv"><div><dt>Status</dt><dd><span className={`badge ${status.configured && !status.dryRun ? "verified" : "pending"}`}>{status.dryRun ? "TEST MODE" : status.configured ? "LIVE" : "NOT CONFIGURED"}</span></dd></div><div><dt>Sender</dt><dd>{status.fromName} &lt;{status.fromEmail || "—"}&gt;</dd></div><div><dt>Replies go to</dt><dd>{status.replyTo || "—"}</dd></div>{status.credits && <div><dt>SendGrid credits left</dt><dd className={status.credits.remain <= 0 ? "error" : undefined}>{status.credits.remain.toLocaleString("en-IN")} of {status.credits.total.toLocaleString("en-IN")}</dd></div>}</dl>
    {status.credits && status.credits.remain <= 0 && <div className="notice danger">The SendGrid account has <b>no email credits</b>, so PI emails, reminders and confirmations will fail. Renew or upgrade the plan in SendGrid → Settings → Billing; sending resumes automatically — no change is needed here.</div>}
    <p className="muted-text">Used for PI emails, payment reminders and payment confirmations. The API key is stored only in the server&apos;s private <code>.env</code> file. Send yourself a sample to check the look:</p>
    <form className="form form-grid" onSubmit={send}>
      <label>Send test to<input name="to" type="email" defaultValue={defaultTo} required /></label>
      <label>Template<select name="template"><option value="reminder">Payment reminder</option><option value="document">PI email with PDF</option><option value="confirmation">Payment received confirmation</option></select></label>
      <div className="wide form-actions">{error && <span className="error">{error}</span>}{result && <span className="success">{result}</span>}<button disabled={busy || (!status.configured && !status.dryRun)}>{busy ? "Sending…" : "Send test email"}</button></div>
    </form>
  </section>;
}

function ExhibitionTaxRow({ event, rules }: { event: EventRow; rules: TaxRuleRow[] }) {
  const { busy, error, run } = useAction();
  const [taxRuleId, setTaxRuleId] = useState(event.taxRuleId ?? "");
  return <div className="config-row event-tax-row"><span><strong>{event.name}</strong><small>{event.taxConfigApproved ? "Tax treatment approved" : "PI creation blocked until configured"}</small>{error && <small className="error">{error}</small>}</span><select aria-label={`Tax rule for ${event.name}`} value={taxRuleId} onChange={(input) => setTaxRuleId(input.target.value)}><option value="">Select tax treatment</option>{rules.filter((rule) => rule.approved).map((rule) => <option value={rule.id} key={rule.id}>{rule.name} · {rule.taxType} {(rule.rateBasisPoints / 100).toFixed(2)}%</option>)}</select><button disabled={busy || !taxRuleId} className="button small secondary" onClick={() => run(() => api(`/api/admin/events/${event.id}`, { taxRuleId, taxConfigApproved: !event.taxConfigApproved }, "PATCH"))}>{event.taxConfigApproved ? "Revoke" : "Assign & approve"}</button></div>;
}

function TaxRuleEditor({ rule }: { rule: TaxRuleRow }) {
  const { busy, error, run } = useAction();
  const save = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); run(async () => { const result = await api<{ approvalsRevoked?: number }>(`/api/admin/tax-rules/${rule.id}`, { name: data.get("name"), taxType: data.get("taxType"), ratePercent: data.get("ratePercent"), placeOfSupplyRule: data.get("placeOfSupplyRule"), exemptionNote: data.get("exemptionNote"), approved: data.get("approved") === "on" }, "PATCH"); if (result.approvalsRevoked) window.alert(`${result.approvalsRevoked} exhibition approval(s) were revoked. Review and approve them again.`); }); };
  return <details className="config-editor"><summary><span><strong>{rule.name}</strong><small>{rule.taxType.replaceAll("_", " ")} · {(rule.rateBasisPoints / 100).toFixed(2)}%</small></span><span className={`badge ${rule.approved ? "verified" : "pending"}`}>{rule.approved ? "APPROVED" : "PENDING"}</span></summary><form className="form form-grid" onSubmit={save}><label>Rule name<input name="name" defaultValue={rule.name} required /></label><label>Tax type<select name="taxType" defaultValue={rule.taxType}>{taxTypeOptions.map((type) => <option key={type}>{type}</option>)}</select></label><label>Rate %<input name="ratePercent" type="number" min="0" max="100" step="0.01" defaultValue={rule.rateBasisPoints / 100} required /></label><label>Place-of-supply rule<input name="placeOfSupplyRule" defaultValue={rule.placeOfSupplyRule} required /></label><label className="wide">Evidence or management note<textarea name="exemptionNote" defaultValue={rule.exemptionNote ?? ""} /></label><label className="check"><input type="checkbox" name="approved" defaultChecked={rule.approved} /> Admin approved</label><div className="wide form-actions">{error && <span className="error">{error}</span>}<small>Saving revokes linked exhibition approvals so the changed treatment must be reviewed.</small><button disabled={busy}>Save changes</button></div></form></details>;
}

function TaxAndExhibitions({ events, taxRules }: { events: EventRow[]; taxRules: TaxRuleRow[] }) {
  const { busy, error, run } = useAction();
  const createRule = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); run(() => api("/api/admin/tax-rules", { name: data.get("name"), taxType: data.get("taxType"), ratePercent: data.get("ratePercent"), placeOfSupplyRule: data.get("placeOfSupplyRule"), exemptionNote: data.get("exemptionNote"), approved: data.get("approved") === "on" })); };
  const createEvent = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); run(() => api("/api/admin/events", Object.fromEntries(new FormData(event.currentTarget)))); };
  return <>
    <section className="panel" id="exhibitions"><h2>Exhibitions & tax</h2><p className="muted-text">Every employee can create PIs for every exhibition listed here. Assign one approved tax treatment to each exhibition; employees cannot change it.</p>
      <details className="config-editor"><summary><span><strong>Add an exhibition</strong><small>Appears for all employees immediately</small></span><span>+</span></summary><form className="form form-grid" onSubmit={createEvent}><label>Name<input name="name" required /></label><label>Edition<input name="edition" /></label><label>Start date<input name="startsOn" type="date" required /></label><label>End date<input name="endsOn" type="date" required /></label><label>Venue<input name="venue" required /></label><label>City<input name="city" required /></label><label>Country code<input name="countryCode" defaultValue="IN" maxLength={2} required /></label><div className="wide form-actions">{error && <span className="error">{error}</span>}<button disabled={busy}>Add exhibition</button></div></form></details>
      {events.map((event) => <ExhibitionTaxRow key={event.id} event={event} rules={taxRules} />)}
    </section>
    <section className="panel" id="tax"><h2>Tax treatments</h2><p className="muted-text">A changed treatment must be re-approved on every linked exhibition before PIs can be created or issued.</p>
      {taxRules.map((rule) => <TaxRuleEditor key={rule.id} rule={rule} />)}
      <details className="config-editor"><summary><span><strong>Add a tax treatment</strong><small>Verified against accountant advice</small></span><span>+</span></summary><form className="form form-grid" onSubmit={createRule}><label>Rule name<input name="name" required /></label><label>Tax type<select name="taxType">{taxTypeOptions.map((type) => <option key={type}>{type}</option>)}</select></label><label>Rate %<input name="ratePercent" type="number" min="0" max="100" step="0.01" required /></label><label>Place-of-supply rule<input name="placeOfSupplyRule" required /></label><label className="wide">Evidence or management note<textarea name="exemptionNote" /></label><label className="check"><input type="checkbox" name="approved" /> Admin verified against accountant advice</label><div className="wide form-actions"><button disabled={busy}>Create tax treatment</button></div></form></details>
    </section>
  </>;
}

export function AdminConsole({ currentUserId, users, events, series, taxRules, email, domain, testRecipient }: { currentUserId: string; users: UserRow[]; events: EventRow[]; series: SeriesRow[]; taxRules: TaxRuleRow[]; email: EmailStatus; domain: string; testRecipient: string }) {
  return <div className="admin-sections">
    <TeamSection users={users} currentUserId={currentUserId} domain={domain} />
    <NumberingSection series={series} />
    <EmailSection status={email} defaultTo={testRecipient} />
    <TaxAndExhibitions events={events} taxRules={taxRules} />
  </div>;
}
