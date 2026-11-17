import { z } from "zod";
import { isValidGstin, OFFICIAL_GST_SEARCH_URL } from "./gstin";

export const gstVerificationInput = z.object({
  confirmGstVerification: z.union([z.boolean(), z.string()]).optional().transform((value) => value === true || value === "on" || value === "true"),
  gstTradeName: z.string().trim().max(200).optional(),
  gstRegistrationStatus: z.string().trim().max(100).optional(),
  gstVerifiedLegalName: z.string().trim().max(200).optional(),
  gstVerifiedAddress: z.string().trim().max(1000).optional(),
});

export function confirmedGstData(actorId: string, gstin: string, input: z.infer<typeof gstVerificationInput>) {
  if (!input.confirmGstVerification) return null;
  if (!isValidGstin(gstin)) throw new Error("Enter a valid GSTIN with a correct checksum before confirming verification");
  if (!input.gstVerifiedLegalName || !input.gstRegistrationStatus || !input.gstVerifiedAddress) throw new Error("Enter the legal name, registration status and address shown on the official GST portal");
  return { legalName: input.gstVerifiedLegalName, billingAddress: input.gstVerifiedAddress, gstTradeName: input.gstTradeName || null, gstRegistrationStatus: input.gstRegistrationStatus, gstVerificationSource: OFFICIAL_GST_SEARCH_URL, gstVerifiedAt: new Date(), gstVerifiedById: actorId };
}
