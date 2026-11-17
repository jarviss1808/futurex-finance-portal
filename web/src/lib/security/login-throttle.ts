import { createHash } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export function loginThrottleKeys(email: string, ip: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return [`email:${digest(normalizedEmail)}`, `pair:${digest(`${normalizedEmail}|${ip}`)}`] as const;
}
