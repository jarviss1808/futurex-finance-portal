import { z } from "zod";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { errorResponse, HttpError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security/request";
import { currentUser } from "@/lib/security/session";
import { hashPassword, verifyPassword } from "@/lib/security/password";

const input = z.object({ current: z.string().min(1, "Enter your current password").max(200), next: z.string().min(12, "New password must be at least 12 characters").max(200) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await currentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const value = input.parse(await request.json());
    const record = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
    if (!(await verifyPassword(value.current, record.passwordHash))) throw new HttpError(400, "Current password is incorrect");
    if (value.current === value.next) throw new HttpError(400, "Choose a password different from the current one");
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(value.next) } });
    // Keep this browser signed in; sign out every other device.
    const token = (await cookies()).get(process.env.SESSION_COOKIE_NAME ?? "futurex_session")?.value;
    const keep = token ? createHash("sha256").update(token).digest("hex") : "";
    await db.session.deleteMany({ where: { userId: user.id, NOT: { tokenHash: keep } } });
    await db.auditEvent.create({ data: { organizationId: user.organizationId, actorId: user.id, action: "USER_PASSWORD_CHANGED", entityType: "User", entityId: user.id } });
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
