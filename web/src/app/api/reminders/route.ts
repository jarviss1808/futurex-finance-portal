import { assertSameOrigin } from "@/lib/security/request";
import { currentActor } from "@/lib/security/session";
import { errorResponse } from "@/lib/http";
import { sendPaymentReminders } from "@/lib/email/messages";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await currentActor();
    if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json(await sendPaymentReminders(actor, await request.json()));
  } catch (error) { return errorResponse(error); }
}
