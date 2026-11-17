import "server-only";
import { Prisma, type EinvoiceStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { assertIssuable } from "@/lib/compliance/issuance";
import { allocateDocumentNumber } from "./numbering";
import { documentScope, requireCapability, requireEinvoiceDecisionAuthority, type Actor } from "@/lib/security/policy";
import { deriveDocumentTaxTreatment } from "@/lib/tax/document-treatment";
import { readPrivateFile } from "@/lib/storage/private-files";
import { withTransactionRetry } from "@/lib/transactions";
import { findActiveSeries } from "./series";
import { documentNotes } from "./foreign-venue-note";

export type IssueOptions = { seriesId?: string; einvoiceStatus?: EinvoiceStatus; irn?: string; acknowledgementNumber?: string; signedQrPayload?: string };

export async function issueDocument(actor: Actor, documentId: string, options: IssueOptions) {
  // Many employees may issue at the same moment. Each attempt is a SERIALIZABLE transaction; a
  // conflicting attempt is rolled back in full (including its counter increment) and retried.
  return withTransactionRetry(() => db.$transaction(async (tx) => {
    const document = await tx.financialDocument.findFirst({ where: { id: documentId, ...documentScope(actor) }, include: { client: true, event: true, organization: true, taxRule: true } });
    if (!document) throw new HttpError(404, "Document not found");
    const profile = await tx.companyProfile.findUnique({ where: { organizationId: actor.organizationId } });
    if (document.status !== "DRAFT" && document.status !== "VALIDATED") throw new HttpError(409, "Only a draft or validated document can be issued");
    if (!document.event) throw new HttpError(409, "Exhibition is required");
    if (!document.event.taxConfigApproved || !document.event.taxRuleId || document.event.taxRuleId !== document.taxRuleId) throw new HttpError(409, "Exhibition tax configuration changed; create a new draft");
    if (!document.taxRule?.approved) throw new HttpError(409, "Exhibition tax configuration is not approved");
    let currentTax;
    try {
      currentTax = deriveDocumentTaxTreatment({ eventCountryCode: document.event.countryCode, taxType: document.taxRule.taxType, rateBasisPoints: document.taxRule.rateBasisPoints, companyGstin: profile?.gstin, clientGstin: document.client.gstin });
    } catch (error) {
      throw new HttpError(409, error instanceof Error ? error.message : "Unable to determine GST treatment");
    }
    const draftSnapshot = document.snapshot as Prisma.JsonObject;
    if (draftSnapshot.taxLabel !== currentTax.label || String(draftSnapshot.taxRatePercent ?? "") !== currentTax.ratePercent) throw new HttpError(409, "Client or exhibition tax treatment changed; create a new draft");
    if (["TAX_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"].includes(document.type)) requireCapability(actor, "ISSUE_TAX_INVOICE");
    const series = options.seriesId
      ? await tx.documentSeries.findFirst({ where: { id: options.seriesId, organizationId: actor.organizationId, documentType: document.type, configured: true } })
      : await findActiveSeries(tx, actor.organizationId, document.type);
    if (!series) throw new HttpError(409, "No active number series is enabled for this document type. Ask an Admin to enable one.");
    const eStatus = ["TAX_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"].includes(document.type) ? (options.einvoiceStatus ?? "UNRESOLVED") : "NOT_APPLICABLE";
    if (["TAX_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"].includes(document.type)) requireEinvoiceDecisionAuthority(actor, eStatus);
    assertIssuable({ documentType: document.type, seriesConfigured: series.configured, taxConfigApproved: document.event.taxConfigApproved && Boolean(document.taxRule?.approved), snapshotComplete: Boolean(document.snapshot), einvoiceStatus: eStatus, irn: options.irn, acknowledgementNumber: options.acknowledgementNumber, signedQrPayload: options.signedQrPayload });
    const number = await allocateDocumentNumber(tx as unknown as Parameters<typeof allocateDocumentNumber>[0], series.id, series);
    const issuedAt = new Date();
    let signatureImageBase64: string | undefined;
    if (profile?.signatureApproved) {
      if (!profile.signatureStorageKey) throw new HttpError(409, "Approved signatory stamp file is not configured");
      try { signatureImageBase64 = Buffer.from(await readPrivateFile(profile.signatureStorageKey)).toString("base64"); }
      catch { throw new HttpError(409, "Approved signatory stamp file is unavailable"); }
    }
    const organizationSnapshot = profile ? { name: document.organization.name, legalName: profile.legalName, registeredAddress: profile.registeredAddress, corporateAddress: profile.corporateAddress, gstRegisteredAddress: profile.gstRegisteredAddress, gstin: profile.gstin, pan: profile.pan, cin: profile.cin, accountsEmail: profile.accountsEmail, ...(profile.bankDetails ? { bankDetails: profile.bankDetails } : {}), ...(signatureImageBase64 ? { signatureImageBase64 } : {}) } : { name: document.organization.name };
    const dateAtVenue = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: document.event!.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
    const snapshot = { ...draftSnapshot, notes: documentNotes({ eventCountryCode: document.event.countryCode, taxable: currentTax.taxable, userNotes: typeof draftSnapshot.notes === "string" ? draftSnapshot.notes : "" }), number, issuedAt: issuedAt.toISOString(), organization: organizationSnapshot, client: { legalName: document.client.legalName, billingAddress: document.client.billingAddress, gstin: document.client.gstin }, event: { name: document.event.name, edition: document.event.edition, startsOn: dateAtVenue(document.event.startsOn), endsOn: dateAtVenue(document.event.endsOn), venue: document.event.venue, city: document.event.city, stateRegion: document.event.stateRegion, countryCode: document.event.countryCode } } satisfies Prisma.JsonObject;
    const updated = await tx.financialDocument.updateMany({ where: { id: document.id, version: document.version, status: { in: ["DRAFT", "VALIDATED"] } }, data: { number, seriesId: series.id, status: "ISSUED", issuedAt, snapshot, version: { increment: 1 }, einvoiceStatus: eStatus, irn: options.irn || null, acknowledgementNumber: options.acknowledgementNumber || null, signedQrPayload: options.signedQrPayload || null } });
    if (updated.count !== 1) throw new HttpError(409, "Document changed during issuance");
    await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: "DOCUMENT_ISSUED", entityType: "FinancialDocument", entityId: document.id, metadata: { number, type: document.type } } });
    return { id: document.id, number, issuedAt, status: "ISSUED" as const };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 20_000 }));
}
