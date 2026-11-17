import { db } from "@/lib/db";
import { currentActor } from "@/lib/security/session";

export async function GET() {
  const actor = await currentActor();
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const events = await db.event.findMany({ where: { organizationId: actor.organizationId }, select: { id: true, name: true, edition: true, startsOn: true, endsOn: true, venue: true, city: true, countryCode: true, taxConfigApproved: true, taxRule: { select: { name: true, taxType: true, rateBasisPoints: true } } }, orderBy: { startsOn: "desc" } });
  return Response.json(events, { headers: { "Cache-Control": "private, no-store" } });
}
