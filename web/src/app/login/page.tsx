import Image from "next/image";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/security/session";
import { LoginForm } from "./login-form";

export const instant = false;

export default async function LoginPage() {
  if (await currentUser()) redirect("/dashboard");
  return <main className="auth-shell">
    <section className="auth-brand">
      <Image className="auth-logo" src="/branding/futurex-logo.png" width={3359} height={751} priority alt="Futurex — Let's build the future together" />
      <p>SALES & COLLECTIONS PORTAL</p>
      <h1>Every PI, payment and balance in one place.</h1>
      <p className="muted-light">Create PIs for any exhibition, record client payments, get Admin approval and see outstanding balances update instantly — without follow-up calls or WhatsApp messages.</p>
    </section>
    <section className="auth-panel"><div>
      <Image className="auth-mobile-logo" src="/branding/futurex-logo.png" width={3359} height={751} alt="Futurex" />
      <p className="eyebrow">SECURE SIGN IN</p>
      <h2>Welcome back</h2>
      <p className="muted">Sign in with the login ID and password given by your Admin.</p>
      <LoginForm />
      <p className="auth-help">Forgot your password? Ask any Admin to reset it from Administration → Team.</p>
    </div></section>
  </main>;
}
