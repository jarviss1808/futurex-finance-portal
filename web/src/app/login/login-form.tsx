"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: form.get("login"), password: form.get("password") }) });
    if (response.ok) { router.push("/dashboard"); router.refresh(); return; }
    const body = await response.json().catch(() => ({}));
    setError(response.status === 429 ? "Too many attempts. Please wait 15 minutes and try again." : body.error === "Invalid credentials" ? "Login ID or password is incorrect." : body.error ?? "Sign in failed");
    setPending(false);
  }
  return <form className="stack form" onSubmit={submit}>
    <label>Login ID or email<input name="login" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="e.g. jagriti" required /></label>
    <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
    {error && <p className="error" role="alert">{error}</p>}
    <button disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
  </form>;
}
