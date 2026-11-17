import { deleteCurrentSession, expiredSessionCookie } from "@/lib/security/session";
import { assertSameOrigin } from "@/lib/security/request";

export async function POST(request: Request) {
  try { assertSameOrigin(request); } catch { return Response.json({ error: "Forbidden" }, { status: 403 }); }
  await deleteCurrentSession();
  return Response.json({ ok: true }, { headers: { "Set-Cookie": expiredSessionCookie(), "Cache-Control": "no-store" } });
}
