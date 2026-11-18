import "server-only";
import { db } from "@/lib/db";
import { documentScope, type Actor } from "@/lib/security/policy";

export type DocumentFilters = { status?: "DRAFT" | "VALIDATED" | "ISSUED" | "REVISED" | "VOIDED"; type?: "PROFORMA" | "TAX_INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE" | "RECEIPT" | "GST_RECEIPT_VOUCHER"; ownerId?: string; clientId?: string; eventId?: string; from?: Date; to?: Date };

export function listVisibleDocuments(actor: Actor, filters: DocumentFilters = {}) {
  return db.financialDocument.findMany({
    where: { ...documentScope(actor), ...(filters.status ? { status: filters.status } : {}), ...(filters.type ? { type: filters.type } : {}), ...(filters.ownerId && actor.role === "ADMIN" ? { ownerId: filters.ownerId } : {}), ...(filters.clientId ? { clientId: filters.clientId } : {}), ...(filters.eventId ? { eventId: filters.eventId } : {}), ...((filters.from || filters.to) ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lt: filters.to } : {}) } } : {}) },
    select: { id: true, type: true, status: true, number: true, totalPaise: true, tdsPaise: true, netReceivablePaise: true, currency: true, clientId: true, eventId: true, stallNumber: true, snapshot: true, correctedSnapshot: true, correctionVersion: true, createdAt: true, issuedAt: true, owner: { select: { id: true, name: true } }, client: { select: { legalName: true } }, event: { select: { name: true } }, allocations: { select: { amountPaise: true, payment: { select: { status: true } } } } },
    orderBy: { createdAt: "desc" },
  });
}

export function findVisibleDocument(actor: Actor, id: string) {
  return db.financialDocument.findFirst({ where: { id, ...documentScope(actor) }, include: { client: true, event: true, owner: { select: { id: true, name: true } } } });
}

export function findVisiblePrivateFile(actor: Actor, id: string) {
  return db.privateFile.findFirst({ where: { id, document: documentScope(actor) }, include: { document: { select: { number: true, type: true } } } });
}
