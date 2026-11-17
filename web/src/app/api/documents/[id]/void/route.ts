import { z } from "zod";
import { voidProforma } from "@/lib/documents/void";
import { errorResponse } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security/request";
import { currentActor } from "@/lib/security/session";

const input = z.object({ reason: z.string().trim().min(3).max(500) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await currentActor();
    if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { reason } = input.parse(await request.json());
    return Response.json(await voidProforma(actor, (await params).id, reason));
  } catch (error) { return errorResponse(error); }
}
