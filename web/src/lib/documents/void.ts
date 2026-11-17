import "server-only";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { documentScope, type Actor } from "@/lib/security/policy";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { withTransactionRetry } from "@/lib/transactions";

export async function voidProforma(actor: Actor, documentId: string, rawReason: string) {
  const reason = z.string().trim().min(3, "Give a short reason for cancelling").max(500).parse(rawReason);
  return withTransactionRetry(() => db.$transaction(async (tx) => {
    const document = await tx.financialDocument.findFirst({ where: { id: documentId, ...documentScope(actor) }, select: { id: true, organizationId: true, ownerId: true, type: true, status: true, number: true, version: true } });
    if (!document || document.type !== "PROFORMA") throw new HttpError(404, "Proforma Invoice not found");
    if (actor.role !== "ADMIN" && document.ownerId !== actor.id) throw new HttpError(403, "Only the employee who created this PI or Admin can cancel it");
    if (!(["DRAFT", "ISSUED"] as string[]).includes(document.status)) throw new HttpError(409, "Only a draft or issued PI can be cancelled");
    const verifiedAllocations = await tx.paymentAllocation.count({ where: { documentId, payment: { status: "VERIFIED" } } });
    if (verifiedAllocations) throw new HttpError(409, "This PI already has approved payments, so it cannot be cancelled. Contact Admin to reverse or move those payments first.");
    const pendingAllocations = await tx.paymentAllocation.count({ where: { documentId, payment: { status: "PENDING" } } });
    if (pendingAllocations) throw new HttpError(409, "This PI has payment entries awaiting approval. Withdraw them (or ask Admin to decline them) before cancelling.");
    const updated = await tx.financialDocument.updateMany({ where: { id: document.id, version: document.version, status: document.status }, data: { status: "VOIDED", version: { increment: 1 } } });
    if (updated.count !== 1) throw new HttpError(409, "PI changed during cancellation");
    await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: "PROFORMA_VOIDED", entityType: "FinancialDocument", entityId: document.id, metadata: { number: document.number, reason } } });
    return { id: document.id, status: "VOIDED" as const };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
}
