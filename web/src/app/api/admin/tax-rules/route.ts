import { db } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { requireAdmin } from "@/lib/security/admin";
import { assertSameOrigin } from "@/lib/security/request";
import { currentActor } from "@/lib/security/session";
import { taxRuleInput } from "@/lib/tax/rule-input";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await currentActor();
    requireAdmin(actor);
    const value = taxRuleInput.parse(await request.json());
    const rule = await db.taxRule.create({ data: { organizationId: actor.organizationId, name: value.name, taxType: value.taxType, rateBasisPoints: Math.round(value.ratePercent * 100), placeOfSupplyRule: value.placeOfSupplyRule, exemptionNote: value.exemptionNote || null, approved: value.approved } });
    await db.auditEvent.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: "TAX_RULE_CREATED", entityType: "TaxRule", entityId: rule.id, metadata: { approved: rule.approved, rateBasisPoints: rule.rateBasisPoints } } });
    return Response.json(rule, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
