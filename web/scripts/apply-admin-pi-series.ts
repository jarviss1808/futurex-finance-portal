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
  if (!actor) throw new Error("Active Admin not found");

  const result = await db.$transaction(async (tx) => {
    const series = await tx.documentSeries.upsert({
      where: { organizationId_documentType_financialYear_prefix_suffix: { organizationId: organization.id, documentType: "PROFORMA", financialYear: "26-27", prefix: "FUT/PI/26-27/", suffix: "" } },
      create: { organizationId: organization.id, documentType: "PROFORMA", financialYear: "26-27", prefix: "FUT/PI/26-27/", suffix: "", padding: 3, nextNumber: 1n, configured: true },
      update: { padding: 3, configured: true },
    });
    const renamed = await tx.user.updateMany({ where: { organizationId: organization.id, name: "Initial Administrator", role: "ADMIN" }, data: { name: "Admin" } });
    await tx.auditEvent.create({ data: { organizationId: organization.id, actorId: actor.id, action: "ADMIN_PI_SERIES_APPROVED", entityType: "DocumentSeries", entityId: series.id, metadata: { prefix: series.prefix, financialYear: series.financialYear, nextNumber: series.nextNumber.toString(), renamedAdministrators: renamed.count } } });
    return { series, renamed: renamed.count };
  });
  console.log(`PI series enabled at ${result.series.prefix}${result.series.nextNumber.toString().padStart(result.series.padding, "0")}; renamed ${result.renamed} administrator(s).`);
} finally {
  await db.$disconnect();
}
