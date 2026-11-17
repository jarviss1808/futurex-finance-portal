import Image from "next/image";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/security/session";
import { db } from "@/lib/db";
import { LogoutButton } from "@/components/logout-button";
import { NavLink } from "@/components/nav-link";

export const instant = false;

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const admin = user.role === "ADMIN";
  const accounts = ["TAX_INVOICE_ISSUER", "ACCOUNTANT", "ADMIN"].includes(user.role);
  // Live counts replace "please check" calls: Admin sees the approval queue, employees see declined entries.
  const attention = admin
    ? await db.payment.count({ where: { organizationId: user.organizationId, status: "PENDING" } })
    : await db.payment.count({ where: { organizationId: user.organizationId, reportedById: user.id, status: "REJECTED" } });
  return <div className="portal">
    <aside className="sidebar">
      <div className="side-brand"><Image src="/branding/futurex-logo.png" width={3359} height={751} priority alt="Futurex" /><b>SALES & COLLECTIONS</b></div>
      <nav aria-label="Main">
        <NavLink href="/dashboard">Dashboard</NavLink>
        <NavLink href="/documents/new" exact>Create PI</NavLink>
        <NavLink href="/documents">PIs</NavLink>
        <NavLink href="/payments" badge={attention} badgeTitle={admin ? "Payments awaiting your approval" : "Declined entries to correct"}>{admin ? "Payments & approvals" : "Payments"}</NavLink>
        <NavLink href="/reminders">Payment reminders</NavLink>
        <NavLink href="/reports">Reports</NavLink>
        <NavLink href="/clients">Clients</NavLink>
        <NavLink href="/exhibitions">Exhibitions</NavLink>
        {accounts && <><span className="nav-group">ACCOUNTS</span><NavLink href="/tax-invoices/new">Create Tax Invoice</NavLink><NavLink href="/adjustments/new">Credit / Debit Note</NavLink><NavLink href="/reports/ledger">Ledger & Tally</NavLink></>}
        {admin && <NavLink href="/admin">Administration</NavLink>}
      </nav>
      <div className="side-user"><span>{user.name}</span><small>{admin ? "ADMIN" : "EMPLOYEE"}</small><NavLink href="/account">My account</NavLink><LogoutButton /></div>
    </aside>
    <div className="workspace">{children}</div>
  </div>;
}
