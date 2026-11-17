import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { UPCOMING_EXHIBITIONS } from "../src/lib/events/upcoming";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5_000 }) });

const organization = process.env.FUTUREX_ORGANIZATION_ID
  ? await db.organization.findUnique({ where: { id: process.env.FUTUREX_ORGANIZATION_ID } })
  : await db.organization.findFirst({ orderBy: { createdAt: "asc" } });
if (!organization) throw new Error("No organization exists. Bootstrap an administrator first.");

for (const event of UPCOMING_EXHIBITIONS) {
  const data = { ...event, type: "OWNED" as const, startsOn: new Date(`${event.startsOn}T00:00:00.000Z`), endsOn: new Date(`${event.endsOn}T00:00:00.000Z`), posterImageKey: "futurex-upcoming-exhibitions-2026-2028" };
  await db.event.upsert({ where: { organizationId_canonicalKey: { organizationId: organization.id, canonicalKey: event.canonicalKey } }, create: { ...data, organizationId: organization.id }, update: data });
}
console.log(`Imported ${UPCOMING_EXHIBITIONS.length} owned exhibitions into ${organization.name}.`);
await db.$disconnect();
