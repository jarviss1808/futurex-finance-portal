import "server-only";
import { z } from "zod";
import { Prisma, type DocumentType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { requireCapability, type Actor } from "@/lib/security/policy";
import { withTransactionRetry } from "@/lib/transactions";
import { highestUsedSerial } from "./numbering";

const documentTypes = ["PROFORMA", "TAX_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE", "RECEIPT", "GST_RECEIPT_VOUCHER"] as const;
const fields = {
  financialYear: z.string().trim().min(3).max(20),
  prefix: z.string().min(1).max(100),
  suffix: z.string().max(30),
  padding: z.coerce.number().int().min(1).max(12),
  nextNumber: z.coerce.bigint().min(1n, "Next number must be 1 or higher"),
  configured: z.boolean(),
};
const createInput = z.object({ documentType: z.enum(documentTypes), ...fields, suffix: fields.suffix.default("") });
const updateInput = z.object(fields).partial();

type Tx = Prisma.TransactionClient;

/** The single enabled series for a document type. Admin enabling a series disables the others. */
export function findActiveSeries(client: Tx | typeof db, organizationId: string, documentType: DocumentType) {
  return client.documentSeries.findFirst({ where: { organizationId, documentType, configured: true }, orderBy: { updatedAt: "desc" } });
}

export function previewNumber(series: { prefix: string; suffix: string; padding: number; nextNumber: bigint }) {
  return `${series.prefix}${series.nextNumber.toString().padStart(series.padding, "0")}${series.suffix}`;
}

export async function saveSeries(actor: Actor, raw: unknown, id?: string) {
  requireCapability(actor, "ADMINISTER");
  return withTransactionRetry(() => db.$transaction(async (tx) => {
    let before: Awaited<ReturnType<typeof tx.documentSeries.findFirst>> = null;
    if (id) {
      // Lock the counter row so an in-flight issuance and this change are strictly ordered.
      await tx.$queryRaw`SELECT "id" FROM "DocumentSeries" WHERE "id" = ${id} AND "organizationId" = ${actor.organizationId} FOR UPDATE`;
      before = await tx.documentSeries.findFirst({ where: { id, organizationId: actor.organizationId } });
      if (!before) throw new HttpError(404, "Number series not found");
    }
    const value = before
      ? { documentType: before.documentType, financialYear: before.financialYear, prefix: before.prefix, suffix: before.suffix, padding: before.padding, nextNumber: before.nextNumber, configured: before.configured, ...updateInput.parse(raw) }
      : createInput.parse(raw);

    const used = await tx.financialDocument.findMany({ where: { organizationId: actor.organizationId, type: value.documentType, number: { startsWith: value.prefix } }, select: { number: true } });
    const highest = highestUsedSerial(used.map((row) => row.number), value);
    if (highest !== null && value.nextNumber <= highest) {
      const last = `${value.prefix}${highest.toString().padStart(value.padding, "0")}${value.suffix}`;
      throw new HttpError(409, `${last} has already been issued. Issued and cancelled numbers are never reused, so the next number must be ${(highest + 1n).toString()} or higher.`);
    }
    if (value.configured) {
      await tx.documentSeries.updateMany({ where: { organizationId: actor.organizationId, documentType: value.documentType, configured: true, ...(id ? { NOT: { id } } : {}) }, data: { configured: false } });
    }
    const data = { financialYear: value.financialYear, prefix: value.prefix, suffix: value.suffix, padding: value.padding, nextNumber: value.nextNumber, configured: value.configured };
    const saved = id
      ? await tx.documentSeries.update({ where: { id }, data })
      : await tx.documentSeries.create({ data: { ...data, documentType: value.documentType, organizationId: actor.organizationId } });
    await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: id ? "DOCUMENT_SERIES_UPDATED" : "DOCUMENT_SERIES_CREATED", entityType: "DocumentSeries", entityId: saved.id, metadata: {
      documentType: saved.documentType,
      ...(before ? { before: { prefix: before.prefix, suffix: before.suffix, padding: before.padding, nextNumber: before.nextNumber.toString(), configured: before.configured, financialYear: before.financialYear } } : {}),
      after: { prefix: saved.prefix, suffix: saved.suffix, padding: saved.padding, nextNumber: saved.nextNumber.toString(), configured: saved.configured, financialYear: saved.financialYear },
    } } });
    return { ...saved, nextNumber: saved.nextNumber.toString(), nextPreview: previewNumber(saved) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
}
