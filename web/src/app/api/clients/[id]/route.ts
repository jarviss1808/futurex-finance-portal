import { z } from "zod";
import { db } from "@/lib/db";
import { errorResponse, HttpError } from "@/lib/http";
import { parseAdditionalEmails } from "@/lib/email/recipients";
import { clientRelationshipScope } from "@/lib/security/policy";
import { assertSameOrigin } from "@/lib/security/request";
import { currentActor } from "@/lib/security/session";
import { COUNTRY_CODES, dialCodeForCountry } from "@/lib/clients/countries";
import { confirmedGstData, gstVerificationInput } from "@/lib/clients/gst-verification";
import { isValidGstin } from "@/lib/clients/gstin";
import { normalizeCompanyName } from "@/lib/clients/identity";

const input = z.object({
  billingAddress: z.string().trim().min(5).max(1000),
  gstin: z.string().trim().toUpperCase().refine((value) => !value || isValidGstin(value), "GSTIN format or checksum is invalid").optional().or(z.literal("")),
  contactName: z.string().trim().min(1).max(150),
  contactEmail: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  additionalEmails: z.unknown().optional(),
  contactPhone: z.string().trim().min(5).max(30),
  privateNotes: z.string().trim().max(2000).optional(),
  countryCode: z.string().trim().toUpperCase().refine((value) => COUNTRY_CODES.has(value), "Select a valid country"),
  defaultCurrency: z.enum(["INR", "USD"]),
  contactDialCode: z.string().trim().regex(/^\+[1-9][0-9]{0,3}$/).optional(),
}).and(gstVerificationInput);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await currentActor();
    if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await context.params;
    const value = input.parse(await request.json());
    const existing = await db.client.findFirst({ where: { id, ...clientRelationshipScope(actor) }, select: { id: true, gstin: true, billingAddress: true } });
    if (!existing) throw new HttpError(404, "Client not found");
    let verification;
    try { verification = confirmedGstData(actor.id, value.gstin || "", value); } catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "Invalid GST verification confirmation"); }
    const gstChanged = (existing.gstin ?? "") !== (value.gstin ?? "");
    const addressChanged = existing.billingAddress !== value.billingAddress;
    const client = await db.$transaction(async (tx) => {
      const updated = await tx.client.update({ where: { id }, data: { billingAddress: verification?.billingAddress ?? value.billingAddress, gstin: value.gstin || null, countryCode: value.countryCode, defaultCurrency: value.defaultCurrency, contactName: value.contactName, contactEmail: value.contactEmail, additionalEmails: parseAdditionalEmails(value.additionalEmails), contactDialCode: value.contactDialCode ?? dialCodeForCountry(value.countryCode), contactPhone: value.contactPhone, privateNotes: value.privateNotes || null, ...(verification ? { legalName: verification.legalName, normalizedName: normalizeCompanyName(verification.legalName), gstTradeName: verification.gstTradeName, gstRegistrationStatus: verification.gstRegistrationStatus, gstVerificationSource: verification.gstVerificationSource, gstVerifiedAt: verification.gstVerifiedAt, gstVerifiedById: verification.gstVerifiedById } : (gstChanged || addressChanged) ? { gstTradeName: null, gstRegistrationStatus: null, gstVerificationSource: null, gstVerifiedAt: null, gstVerifiedById: null } : {}) } });
      await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: verification ? "CLIENT_GST_VERIFIED" : "CLIENT_RELATIONSHIP_UPDATED", entityType: "Client", entityId: id, metadata: { gstVerified: Boolean(verification), verificationRevoked: !verification && (gstChanged || addressChanged), ...(verification ? { verificationSource: verification.gstVerificationSource } : {}) } } });
      return updated;
    });
    return Response.json(client);
  } catch (error) { return errorResponse(error); }
}
