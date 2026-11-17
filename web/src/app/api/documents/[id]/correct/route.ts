import { currentActor } from "@/lib/security/session";
import { assertSameOrigin } from "@/lib/security/request";
import { errorResponse } from "@/lib/http";
import { correctProforma } from "@/lib/documents/correction";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await currentActor();
    if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json(await correctProforma(actor, (await params).id, await request.json()));
  } catch (error) { return errorResponse(error); }
}
