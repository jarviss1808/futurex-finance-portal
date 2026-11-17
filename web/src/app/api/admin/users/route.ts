import { z } from "zod";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { hashPassword } from "@/lib/security/password";
import { assertSameOrigin } from "@/lib/security/request";
import { currentActor } from "@/lib/security/session";
import { requireAdmin } from "@/lib/security/admin";
import { normalizeLogin } from "@/lib/security/login-id";

const input = z.object({
  name: z.string().trim().min(2).max(150),
  login: z.string().trim().min(2).max(254).transform((value) => normalizeLogin(value)).pipe(z.string().email("Use a short login ID (letters, numbers, dot) or a full email")),
  password: z.string().min(12, "Password must be at least 12 characters").max(200),
  role: z.enum(["EMPLOYEE", "ADMIN"]),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await currentActor();
    requireAdmin(actor);
    const raw = await request.json();
    const value = input.parse({ ...raw, login: raw?.login ?? raw?.email });
    if (await db.user.findUnique({ where: { email: value.login } })) return Response.json({ error: "That login ID is already in use" }, { status: 409 });
    const user = await db.user.create({ data: { organizationId: actor.organizationId, name: value.name, email: value.login, passwordHash: await hashPassword(value.password), role: value.role } });
    await db.auditEvent.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: "USER_CREATED", entityType: "User", entityId: user.id, metadata: { role: user.role, login: user.email } } });
    return Response.json({ id: user.id, name: user.name, email: user.email, role: user.role, active: user.active }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
