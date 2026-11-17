import { db } from "@/lib/db";
import { errorResponse, HttpError } from "@/lib/http";
import { requireAdmin } from "@/lib/security/admin";
import { assertSameOrigin } from "@/lib/security/request";
import { currentActor } from "@/lib/security/session";
import { taxRuleInput } from "@/lib/tax/rule-input";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await currentActor();
    requireAdmin(actor);
    const value = taxRuleInput.parse(await request.json());
    const { id } = await params;
    const existing = await db.taxRule.findFirst({ where: { id, organizationId: actor.organizationId } });
    if (!existing) throw new HttpError(404, "Tax treatment not found");

    const result = await db.$transaction(async (tx) => {
      const rule = await tx.taxRule.update({ where: { id }, data: { name: value.name, taxType: value.taxType, rateBasisPoints: Math.round(value.ratePercent * 100), placeOfSupplyRule: value.placeOfSupplyRule, exemptionNote: value.exemptionNote || null, approved: value.approved } });
      const revoked = await tx.event.updateMany({ where: { organizationId: actor.organizationId, taxRuleId: id, taxConfigApproved: true }, data: { taxConfigApproved: false } });
      await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: "TAX_RULE_CHANGED", entityType: "TaxRule", entityId: id, metadata: { previousType: existing.taxType, previousRateBasisPoints: existing.rateBasisPoints, newType: rule.taxType, newRateBasisPoints: rule.rateBasisPoints, approvalsRevoked: revoked.count } } });
      return { rule, approvalsRevoked: revoked.count };
    });
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
