import { errorResponse } from "@/lib/http";
import { saveSeries } from "@/lib/documents/series";
import { requireAdmin } from "@/lib/security/admin";
import { assertSameOrigin } from "@/lib/security/request";
import { currentActor } from "@/lib/security/session";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await currentActor();
    requireAdmin(actor);
    return Response.json(await saveSeries(actor, await request.json()), { status: 201 });
  } catch (error) { return errorResponse(error); }
}
