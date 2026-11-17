import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import type { Actor } from "./policy";

const cookieName = process.env.SESSION_COOKIE_NAME ?? "futurex_session";
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const secureCookie = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).protocol === "https:" : process.env.NODE_ENV === "production";

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const hours = Math.min(Math.max(Number(process.env.SESSION_TTL_HOURS ?? 12), 1), 168);
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  await db.session.create({ data: { userId, tokenHash: tokenHash(token), expiresAt } });
  return { token, expiresAt };
}

export function sessionCookie(token: string, expires: Date) {
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}${secureCookie ? "; Secure" : ""}`;
}

export function expiredSessionCookie() {
  return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie ? "; Secure" : ""}`;
}

export async function deleteCurrentSession() {
  const token = (await cookies()).get(cookieName)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
}

export async function currentUser() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: { select: { id: true, organizationId: true, role: true, name: true, email: true, active: true } } } });
  if (!session || session.expiresAt <= new Date() || !session.user.active) return null;
  return session.user;
}

export async function currentActor(): Promise<Actor | null> {
  const user = await currentUser();
  return user ? { id: user.id, organizationId: user.organizationId, role: user.role } : null;
}
