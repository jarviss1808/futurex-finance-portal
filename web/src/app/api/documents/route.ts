import { currentActor } from "@/lib/security/session";
import {
  calculateTaxBreakdown,
  deriveDocumentTaxTreatment,
} from "@/lib/tax/document-treatment";
import { listVisibleDocuments } from "@/lib/documents/repository";
import { documentListJson } from "@/lib/documents/serialize";
import { buildDraftSnapshot } from "@/lib/documents/input";
import { findVisibleClient } from "@/lib/clients/repository";
import { db } from "@/lib/db";
import { errorResponse, HttpError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security/request";
import { documentScope, requireCapability } from "@/lib/security/policy";
import { documentNotes } from "@/lib/documents/foreign-venue-note";
import {
  customTaxPolicy,
  parseCustomEvent,
} from "@/lib/documents/custom-event";
import { Prisma } from "@/generated/prisma/client";

export async function GET() {
  const actor = await currentActor();
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await listVisibleDocuments(actor);
  return Response.json(rows.map(documentListJson), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await currentActor();
    if (!actor)
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    const raw = await request.json();
    const custom = raw?.eventSource === "CUSTOM";
    const customEvent = custom ? parseCustomEvent(raw?.customEvent) : null;
    const eventId = typeof raw?.eventId === "string" ? raw.eventId : "";
    const event = custom
      ? null
      : await db.event.findFirst({
          where: { id: eventId, organizationId: actor.organizationId },
          include: { taxRule: true },
        });
    if (!custom && !event) throw new HttpError(404, "Exhibition not found");
    if (event && (!event.taxConfigApproved || !event.taxRule?.approved))
      throw new HttpError(
        409,
        "Admin must assign and approve this exhibition's tax configuration",
      );
    const clientId = typeof raw?.clientId === "string" ? raw.clientId : "";
    const [client, profile] = await Promise.all([
      findVisibleClient(actor, clientId),
      db.companyProfile.findUnique({
        where: { organizationId: actor.organizationId },
      }),
    ]);
    if (!client) throw new HttpError(404, "Client not found");
    const policy = customEvent
      ? customTaxPolicy(customEvent.countryCode)
      : null;
    const taxRule =
      event?.taxRule ??
      (await db.taxRule.findFirst({
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
    const built = buildDraftSnapshot({
      ...raw,
      taxRuleId: taxRule.id,
      taxable: treatment.taxable,
      taxRatePercent: treatment.ratePercent,
      taxLabel: treatment.label,
    });
    const taxBreakdown = calculateTaxBreakdown(
      built.totals.taxablePaise,
      treatment,
    );
    const taxPaise = taxBreakdown.reduce(
      (sum, item) => sum + item.amountPaise,
      0n,
    );
    const totals = {
      ...built.totals,
      taxPaise,
      totalPaise: built.totals.taxablePaise + taxPaise,
    };
    if (["TAX_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"].includes(built.input.type))
      requireCapability(actor, "ISSUE_TAX_INVOICE");
    let sourceDocumentId: string | null = null;
    if (["CREDIT_NOTE", "DEBIT_NOTE"].includes(built.input.type)) {
      const source = await db.financialDocument.findFirst({
        where: {
          id: built.input.sourceDocumentId,
          type: "TAX_INVOICE",
          status: "ISSUED",
          ...documentScope(actor),
        },
      });
      if (
        !source ||
        !event ||
        source.clientId !== client.id ||
        source.eventId !== event.id
      )
        throw new HttpError(
          409,
          "Credit/debit notes must reference an accessible issued Tax Invoice for the same client and exhibition",
        );
      sourceDocumentId = source.id;
    }
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
    const snapshot = {
      ...built.snapshot,
      currency: client.defaultCurrency,
      notes: documentNotes({
        eventCountryCode,
        taxable: treatment.taxable,
        userNotes: built.input.notes,
      }),
      taxPaise: totals.taxPaise.toString(),
      totalPaise: totals.totalPaise.toString(),
      tdsPaise: built.totals.tdsPaise.toString(),
      netReceivablePaise: built.totals.netReceivablePaise.toString(),
      taxBreakdown: taxBreakdown.map((item) => ({
        ...item,
        amountPaise: item.amountPaise.toString(),
      })),
      event: eventSnapshot,
    };
    const document = await db.financialDocument.create({
      data: {
        organizationId: actor.organizationId,
        ownerId: actor.id,
        clientId: client.id,
        eventId: event?.id ?? null,
        customEvent: customEvent ?? Prisma.DbNull,
        stallNumber: built.input.stallNumber || null,
        sourceDocumentId,
        type: built.input.type,
        piCategory:
          built.input.type === "PROFORMA" ? built.input.piCategory : null,
        currency: client.defaultCurrency,
        taxablePaise: totals.taxablePaise,
        taxPaise: totals.taxPaise,
        totalPaise: totals.totalPaise,
        tdsPaise: built.totals.tdsPaise,
        netReceivablePaise: built.totals.netReceivablePaise,
        taxRuleId: taxRule.id,
        snapshot,
      },
    });
    await db.auditEvent.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.id,
        action: "DOCUMENT_DRAFT_CREATED",
        entityType: "FinancialDocument",
        entityId: document.id,
        metadata: { type: document.type },
      },
    });
    return Response.json(
      {
        ...document,
        taxablePaise: document.taxablePaise.toString(),
        taxPaise: document.taxPaise.toString(),
        totalPaise: document.totalPaise.toString(),
        tdsPaise: document.tdsPaise.toString(),
        netReceivablePaise: document.netReceivablePaise.toString(),
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
