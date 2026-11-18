import "server-only";
import type { Prisma, PaymentStatus } from "@/generated/prisma/client";
import type { Actor } from "@/lib/security/policy";
import { db } from "@/lib/db";

const privileged = (actor: Actor) => ["PAYMENT_VERIFIER", "ACCOUNTANT", "ADMIN"].includes(actor.role);

/**
 * Admin sees every payment in the organization. An employee sees entries they submitted and
 * entries recorded (for example by Admin) against PIs they own or that were explicitly shared.
 */
export function paymentScope(actor: Actor): Prisma.PaymentWhereInput {
  if (privileged(actor)) return { organizationId: actor.organizationId };
  return { organizationId: actor.organizationId, OR: [
    { reportedById: actor.id },
    { allocations: { some: { document: { OR: [{ ownerId: actor.id }, { shares: { some: { userId: actor.id } } }] } } } },
  ] };
}

export type PaymentFilters = {
  status?: PaymentStatus;
  statuses?: PaymentStatus[];
  /** PI owners (the employee credited with the sale). Admin only. */
  ownerIds?: string[];
  eventIds?: string[];
  documentId?: string;
  search?: string;
  from?: Date;
  to?: Date;
  take?: number;
};

export function paymentWhere(actor: Actor, filters: PaymentFilters = {}): Prisma.PaymentWhereInput {
  const and: Prisma.PaymentWhereInput[] = [paymentScope(actor)];
  const statuses = filters.statuses?.length ? filters.statuses : filters.status ? [filters.status] : undefined;
  if (statuses) and.push({ status: { in: statuses } });
  if (filters.ownerIds?.length && privileged(actor)) and.push({ allocations: { some: { document: { ownerId: { in: filters.ownerIds } } } } });
  if (filters.eventIds?.length) and.push({ allocations: { some: { document: { eventId: { in: filters.eventIds } } } } });
  if (filters.documentId) and.push({ allocations: { some: { documentId: filters.documentId } } });
  if (filters.from || filters.to) and.push({ paidOn: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lt: filters.to } : {}) } });
  const search = filters.search?.trim();
  if (search) and.push({ OR: [
    { reference: { contains: search, mode: "insensitive" } },
    { payer: { contains: search, mode: "insensitive" } },
    { allocations: { some: { document: { number: { contains: search, mode: "insensitive" } } } } },
  ] });
  return { AND: and };
}

export const paymentListInclude = {
  reportedBy: { select: { id: true, name: true } },
  verifiedBy: { select: { name: true } },
  allocations: { include: { document: { select: { id: true, number: true, status: true, ownerId: true, totalPaise: true, snapshot: true, correctedSnapshot: true, owner: { select: { name: true } }, client: { select: { legalName: true } }, event: { select: { id: true, name: true } } } } } },
  receipt: { select: { id: true, number: true } },
  proofs: { select: { id: true, fileName: true, mediaType: true, createdAt: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.PaymentInclude;

export function listVisiblePayments(actor: Actor, filters: PaymentFilters = {}) {
  return db.payment.findMany({ where: paymentWhere(actor, filters), include: paymentListInclude, orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }], ...(filters.take ? { take: filters.take } : {}) });
}

/** Audit trail for payments the caller can already see (ids must come from a scoped query). */
export async function paymentHistory(organizationId: string, paymentIds: string[]) {
  if (!paymentIds.length) return new Map<string, Array<{ action: string; at: Date; actor: string; metadata: Prisma.JsonValue }>>();
  const events = await db.auditEvent.findMany({ where: { organizationId, entityType: "Payment", entityId: { in: paymentIds } }, select: { entityId: true, action: true, createdAt: true, metadata: true, actor: { select: { name: true } } }, orderBy: { createdAt: "asc" } });
  const history = new Map<string, Array<{ action: string; at: Date; actor: string; metadata: Prisma.JsonValue }>>();
  for (const event of events) {
    const list = history.get(event.entityId) ?? [];
    list.push({ action: event.action, at: event.createdAt, actor: event.actor.name, metadata: event.metadata });
    history.set(event.entityId, list);
  }
  return history;
}

export function findVisibleProof(actor: Actor, proofId: string) {
  return db.paymentProof.findFirst({ where: { id: proofId, payment: paymentScope(actor) } });
}
