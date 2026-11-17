import { assertSameOrigin } from "@/lib/security/request";
import { currentActor } from "@/lib/security/session";
import { requireAdmin } from "@/lib/security/admin";
import { errorResponse } from "@/lib/http";
import { sendTestEmail } from "@/lib/email/messages";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await currentActor();
    requireAdmin(actor);
    return Response.json(await sendTestEmail(actor, await request.json()));
  } catch (error) { return errorResponse(error); }
}
