import { assertSameOrigin } from "@/lib/security/request";
import { currentActor } from "@/lib/security/session";
import { errorResponse } from "@/lib/http";
import { verifyPayment } from "@/lib/payments/service";
import { sendPaymentConfirmation } from "@/lib/email/messages";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await currentActor();
    if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await verifyPayment(actor, id);
    if (body?.notifyClient !== true) return Response.json(result);
    // The approval is already committed; an email problem is reported but never undoes it.
    try { return Response.json({ ...result, email: await sendPaymentConfirmation(actor, id) }); }
    catch (error) { return Response.json({ ...result, email: { status: "FAILED", error: error instanceof Error ? error.message : "Email failed" } }); }
  } catch (error) { return errorResponse(error); }
}
