import { requirePortalIdentity } from "@/lib/security/portal";
import { displayLogin } from "@/lib/security/login-id";
import { PasswordForm } from "./password-form";

export default async function AccountPage() {
  const { user } = await requirePortalIdentity();
  return <>
    <header className="page-head"><div><p className="eyebrow">MY ACCOUNT</p><h1>{user.name}</h1><p>Login ID <b>{displayLogin(user.email)}</b> · {user.role === "ADMIN" ? "Admin — full company access" : "Employee — your own clients, PIs, payments and reports"}</p></div></header>
    <section className="panel narrow"><h2>Change password</h2><p className="muted-text">Use at least 12 characters. Changing it signs you out on every other device.</p><PasswordForm /></section>
  </>;
}
