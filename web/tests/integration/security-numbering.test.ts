import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { clientRelationshipScope, documentScope } from "@/lib/security/policy";
import { allocateDocumentNumber } from "@/lib/documents/numbering";

const url = process.env.TEST_DATABASE_URL!;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, connectionTimeoutMillis: 5_000 }) });
const marker = `it-${Date.now()}-${Math.random().toString(36).slice(2)}`;
let orgA = "", orgB = "", userA = "", userB = "", documentB = "", seriesId = "", masterId = "";

beforeAll(async () => {
  const a = await db.organization.create({ data: { name: `${marker}-A` } });
  const b = await db.organization.create({ data: { name: `${marker}-B` } });
  orgA = a.id; orgB = b.id;
  const [ua, ub] = await Promise.all([
    db.user.create({ data: { organizationId: orgA, email: `${marker}-a@test.invalid`, name: "Employee A", passwordHash: "test-only", role: "EMPLOYEE" } }),
    db.user.create({ data: { organizationId: orgA, email: `${marker}-b@test.invalid`, name: "Employee B", passwordHash: "test-only", role: "EMPLOYEE" } }),
  ]);
  userA = ua.id; userB = ub.id;
  const master = await db.companyMaster.create({ data: { organizationId: orgA, canonicalKey: `NAME:${marker}:IN`, legalName: "Shared Company", normalizedName: marker.toUpperCase(), countryCode: "IN", billingAddress: "Shared registered address", defaultCurrency: "INR" } });
  masterId = master.id;
  const [, clientB] = await Promise.all([
    db.client.create({ data: { organizationId: orgA, ownerId: userA, masterId, legalName: "Shared Company", normalizedName: marker.toUpperCase(), billingAddress: "A billing address", countryCode: "IN", defaultCurrency: "INR", contactName: "Private A", contactEmail: "a@test.invalid", contactPhone: "11111" } }),
    db.client.create({ data: { organizationId: orgA, ownerId: userB, masterId, legalName: "Shared Company", normalizedName: marker.toUpperCase(), billingAddress: "B billing address", countryCode: "IN", defaultCurrency: "INR", contactName: "Private B", contactEmail: "b@test.invalid", contactPhone: "22222" } }),
  ]);
  const event = await db.event.create({ data: { organizationId: orgA, name: "Synthetic Event", startsOn: new Date("2030-01-01"), endsOn: new Date("2030-01-02"), venue: "Test", city: "Test", countryCode: "IN", taxConfigApproved: true } });
  const doc = await db.financialDocument.create({ data: { organizationId: orgA, ownerId: userB, clientId: clientB.id, eventId: event.id, type: "PROFORMA", taxablePaise: 100n, taxPaise: 18n, totalPaise: 118n, netReceivablePaise: 118n, snapshot: { test: true } } });
  documentB = doc.id;
  const series = await db.documentSeries.create({ data: { organizationId: orgA, documentType: "PROFORMA", financialYear: "29-30", prefix: `${marker}/`, nextNumber: 1n, padding: 3, configured: true } });
  seriesId = series.id;
});

afterAll(async () => {
  await db.financialDocument.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await db.documentSeries.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await db.client.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await db.companyMaster.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await db.event.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await db.auditEvent.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await db.user.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await db.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await db.$disconnect();
});

describe("real PostgreSQL isolation and concurrency", () => {
  it("employee A query cannot return employee B private document", async () => {
    const row = await db.financialDocument.findFirst({ where: { id: documentB, ...documentScope({ id: userA, organizationId: orgA, role: "EMPLOYEE" }) } });
    expect(row).toBeNull();
  });

  it("two employees can share a company master without exposing private contacts", async () => {
    const rows = await db.client.findMany({ where: { masterId, ...clientRelationshipScope({ id: userA, organizationId: orgA, role: "EMPLOYEE" }) }, select: { ownerId: true, contactName: true, contactEmail: true } });
    expect(rows).toEqual([{ ownerId: userA, contactName: "Private A", contactEmail: "a@test.invalid" }]);
  });

  it("accountant scope remains inside its organization", async () => {
    const row = await db.financialDocument.findFirst({ where: { id: documentB, ...documentScope({ id: "accountant", organizationId: orgB, role: "ACCOUNTANT" }) } });
    expect(row).toBeNull();
  });

  it("allocates unique sequential numbers under concurrency", async () => {
    const series = { prefix: `${marker}/`, suffix: "", padding: 3, financialYear: "29-30", configured: true };
    const values = await Promise.all(Array.from({ length: 25 }, () => db.$transaction((tx) => allocateDocumentNumber(tx as unknown as Parameters<typeof allocateDocumentNumber>[0], seriesId, series))));
    expect(new Set(values).size).toBe(25);
    expect(values.sort()).toEqual(Array.from({ length: 25 }, (_, i) => `${marker}/${String(i + 1).padStart(3, "0")}`));
  });
});
