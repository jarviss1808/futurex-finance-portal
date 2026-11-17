import { assertSameOrigin } from "@/lib/security/request";
import { currentActor } from "@/lib/security/session";
import { errorResponse } from "@/lib/http";
import { withdrawPayment } from "@/lib/payments/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await currentActor();
    if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    return Response.json(await withdrawPayment(actor, (await params).id, body?.reason));
  } catch (error) { return errorResponse(error); }
}
