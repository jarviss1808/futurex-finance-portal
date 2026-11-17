import { z } from "zod";
import { assertSameOrigin } from "@/lib/security/request";
import { currentActor } from "@/lib/security/session";
import { errorResponse } from "@/lib/http";
import { rejectPayment } from "@/lib/payments/service";

const input = z.object({ reason: z.string().trim().min(3).max(500) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await currentActor();
    if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { reason } = input.parse(await request.json());
    return Response.json(await rejectPayment(actor, (await params).id, reason));
  } catch (error) { return errorResponse(error); }
}
