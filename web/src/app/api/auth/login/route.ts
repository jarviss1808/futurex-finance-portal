import { z } from "zod";
import { db } from "@/lib/db";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "@/lib/security/password";
import { createSession, sessionCookie } from "@/lib/security/session";
import { assertSameOrigin, requestClientIp } from "@/lib/security/request";
import { loginThrottleKeys } from "@/lib/security/login-throttle";
import { normalizeLogin } from "@/lib/security/login-id";

const bodySchema = z.object({ email: z.string().trim().min(1).max(254).transform((value) => normalizeLogin(value)).pipe(z.string().email()), password: z.string().min(1).max(200) });

export async function POST(request: Request) {
  try { assertSameOrigin(request); } catch { return Response.json({ error: "Forbidden" }, { status: 403 }); }
  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw && typeof raw === "object" ? { email: raw.login ?? raw.email, password: raw.password } : null);
  if (!parsed.success) return Response.json({ error: "Invalid credentials" }, { status: 400 });
  const ip = requestClientIp(request);
  const keys = loginThrottleKeys(parsed.data.email, ip);
  const now = new Date();
  const throttles = await db.loginThrottle.findMany({ where: { key: { in: [...keys] } } });
  if (throttles.some((throttle) => throttle.lockedUntil && throttle.lockedUntil > now)) return Response.json({ error: "Try again later" }, { status: 429 });
  const user = await db.user.findFirst({ where: { email: parsed.data.email, active: true } });
  const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !valid) {
    await db.$transaction(keys.map((key) => {
      const throttle = throttles.find((row) => row.key === key);
      const windowExpired = !throttle || now.getTime() - throttle.windowStart.getTime() > 15 * 60 * 1000;
      const failures = windowExpired ? 1 : throttle.failures + 1;
      return db.loginThrottle.upsert({ where: { key }, create: { key, failures, windowStart: now, lockedUntil: failures >= 5 ? new Date(now.getTime() + 15 * 60 * 1000) : null }, update: { failures, windowStart: windowExpired ? now : throttle!.windowStart, lockedUntil: failures >= 5 ? new Date(now.getTime() + 15 * 60 * 1000) : null } });
    }));
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  }
  await db.loginThrottle.deleteMany({ where: { key: { in: [...keys] } } });
  const session = await createSession(user.id);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(session.token, session.expiresAt), "Cache-Control": "no-store" } });
}
