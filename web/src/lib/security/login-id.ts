/** Staff may sign in with a short login ID ("shiv") or a full email; IDs map to `<id>@<domain>`. */
export const DEFAULT_LOGIN_DOMAIN = "futurex.local";

export function loginDomain() {
  return (process.env.LOGIN_ID_DOMAIN?.trim().toLowerCase() || DEFAULT_LOGIN_DOMAIN).replace(/^@/, "");
}

export function normalizeLogin(value: string, domain = loginDomain()) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.includes("@") ? trimmed : `${trimmed}@${domain}`;
}

/** Short ID shown in the UI when the address uses the login domain. */
export function displayLogin(email: string, domain = loginDomain()) {
  return email.endsWith(`@${domain}`) ? email.slice(0, -(domain.length + 1)) : email;
}
