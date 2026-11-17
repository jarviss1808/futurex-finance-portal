import { z } from "zod";
import { db } from "@/lib/db";
import { errorResponse, HttpError } from "@/lib/http";
import { requireAdmin } from "@/lib/security/admin";
import { assertSameOrigin } from "@/lib/security/request";
import { currentActor } from "@/lib/security/session";
import { hashPassword } from "@/lib/security/password";
import { normalizeLogin } from "@/lib/security/login-id";

const input = z.object({
  role: z.enum(["EMPLOYEE", "ADMIN"]).optional(),
  active: z.boolean().optional(),
  name: z.string().trim().min(2).max(150).optional(),
  login: z.string().trim().min(2).max(254).transform((value) => normalizeLogin(value)).pipe(z.string().email()).optional(),
  password: z.string().min(12, "Password must be at least 12 characters").max(200).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await currentActor();
    requireAdmin(actor);
    const { id } = await params;
    const value = input.parse(await request.json());
    if (id === actor.id && (value.role !== undefined || value.active !== undefined)) throw new HttpError(409, "You cannot change your own role or disable yourself. Ask another Admin.");
    if (value.role === "EMPLOYEE" || value.active === false) {
      const otherAdmins = await db.user.count({ where: { organizationId: actor.organizationId, role: "ADMIN", active: true, NOT: { id } } });
      if (!otherAdmins) throw new HttpError(409, "At least one active Admin must remain");
    }
    if (value.login) {
      const taken = await db.user.findFirst({ where: { email: value.login, NOT: { id } }, select: { id: true } });
      if (taken) throw new HttpError(409, "That login ID is already in use");
    }
    const data = { ...(value.role ? { role: value.role } : {}), ...(value.active !== undefined ? { active: value.active } : {}), ...(value.name ? { name: value.name } : {}), ...(value.login ? { email: value.login } : {}), ...(value.password ? { passwordHash: await hashPassword(value.password) } : {}) };
    if (!Object.keys(data).length) throw new HttpError(400, "Nothing to update");
    const updated = await db.user.updateMany({ where: { id, organizationId: actor.organizationId }, data });
    if (!updated.count) throw new HttpError(404, "User not found");
    // Access or credential changes sign the user out everywhere; a pure rename does not.
    if (value.role || value.active !== undefined || value.password || value.login) await db.session.deleteMany({ where: { userId: id } });
    await db.auditEvent.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: value.password ? "USER_PASSWORD_RESET" : "USER_ACCESS_CHANGED", entityType: "User", entityId: id, metadata: { role: value.role, active: value.active, name: value.name, login: value.login, passwordReset: Boolean(value.password) } } });
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
