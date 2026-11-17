import { errorResponse } from "@/lib/http";
import { saveSeries } from "@/lib/documents/series";
import { requireAdmin } from "@/lib/security/admin";
import { assertSameOrigin } from "@/lib/security/request";
import { currentActor } from "@/lib/security/session";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await currentActor();
    requireAdmin(actor);
    return Response.json(await saveSeries(actor, await request.json(), (await params).id));
  } catch (error) { return errorResponse(error); }
}
