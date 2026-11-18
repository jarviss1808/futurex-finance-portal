import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import {
  documentScope,
  clientRelationshipScope,
  type Actor,
} from "@/lib/security/policy";
import { buildDraftSnapshot } from "./input";
import {
  calculateTaxBreakdown,
  deriveDocumentTaxTreatment,
} from "@/lib/tax/document-treatment";
import { documentNotes } from "./foreign-venue-note";
import { withTransactionRetry } from "@/lib/transactions";
import { customTaxPolicy, parseCustomEvent } from "./custom-event";

export async function correctProforma(
  actor: Actor,
  documentId: string,
  raw: unknown,
) {
  const correctionReason =
    typeof (raw as { correctionReason?: unknown })?.correctionReason ===
    "string"
      ? (raw as { correctionReason: string }).correctionReason.trim()
      : "";
  if (correctionReason.length < 5 || correctionReason.length > 500)
    throw new HttpError(
      400,
      "Enter a correction reason between 5 and 500 characters",
    );
  const draft = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const customEvent = draft.eventSource === "CUSTOM" ? parseCustomEvent(draft.customEvent) : null;
  const clientId = typeof draft.clientId === "string" ? draft.clientId : "";
  const eventId = typeof draft.eventId === "string" ? draft.eventId : "";

  return withTransactionRetry(() =>
    db.$transaction(
      async (tx) => {
        const document = await tx.financialDocument.findFirst({
          where: { id: documentId, ...documentScope(actor) },
          include: { taxRule: true },
        });
        if (!document || document.type !== "PROFORMA")
          throw new HttpError(404, "Proforma Invoice not found");
        if (actor.role !== "ADMIN" && document.ownerId !== actor.id)
          throw new HttpError(403, "Only the PI owner or Admin can correct it");
        if (document.status !== "ISSUED")
          throw new HttpError(
            409,
            "Only an issued PI can use the one-time correction workflow",
          );
        if (document.correctionVersion !== 0 || document.correctedSnapshot)
          throw new HttpError(
            409,
            "This PI has already used its one allowed correction. Cancel it and create a new PI.",
          );
        const unsafePayments = await tx.paymentAllocation.count({
          where: {
            documentId,
            payment: { status: { in: ["PENDING", "VERIFIED"] } },
          },
        });
        if (unsafePayments)
          throw new HttpError(
            409,
            "This PI has pending or approved payments and cannot be corrected. Resolve the payment workflow first.",
          );

        const [client, event, profile] = await Promise.all([
          tx.client.findFirst({
            where: {
              id: clientId,
              ...clientRelationshipScope(actor),
            },
          }),
          customEvent
            ? Promise.resolve(null)
            : tx.event.findFirst({
                where: {
                  id: eventId,
                  organizationId: actor.organizationId,
                },
                include: { taxRule: true },
              }),
          tx.companyProfile.findUnique({
            where: { organizationId: actor.organizationId },
          }),
        ]);
        if (!client) throw new HttpError(404, "Client not found");
        if (!customEvent && !event)
          throw new HttpError(404, "Exhibition not found");
        if (event && (!event.taxConfigApproved || !event.taxRule?.approved))
          throw new HttpError(
            409,
            "Admin must assign and approve this exhibition's tax configuration",
          );
        const policy = customEvent
          ? customTaxPolicy(customEvent.countryCode)
          : null;
        const taxRule =
          event?.taxRule ??
          (await tx.taxRule.findFirst({
            where: {
              organizationId: actor.organizationId,
              approved: true,
              taxType: policy!.taxType,
              rateBasisPoints: policy!.rateBasisPoints,
            },
            orderBy: { updatedAt: "desc" },
          }));
        if (!taxRule)
          throw new HttpError(
            409,
            "Admin must approve the standard tax configuration for this custom exhibition country",
          );
        const eventCountryCode = customEvent?.countryCode ?? event!.countryCode;
        let treatment;
        try {
          treatment = deriveDocumentTaxTreatment({
            eventCountryCode,
            taxType: taxRule.taxType,
            rateBasisPoints: taxRule.rateBasisPoints,
            companyGstin: profile?.gstin,
            clientGstin: client.gstin,
          });
        } catch (error) {
          throw new HttpError(
            409,
            error instanceof Error
              ? error.message
              : "Unable to determine GST treatment",
          );
        }
        const built = buildDraftSnapshot({ ...draft, taxRuleId: taxRule.id, taxable: treatment.taxable, taxRatePercent: treatment.ratePercent, taxLabel: treatment.label });
        if (built.input.type !== "PROFORMA") throw new HttpError(400, "One-time correction is available only for Proforma Invoices");
        const taxBreakdown = calculateTaxBreakdown(
          built.totals.taxablePaise,
          treatment,
        );
        const taxPaise = taxBreakdown.reduce(
          (sum, item) => sum + item.amountPaise,
          0n,
        );
        const totalPaise = built.totals.taxablePaise + taxPaise;
        if (built.totals.tdsPaise > totalPaise)
          throw new HttpError(400, "TDS cannot exceed the gross PI value");
        const netReceivablePaise = totalPaise - built.totals.tdsPaise;
        const original = document.snapshot as Prisma.JsonObject | null;
        if (!original || !document.number || !document.issuedAt)
          throw new HttpError(
            409,
            "The original immutable issued snapshot is incomplete",
          );
        const dateAtVenue = (value: Date) =>
          new Intl.DateTimeFormat("en-CA", {
            timeZone: event!.timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(value);
        const eventSnapshot = customEvent ?? {
          name: event!.name,
          edition: event!.edition ?? "",
          startsOn: dateAtVenue(event!.startsOn),
          endsOn: dateAtVenue(event!.endsOn),
          venue: event!.venue,
          city: event!.city,
          stateRegion: event!.stateRegion ?? "",
          countryCode: event!.countryCode,
        };
        const correctedSnapshot = {
          ...built.snapshot,
          type: "PROFORMA",
          currency: client.defaultCurrency,
          number: document.number,
          issuedAt: original.issuedAt ?? document.issuedAt.toISOString(),
          organization: original.organization,
          client: {
            legalName: client.legalName,
            billingAddress: client.billingAddress,
            gstin: client.gstin,
          },
          event: eventSnapshot,
          stallNumber: built.input.stallNumber,
          taxLabel: treatment.label,
          taxRatePercent: treatment.ratePercent,
          taxable: treatment.taxable,
          taxablePaise: built.totals.taxablePaise.toString(),
          taxPaise: taxPaise.toString(),
          totalPaise: totalPaise.toString(),
          tdsPaise: built.totals.tdsPaise.toString(),
          netReceivablePaise: netReceivablePaise.toString(),
          taxBreakdown: taxBreakdown.map((item) => ({
            ...item,
            amountPaise: item.amountPaise.toString(),
          })),
          notes: documentNotes({
            eventCountryCode,
            taxable: treatment.taxable,
            userNotes: built.input.notes,
          }),
          internalRevision: 2,
        } satisfies Prisma.JsonObject;
        const correctedAt = new Date();
        const updated = await tx.financialDocument.updateMany({
          where: {
            id: document.id,
            version: document.version,
            correctionVersion: 0,
            correctedSnapshot: { equals: Prisma.DbNull },
          },
          data: {
            clientId: client.id,
            eventId: event?.id ?? null,
            customEvent: customEvent ?? Prisma.DbNull,
            stallNumber: built.input.stallNumber || null,
            piCategory: built.input.piCategory,
            currency: client.defaultCurrency,
            taxablePaise: built.totals.taxablePaise,
            taxPaise,
            totalPaise,
            tdsPaise: built.totals.tdsPaise,
            netReceivablePaise,
            taxRuleId: taxRule.id,
            correctedSnapshot,
            correctionVersion: 1,
            correctionReason,
            correctedAt,
            correctedById: actor.id,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1)
          throw new HttpError(
            409,
            "This PI changed while it was being corrected. Reload and check its latest state.",
          );
        await tx.auditEvent.create({
          data: {
            organizationId: actor.organizationId,
            actorId: actor.id,
            action: "PROFORMA_CORRECTED",
            entityType: "FinancialDocument",
            entityId: document.id,
            metadata: {
              number: document.number,
              reason: correctionReason,
              originalSnapshotPreserved: true,
              correctionVersion: 1,
              before: {
                clientId: document.clientId,
                eventId: document.eventId,
                totalPaise: document.totalPaise.toString(),
                tdsPaise: document.tdsPaise.toString(),
                netReceivablePaise: document.netReceivablePaise.toString(),
              },
              after: {
                clientId: client.id,
                eventId: event?.id ?? null,
                customExhibition: Boolean(customEvent),
                totalPaise: totalPaise.toString(),
                tdsPaise: built.totals.tdsPaise.toString(),
                netReceivablePaise: netReceivablePaise.toString(),
              },
            },
          },
        });
        return {
          id: document.id,
          number: document.number,
          correctionVersion: 1,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 20_000,
      },
    ),
  );
}
