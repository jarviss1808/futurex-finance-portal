import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { formatCurrencyMinor, toPaise } from "@/lib/finance/money";
import { assertAllocationAllowed } from "@/lib/finance/ledger";
import { documentScope, requireCapability, type Actor } from "@/lib/security/policy";
import { withTransactionRetry } from "@/lib/transactions";
import { paymentScope } from "./repository";
import { assertIssuable } from "@/lib/compliance/issuance";
import { allocateDocumentNumber } from "@/lib/documents/numbering";
import { PAYMENT_MODE_VALUES, REFERENCE_OPTIONAL_MODES } from "./modes";
import type { StoredProof } from "./proofs";

type Tx = Prisma.TransactionClient;
const serializable = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 20_000 };

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || undefined);
const submissionFields = {
  amount: z.union([z.string(), z.number()]),
  tdsAmount: z.union([z.string(), z.number()]).default("0"),
  paidOn: z.coerce.date(),
  mode: z.enum(PAYMENT_MODE_VALUES, { message: "Select a payment mode" }),
  reference: optionalText(100),
  remarks: optionalText(1000),
};

function checkSubmission(value: { mode: string; reference?: string; paidOn: Date }, context: z.RefinementCtx) {
  if (!REFERENCE_OPTIONAL_MODES.includes(value.mode) && !value.reference) context.addIssue({ code: "custom", path: ["reference"], message: "Enter the UTR / transaction or cheque number" });
  if (Number.isNaN(value.paidOn.getTime())) context.addIssue({ code: "custom", path: ["paidOn"], message: "Enter the payment date" });
  else if (value.paidOn.getTime() > Date.now() + 36 * 60 * 60 * 1000) context.addIssue({ code: "custom", path: ["paidOn"], message: "Payment date cannot be in the future" });
}

export const paymentSubmission = z.object({ documentId: z.string().cuid("Select the PI this payment belongs to"), ...submissionFields }).superRefine(checkSubmission);
export const paymentCorrection = z.object(submissionFields).superRefine(checkSubmission);

function parseAmount(raw: string | number) {
  let amountPaise: bigint;
  try { amountPaise = toPaise(raw); } catch { throw new HttpError(400, "Enter a valid amount with at most two decimals"); }
  if (amountPaise <= 0n) throw new HttpError(400, "Payment amount must be greater than zero");
  return amountPaise;
}

function parseTds(raw: string | number) {
  try { return toPaise(raw); } catch { throw new HttpError(400, "Enter a valid TDS amount with at most two decimals"); }
}

/** Approved and awaiting-approval totals for one document, optionally ignoring one payment being corrected. */
async function documentBalances(tx: Tx, documentId: string, excludePaymentId?: string) {
  const rows = await tx.paymentAllocation.findMany({ where: { documentId, ...(excludePaymentId ? { paymentId: { not: excludePaymentId } } : {}), payment: { status: { in: ["VERIFIED", "PENDING"] } } }, select: { amountPaise: true, tdsPaise: true, payment: { select: { status: true } } } });
  let verified = 0n, pending = 0n, verifiedTds = 0n, pendingTds = 0n;
  for (const row of rows) { if (row.payment.status === "VERIFIED") { verified += row.amountPaise; verifiedTds += row.tdsPaise; } else { pending += row.amountPaise; pendingTds += row.tdsPaise; } }
  return { verified, pending, verifiedTds, pendingTds };
}

function assertWithinTds(document: { tdsPaise: bigint; currency: string }, balances: { verifiedTds: bigint; pendingTds: bigint }, tdsPaise: bigint) {
  const open = document.tdsPaise - balances.verifiedTds - balances.pendingTds;
  if (tdsPaise <= open) return;
  throw new HttpError(409, `TDS is more than the unreconciled PI TDS. PI manual TDS ${formatCurrencyMinor(document.tdsPaise, document.currency)}, confirmed ${formatCurrencyMinor(balances.verifiedTds, document.currency)}, awaiting approval ${formatCurrencyMinor(balances.pendingTds, document.currency)} — at most ${formatCurrencyMinor(open < 0n ? 0n : open, document.currency)} can be recorded now.`);
}

function assertWithinOpenBalance(document: { totalPaise: bigint; netReceivablePaise: bigint; currency: string }, balances: { verified: bigint; pending: bigint }, amountPaise: bigint) {
  const open = document.netReceivablePaise - balances.verified - balances.pending;
  if (amountPaise <= open) return;
  const money = (value: bigint) => formatCurrencyMinor(value, document.currency);
  throw new HttpError(409, `Amount is more than the open balance. Gross PI ${money(document.totalPaise)}, net receivable ${money(document.netReceivablePaise)}, approved ${money(balances.verified)}, awaiting approval ${money(balances.pending)} — at most ${money(open < 0n ? 0n : open)} can be recorded now.`);
}

function friendlyDuplicate(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new HttpError(409, "A payment with this UTR / reference and the same amount is already recorded. Open the existing entry instead of adding a duplicate.");
  throw error;
}

const auditSnapshot = (payment: { amountPaise: bigint; tdsPaise: bigint; paidOn: Date; mode: string; reference: string | null; remarks: string | null }) => ({ amountPaise: payment.amountPaise.toString(), tdsPaise: payment.tdsPaise.toString(), paidOn: payment.paidOn.toISOString().slice(0, 10), mode: payment.mode, reference: payment.reference, remarks: payment.remarks });

export async function recordPayment(actor: Actor, raw: unknown, proof: StoredProof | null = null) {
  const input = paymentSubmission.parse(raw);
  const amountPaise = parseAmount(input.amount);
  const tdsPaise = parseTds(input.tdsAmount);
  try {
    return await withTransactionRetry(() => db.$transaction(async (tx) => {
      const document = await tx.financialDocument.findFirst({ where: { id: input.documentId, type: { in: ["PROFORMA", "TAX_INVOICE"] }, ...documentScope(actor) }, select: { id: true, status: true, number: true, totalPaise: true, tdsPaise: true, netReceivablePaise: true, currency: true, client: { select: { legalName: true } } } });
      if (!document) throw new HttpError(404, "PI not found");
      if (document.status !== "ISSUED") throw new HttpError(409, `Payments can be recorded only against an issued PI (this one is ${document.status.toLowerCase()}).`);
      const balances = await documentBalances(tx, document.id);
      assertWithinOpenBalance(document, balances, amountPaise);
      assertWithinTds(document, balances, tdsPaise);
      const payment = await tx.payment.create({ data: {
        organizationId: actor.organizationId, reportedById: actor.id, amountPaise, currency: document.currency, paidOn: input.paidOn, mode: input.mode,
        reference: input.reference ?? null, remarks: input.remarks ?? null, payer: document.client.legalName,
        allocations: { create: [{ documentId: document.id, amountPaise, tdsPaise }] },
        ...(proof ? { proofs: { create: [{ ...proof, uploadedById: actor.id }] } } : {}),
      } });
      await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: "PAYMENT_SUBMITTED", entityType: "Payment", entityId: payment.id, metadata: { documentId: document.id, documentNumber: document.number, ...auditSnapshot({ ...payment, tdsPaise }), proofAttached: Boolean(proof) } } });
      return payment;
    }, serializable));
  } catch (error) { friendlyDuplicate(error); }
}

async function loadEditablePayment(tx: Tx, actor: Actor, paymentId: string) {
  const payment = await tx.payment.findFirst({ where: { id: paymentId, ...paymentScope(actor) }, include: { allocations: { include: { document: { select: { id: true, status: true, number: true, totalPaise: true, tdsPaise: true, netReceivablePaise: true, currency: true } } } } } });
  if (!payment) throw new HttpError(404, "Payment entry not found");
  if (actor.role !== "ADMIN" && payment.reportedById !== actor.id) throw new HttpError(403, "Only the employee who submitted this entry (or an Admin) can change it");
  if (payment.status !== "PENDING" && payment.status !== "REJECTED") throw new HttpError(409, "Only entries that are pending approval or declined can be changed");
  return payment;
}

/** Correct a pending entry, or correct and resubmit a declined one. It always returns to Pending approval. */
export async function correctPayment(actor: Actor, paymentId: string, raw: unknown, proof: StoredProof | null = null) {
  const input = paymentCorrection.parse(raw);
  const amountPaise = parseAmount(input.amount);
  const tdsPaise = parseTds(input.tdsAmount);
  try {
    return await withTransactionRetry(() => db.$transaction(async (tx) => {
      const payment = await loadEditablePayment(tx, actor, paymentId);
      const allocation = payment.allocations[0];
      if (!allocation || payment.allocations.length !== 1) throw new HttpError(409, "This entry is not linked to a single PI and cannot be corrected here");
      if (allocation.document.status !== "ISSUED") throw new HttpError(409, "The linked PI is no longer active; withdraw this entry instead");
      const balances = await documentBalances(tx, allocation.documentId, payment.id);
      assertWithinOpenBalance(allocation.document, balances, amountPaise);
      assertWithinTds(allocation.document, balances, tdsPaise);
      const resubmitted = payment.status === "REJECTED";
      const updated = await tx.payment.updateMany({ where: { id: payment.id, status: payment.status, updatedAt: payment.updatedAt }, data: {
        amountPaise, paidOn: input.paidOn, mode: input.mode, reference: input.reference ?? null, remarks: input.remarks ?? null,
        status: "PENDING", submittedAt: new Date(), submissionCount: resubmitted ? { increment: 1 } : undefined,
        reviewNote: null, reviewedAt: null, verifiedById: null, verifiedAt: null,
      } });
      if (updated.count !== 1) throw new HttpError(409, "This entry was changed by someone else. Reload and try again.");
      await tx.paymentAllocation.update({ where: { id: allocation.id }, data: { amountPaise, tdsPaise } });
      if (proof) await tx.paymentProof.create({ data: { ...proof, paymentId: payment.id, uploadedById: actor.id } });
      await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: resubmitted ? "PAYMENT_RESUBMITTED" : "PAYMENT_CORRECTED", entityType: "Payment", entityId: payment.id, metadata: {
        documentNumber: allocation.document.number, before: auditSnapshot({ ...payment, tdsPaise: allocation.tdsPaise }), after: auditSnapshot({ amountPaise, tdsPaise, paidOn: input.paidOn, mode: input.mode, reference: input.reference ?? null, remarks: input.remarks ?? null }),
        ...(resubmitted && payment.reviewNote ? { declineReason: payment.reviewNote } : {}), proofAttached: Boolean(proof),
      } } });
      return { id: payment.id, status: "PENDING" as const, resubmitted };
    }, serializable));
  } catch (error) { friendlyDuplicate(error); }
}

export async function withdrawPayment(actor: Actor, paymentId: string, rawReason: unknown) {
  const reason = z.string().trim().min(3, "Give a short reason").max(500).parse(rawReason);
  return withTransactionRetry(() => db.$transaction(async (tx) => {
    const payment = await loadEditablePayment(tx, actor, paymentId);
    const updated = await tx.payment.updateMany({ where: { id: payment.id, status: payment.status }, data: { status: "WITHDRAWN", reviewNote: reason } });
    if (updated.count !== 1) throw new HttpError(409, "This entry was changed by someone else. Reload and try again.");
    await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: "PAYMENT_WITHDRAWN", entityType: "Payment", entityId: payment.id, metadata: { reason, previousStatus: payment.status } } });
    return { id: payment.id, status: "WITHDRAWN" as const };
  }, serializable));
}

export async function attachProof(actor: Actor, paymentId: string, proof: StoredProof) {
  return db.$transaction(async (tx) => {
    const payment = await loadEditablePayment(tx, actor, paymentId);
    const created = await tx.paymentProof.create({ data: { ...proof, paymentId: payment.id, uploadedById: actor.id } });
    await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: "PAYMENT_PROOF_ADDED", entityType: "Payment", entityId: payment.id, metadata: { proofId: created.id, fileName: proof.fileName } } });
    return { id: created.id };
  });
}

export async function verifyPayment(actor: Actor, paymentId: string) {
  return reviewPayment(actor, paymentId, "VERIFIED");
}

export async function rejectPayment(actor: Actor, paymentId: string, note: string) {
  const reason = z.string().trim().min(3, "Give the employee a reason (at least 3 characters)").max(500).parse(note);
  return reviewPayment(actor, paymentId, "REJECTED", reason);
}

async function reviewPayment(actor: Actor, paymentId: string, decision: "VERIFIED" | "REJECTED", note?: string) {
  requireCapability(actor, "VERIFY_PAYMENT");
  return withTransactionRetry(() => db.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({ where: { id: paymentId, organizationId: actor.organizationId }, include: { allocations: { include: { document: true } } } });
    if (!payment) throw new HttpError(404, "Payment not found");
    if (payment.status !== "PENDING") throw new HttpError(409, "This entry is no longer pending — it may have been reviewed or changed already. Reload the page.");
    if (decision === "VERIFIED") {
      let allocated = 0n;
      for (const allocation of payment.allocations) {
        if (allocation.document.status !== "ISSUED") throw new HttpError(409, `${allocation.document.number ?? "The PI"} is ${allocation.document.status.toLowerCase()}; decline this entry instead.`);
        const confirmed = await tx.paymentAllocation.aggregate({ where: { documentId: allocation.documentId, payment: { status: "VERIFIED" } }, _sum: { amountPaise: true } });
        const confirmedPaise = confirmed._sum.amountPaise ?? 0n;
        try {
          assertAllocationAllowed({ paymentStatus: "VERIFIED", paymentAmountPaise: payment.amountPaise, alreadyAllocatedPaise: allocated, requestedPaise: allocation.amountPaise, invoiceOutstandingPaise: allocation.document.netReceivablePaise - confirmedPaise });
        } catch {
          throw new HttpError(409, `Approving this would take ${allocation.document.number ?? "the PI"} above its total. Decline it and ask the employee to correct the amount.`);
        }
        allocated += allocation.amountPaise;
        const confirmedTds = await tx.paymentAllocation.aggregate({ where: { documentId: allocation.documentId, payment: { status: "VERIFIED" } }, _sum: { tdsPaise: true } });
        if ((confirmedTds._sum.tdsPaise ?? 0n) + allocation.tdsPaise > allocation.document.tdsPaise) throw new HttpError(409, `Approving this would take confirmed TDS above the manual TDS on ${allocation.document.number ?? "the PI"}. Decline it and ask the employee to correct the TDS amount.`);
      }
    }
    const reviewedAt = new Date();
    const updated = await tx.payment.updateMany({ where: { id: payment.id, status: "PENDING", updatedAt: payment.updatedAt }, data: { status: decision, verifiedById: actor.id, reviewedAt, verifiedAt: decision === "VERIFIED" ? reviewedAt : null, reviewNote: note ?? null } });
    if (updated.count !== 1) throw new HttpError(409, "This entry changed while you were reviewing it. Reload and check the latest details.");
    await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: decision === "VERIFIED" ? "PAYMENT_VERIFIED" : "PAYMENT_REJECTED", entityType: "Payment", entityId: payment.id, metadata: { amountPaise: payment.amountPaise.toString(), tdsPaise: payment.allocations.reduce((sum, allocation) => sum + allocation.tdsPaise, 0n).toString(), ...(note ? { note } : {}) } } });
    return { id: payment.id, status: decision };
  }, serializable));
}

export async function createReceipt(actor: Actor, paymentId: string, seriesId: string) {
  requireCapability(actor, "ISSUE_RECEIPT");
  return withTransactionRetry(() => db.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({ where: { id: paymentId, ...paymentScope(actor) }, include: { allocations: { include: { document: { include: { client: true, event: true } } } } } });
    if (!payment) throw new HttpError(404, "Payment not found"); if (payment.status !== "VERIFIED") throw new HttpError(409, "Only verified payments can produce a receipt"); if (payment.receiptDocumentId) throw new HttpError(409, "Receipt already exists"); if (!payment.allocations.length) throw new HttpError(409, "Allocate the payment before creating a receipt");
    const first = payment.allocations[0].document; if (!first.event) throw new HttpError(409, "Allocated document has no exhibition"); if (payment.allocations.some((a) => a.document.clientId !== first.clientId)) throw new HttpError(409, "One receipt cannot span multiple clients"); if (payment.allocations.some((a) => a.document.currency !== payment.currency)) throw new HttpError(409, "Receipt payment and document currencies must match");
    const series = await tx.documentSeries.findFirst({ where: { id: seriesId, organizationId: actor.organizationId, documentType: "RECEIPT" } }); if (!series) throw new HttpError(409, "Receipt number series not found");
    assertIssuable({ documentType: "RECEIPT", seriesConfigured: series.configured, taxConfigApproved: first.event.taxConfigApproved, snapshotComplete: true, paymentVerified: true });
    const number = await allocateDocumentNumber(tx as unknown as Parameters<typeof allocateDocumentNumber>[0], series.id, series); const issuedAt = new Date();
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { name: true } });
    const clientDocuments = await tx.financialDocument.findMany({ where: { organizationId: actor.organizationId, clientId: first.clientId, currency: payment.currency, status: "ISSUED", type: { in: ["TAX_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"] } }, select: { id: true, type: true, totalPaise: true } });
    const confirmed = await tx.paymentAllocation.groupBy({ by: ["documentId"], where: { documentId: { in: clientDocuments.map((d) => d.id) }, payment: { status: "VERIFIED" } }, _sum: { amountPaise: true } });
    const billedPaise = clientDocuments.reduce((sum, document) => sum + (document.type === "CREDIT_NOTE" ? -document.totalPaise : document.totalPaise), 0n); const receivedPaise = confirmed.reduce((s, a) => s + (a._sum.amountPaise ?? 0n), 0n); const outstandingPaise = billedPaise - receivedPaise;
    const snapshot = { schemaVersion: 1, type: "RECEIPT", number, issuedAt: issuedAt.toISOString(), currency: payment.currency, organization: { name: organization.name }, client: { legalName: first.client.legalName, billingAddress: first.client.billingAddress, gstin: first.client.gstin }, event: { name: first.event.name, edition: first.event.edition, venue: first.event.venue, city: first.event.city, countryCode: first.event.countryCode }, paymentId: payment.id, paymentReference: payment.reference, paymentMode: payment.mode, paidOn: payment.paidOn.toISOString(), paymentTdsPaise: payment.allocations.reduce((sum, allocation) => sum + allocation.tdsPaise, 0n).toString(), lines: [{ description: `Payment received via ${payment.mode}`, classification: "RECEIPT", quantity: "1", unitPricePaise: payment.amountPaise.toString(), amountPaise: payment.amountPaise.toString() }], taxLabel: "Tax", taxablePaise: payment.amountPaise.toString(), taxPaise: "0", totalPaise: payment.amountPaise.toString(), cumulativeConfirmedPaise: receivedPaise.toString(), outstandingPaise: outstandingPaise.toString(), allocations: payment.allocations.map((a) => ({ documentId: a.documentId, documentNumber: a.document.number, amountPaise: a.amountPaise.toString(), tdsPaise: a.tdsPaise.toString() })) };
    const receipt = await tx.financialDocument.create({ data: { organizationId: actor.organizationId, ownerId: payment.reportedById, clientId: first.clientId, eventId: first.eventId, seriesId: series.id, type: "RECEIPT", status: "ISSUED", number, currency: payment.currency, taxablePaise: payment.amountPaise, taxPaise: 0n, totalPaise: payment.amountPaise, tdsPaise: 0n, netReceivablePaise: payment.amountPaise, einvoiceStatus: "NOT_APPLICABLE", issuedAt, snapshot } });
    const linked = await tx.payment.updateMany({ where: { id: payment.id, receiptDocumentId: null }, data: { receiptDocumentId: receipt.id } }); if (linked.count !== 1) throw new HttpError(409, "Receipt was created concurrently");
    await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: "RECEIPT_ISSUED", entityType: "FinancialDocument", entityId: receipt.id, metadata: { paymentId: payment.id, number } } }); return { id: receipt.id, number };
  }, serializable));
}
