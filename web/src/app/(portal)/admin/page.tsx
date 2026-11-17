import { redirect } from "next/navigation";
import { currentActor } from "@/lib/security/portal";
import { db } from "@/lib/db";
import { displayLogin, loginDomain } from "@/lib/security/login-id";
import { emailSettings, sendgridCredits } from "@/lib/email/sendgrid";
import { highestUsedSerial } from "@/lib/documents/numbering";
import { previewNumber } from "@/lib/documents/series";
import { formatIstDate } from "@/lib/reports/period";
import { AdminConsole } from "./admin-console";

export default async function AdminPage() {
  const actor = (await currentActor())!;
  if (actor.role !== "ADMIN") redirect("/dashboard");
  const [users, sessions, events, series, taxRules, issued] = await Promise.all([
    db.user.findMany({ where: { organizationId: actor.organizationId }, select: { id: true, name: true, email: true, role: true, active: true }, orderBy: [{ active: "desc" }, { role: "desc" }, { name: "asc" }] }),
    db.session.groupBy({ by: ["userId"], _max: { createdAt: true } }),
    db.event.findMany({ where: { organizationId: actor.organizationId }, select: { id: true, name: true, taxRuleId: true, taxConfigApproved: true }, orderBy: { startsOn: "asc" } }),
    db.documentSeries.findMany({ where: { organizationId: actor.organizationId }, orderBy: [{ configured: "desc" }, { createdAt: "desc" }] }),
    db.taxRule.findMany({ where: { organizationId: actor.organizationId }, select: { id: true, name: true, taxType: true, rateBasisPoints: true, placeOfSupplyRule: true, exemptionNote: true, approved: true }, orderBy: { name: "asc" } }),
    db.financialDocument.findMany({ where: { organizationId: actor.organizationId, number: { not: null } }, select: { type: true, number: true } }),
  ]);
  const lastSignIn = new Map(sessions.map((row) => [row.userId, row._max.createdAt]));
  const domain = loginDomain();
  const email = emailSettings();
  return <>
    <header className="page-head"><div><p className="eyebrow">ADMINISTRATION</p><h1>Settings & team</h1><p>Manage logins, PI numbering, email sending, exhibitions and tax treatments.</p></div></header>
    <AdminConsole
      currentUserId={actor.id}
      domain={domain}
      users={users.map((user) => { const at = lastSignIn.get(user.id); return { ...user, login: displayLogin(user.email, domain), lastSignIn: at ? formatIstDate(at) : "" }; })}
      events={events}
      series={series.map((item) => { const last = highestUsedSerial(issued.filter((row) => row.type === item.documentType).map((row) => row.number), item); return { id: item.id, documentType: item.documentType, prefix: item.prefix, suffix: item.suffix, padding: item.padding, financialYear: item.financialYear, nextNumber: item.nextNumber.toString(), configured: item.configured, preview: previewNumber(item), lastIssued: last === null ? null : `${item.prefix}${last.toString().padStart(item.padding, "0")}${item.suffix}` }; })}
      taxRules={taxRules}
      email={{ configured: email.configured, dryRun: email.dryRun, fromEmail: email.fromEmail, fromName: email.fromName, replyTo: email.replyTo, credits: await sendgridCredits() }}
      testRecipient={process.env.EMAIL_TEST_RECIPIENT?.trim() || email.fromEmail}
    />
  </>;
}
