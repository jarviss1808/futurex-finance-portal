import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5_000 }) });

try {
  const organization = process.env.FUTUREX_ORGANIZATION_ID
    ? await db.organization.findUnique({ where: { id: process.env.FUTUREX_ORGANIZATION_ID } })
    : await db.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!organization) throw new Error("No organization exists");
  const actor = await db.user.findFirst({ where: { organizationId: organization.id, role: "ADMIN", active: true }, orderBy: { createdAt: "asc" } });
  if (!actor) throw new Error("An active Admin is required to record the approval audit event");

  const counts = await db.$transaction(async (tx) => {
    const indiaRule = await tx.taxRule.upsert({
      where: { organizationId_name: { organizationId: organization.id, name: "India venue GST 18%" } },
      create: { organizationId: organization.id, name: "India venue GST 18%", taxType: "GST", rateBasisPoints: 1800, placeOfSupplyRule: "Exhibition venue is in India; apply 18% GST under management-approved exhibition policy.", exemptionNote: "Generic GST treatment; accountant must configure IGST or CGST/SGST split before statutory Tax Invoice issuance where applicable.", approved: true },
      update: { taxType: "GST", rateBasisPoints: 1800, placeOfSupplyRule: "Exhibition venue is in India; apply 18% GST under management-approved exhibition policy.", exemptionNote: "Generic GST treatment; accountant must configure IGST or CGST/SGST split before statutory Tax Invoice issuance where applicable.", approved: true },
    });
    const foreignRule = await tx.taxRule.upsert({
      where: { organizationId_name: { organizationId: organization.id, name: "Foreign venue - no GST" } },
      create: { organizationId: organization.id, name: "Foreign venue - no GST", taxType: "NO_GST", rateBasisPoints: 0, placeOfSupplyRule: "Exhibition venue is outside India; do not charge GST under management-approved exhibition policy.", exemptionNote: "Management instruction dated 2026-11-14. Accountant must confirm the statutory classification before Tax Invoice issuance.", approved: true },
      update: { taxType: "NO_GST", rateBasisPoints: 0, placeOfSupplyRule: "Exhibition venue is outside India; do not charge GST under management-approved exhibition policy.", exemptionNote: "Management instruction dated 2026-11-14. Accountant must confirm the statutory classification before Tax Invoice issuance.", approved: true },
    });
    const india = await tx.event.updateMany({ where: { organizationId: organization.id, countryCode: { equals: "IN", mode: "insensitive" } }, data: { taxRuleId: indiaRule.id, taxConfigApproved: true } });
    const foreign = await tx.event.updateMany({ where: { organizationId: organization.id, NOT: { countryCode: { equals: "IN", mode: "insensitive" } } }, data: { taxRuleId: foreignRule.id, taxConfigApproved: true } });
    await tx.companyProfile.updateMany({ where: { organizationId: organization.id }, data: { logoStorageKey: "branding/futurex-logo.png" } });
    await tx.auditEvent.create({ data: { organizationId: organization.id, actorId: actor.id, action: "EXHIBITION_TAX_POLICY_BULK_APPROVED", entityType: "Organization", entityId: organization.id, metadata: { indiaRuleId: indiaRule.id, indiaEvents: india.count, foreignRuleId: foreignRule.id, foreignEvents: foreign.count, policy: "India venue 18% GST; venue outside India no GST", effectiveInstructionDate: "2026-11-14" } } });
    return { india: india.count, foreign: foreign.count };
  });
  console.log(`Approved tax policy for ${counts.india} India exhibitions and ${counts.foreign} foreign exhibitions.`);
} finally {
  await db.$disconnect();
}
