import { z } from "zod";
import { db } from "@/lib/db";
import { errorResponse, HttpError } from "@/lib/http";
import { listVisibleClients } from "@/lib/clients/repository";
import { assertSameOrigin } from "@/lib/security/request";
import { currentActor } from "@/lib/security/session";
import { companyCanonicalKey, defaultCurrencyForCountry, normalizeCompanyName } from "@/lib/clients/identity";
import { parseAdditionalEmails } from "@/lib/email/recipients";
import { COUNTRY_CODES, dialCodeForCountry } from "@/lib/clients/countries";
import { confirmedGstData, gstVerificationInput } from "@/lib/clients/gst-verification";
import { isValidGstin } from "@/lib/clients/gstin";

const clientInput = z.object({ legalName: z.string().trim().min(2).max(200), billingAddress: z.string().trim().min(5).max(1000), countryCode: z.string().trim().toUpperCase().refine((value) => COUNTRY_CODES.has(value), "Select a valid country"), defaultCurrency: z.enum(["INR", "USD"]).optional(), gstin: z.string().trim().toUpperCase().refine((value) => !value || isValidGstin(value), "GSTIN format or checksum is invalid").optional().or(z.literal("")), contactName: z.string().trim().min(1).max(150), contactEmail: z.string().email().max(254).transform((value) => value.toLowerCase()), additionalEmails: z.unknown().optional(), contactDialCode: z.string().trim().regex(/^\+[1-9][0-9]{0,3}$/).optional(), contactPhone: z.string().trim().min(5).max(30), privateNotes: z.string().trim().max(2000).optional() }).and(gstVerificationInput);

export async function GET() {
  const actor = await currentActor();
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await listVisibleClients(actor), { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await currentActor();
    if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const input = clientInput.parse(await request.json());
    let verification;
    try { verification = confirmedGstData(actor.id, input.gstin || "", input); } catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "Invalid GST verification confirmation"); }
    const legalName = verification?.legalName ?? input.legalName;
    const billingAddress = verification?.billingAddress ?? input.billingAddress;
    const normalizedName = normalizeCompanyName(legalName);
    const defaultCurrency = input.defaultCurrency ?? defaultCurrencyForCountry(input.countryCode);
    const contactDialCode = input.contactDialCode ?? dialCodeForCountry(input.countryCode);
    const canonicalKey = companyCanonicalKey({ legalName, countryCode: input.countryCode, gstin: input.gstin });
    const client = await db.$transaction(async (tx) => {
      const master = await tx.companyMaster.upsert({
        where: { organizationId_canonicalKey: { organizationId: actor.organizationId, canonicalKey } },
        create: { organizationId: actor.organizationId, canonicalKey, legalName, normalizedName, countryCode: input.countryCode, billingAddress, gstin: input.gstin || null, defaultCurrency },
        update: {},
      });
      const relationship = await tx.client.create({ data: { organizationId: actor.organizationId, ownerId: actor.id, masterId: master.id, legalName, normalizedName, billingAddress, gstin: input.gstin || null, countryCode: input.countryCode, defaultCurrency, contactName: input.contactName, contactEmail: input.contactEmail, additionalEmails: parseAdditionalEmails(input.additionalEmails), contactDialCode, contactPhone: input.contactPhone, privateNotes: input.privateNotes || null, ...(verification ?? {}) } });
      await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: "CLIENT_RELATIONSHIP_CREATED", entityType: "Client", entityId: relationship.id, metadata: { companyMasterId: master.id, gstVerified: Boolean(verification), ...(verification ? { verificationSource: verification.gstVerificationSource } : {}) } } });
      return relationship;
    });
    return Response.json(client, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
