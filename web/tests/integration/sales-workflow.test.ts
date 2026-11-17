import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { allocateDocumentNumber } from "@/lib/documents/numbering";
import { withTransactionRetry } from "@/lib/transactions";
import type { Actor } from "@/lib/security/policy";
import { correctPayment, recordPayment, rejectPayment, verifyPayment, withdrawPayment } from "@/lib/payments/service";
import { listVisiblePayments } from "@/lib/payments/repository";
import { saveSeries } from "@/lib/documents/series";
import { voidProforma } from "@/lib/documents/void";
import { loadPiRows } from "@/lib/reports/sales";
import { correctProforma } from "@/lib/documents/correction";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!, connectionTimeoutMillis: 5_000 }) });
const marker = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let org = "", seriesId = "", documentId = "", secondDocumentId = "", clientId = "", eventId = "", taxRuleId = "";
let admin: Actor, employeeA: Actor, employeeB: Actor;
const series = { prefix: `${marker}/`, suffix: "", padding: 3, financialYear: "26-27", configured: true };

beforeAll(async () => {
  org = (await db.organization.create({ data: { name: marker } })).id;
  const make = (name: string, role: "ADMIN" | "EMPLOYEE") => db.user.create({ data: { organizationId: org, email: `${marker}-${name}@test.invalid`, name, passwordHash: "test-only", role } });
  const [a, ea, eb] = await Promise.all([make("admin", "ADMIN"), make("employee-a", "EMPLOYEE"), make("employee-b", "EMPLOYEE")]);
  admin = { id: a.id, organizationId: org, role: "ADMIN" };
  employeeA = { id: ea.id, organizationId: org, role: "EMPLOYEE" };
  employeeB = { id: eb.id, organizationId: org, role: "EMPLOYEE" };
  const master = await db.companyMaster.create({ data: { organizationId: org, canonicalKey: `NAME:${marker}`, legalName: "Client X", normalizedName: marker.toUpperCase(), countryCode: "IN", billingAddress: "Delhi", defaultCurrency: "INR" } });
  const client = await db.client.create({ data: { organizationId: org, ownerId: ea.id, masterId: master.id, legalName: "Client X", normalizedName: marker.toUpperCase(), billingAddress: "Delhi" } });
  clientId = client.id;
  taxRuleId = (await db.taxRule.create({ data: { organizationId: org, name: `${marker}-outside`, taxType: "NO_GST", rateBasisPoints: 0, placeOfSupplyRule: "EVENT_VENUE", approved: true } })).id;
  const event = await db.event.create({ data: { organizationId: org, name: "Exhibition 1", startsOn: new Date("2030-01-01"), endsOn: new Date("2030-01-03"), venue: "Hall", city: "Kathmandu", countryCode: "NP", taxConfigApproved: true, taxRuleId } });
  eventId = event.id;
  seriesId = (await db.documentSeries.create({ data: { organizationId: org, documentType: "PROFORMA", financialYear: "26-27", prefix: series.prefix, nextNumber: 1n, padding: 3, configured: true } })).id;
  const pi = (number: string, tdsPaise = 0n) => db.financialDocument.create({ data: { organizationId: org, ownerId: ea.id, clientId: client.id, eventId: event.id, seriesId, type: "PROFORMA", status: "ISSUED", number, issuedAt: new Date(), taxablePaise: 10_000_000n, taxPaise: 0n, totalPaise: 10_000_000n, tdsPaise, netReceivablePaise: 10_000_000n - tdsPaise, snapshot: { test: true } } });
  documentId = (await pi(`${marker}/PI-A`, 500_000n)).id; // ₹1,00,000 gross, ₹5,000 TDS, ₹95,000 net
  secondDocumentId = (await pi(`${marker}/PI-B`)).id;
});

afterAll(async () => {
  await db.auditEvent.deleteMany({ where: { organizationId: org } });
  await db.paymentProof.deleteMany({ where: { payment: { organizationId: org } } });
  await db.paymentAllocation.deleteMany({ where: { payment: { organizationId: org } } });
  await db.payment.deleteMany({ where: { organizationId: org } });
  await db.financialDocument.deleteMany({ where: { organizationId: org } });
  await db.documentSeries.deleteMany({ where: { organizationId: org } });
  await db.client.deleteMany({ where: { organizationId: org } });
  await db.companyMaster.deleteMany({ where: { organizationId: org } });
  await db.event.deleteMany({ where: { organizationId: org } });
  await db.taxRule.deleteMany({ where: { organizationId: org } });
  await db.user.deleteMany({ where: { organizationId: org } });
  await db.organization.deleteMany({ where: { id: org } });
  await db.$disconnect();
});

describe("one-time immutable PI correction", () => {
  const correctionInput = (tdsAmount = "1000") => ({ type: "PROFORMA", piCategory: "EXHIBITION_PARTICIPATION", purpose: "SPACE", clientId, eventId, taxRuleId, taxable: false, taxRatePercent: "0", taxLabel: "GST Not Applicable", tdsAmount, discount: "0", otherCharges: "0", notes: "Corrected commercial terms", lines: [{ description: "Exhibition space", classification: "998596", unit: "SQM", quantity: "9", unitPrice: "5000" }] });

  it("keeps the exact PI number and immutable original while using a separate corrected snapshot", async () => {
    const issuedAt = new Date();
    const originalSnapshot = { schemaVersion: 3, type: "PROFORMA", number: `${marker}/CORRECT-1`, issuedAt: issuedAt.toISOString(), organization: { legalName: "Futurex" }, totalPaise: "10000000" };
    const document = await db.financialDocument.create({ data: { organizationId: org, ownerId: employeeA.id, clientId, eventId, seriesId, type: "PROFORMA", status: "ISSUED", number: `${marker}/CORRECT-1`, issuedAt, currency: "INR", taxablePaise: 10_000_000n, taxPaise: 0n, totalPaise: 10_000_000n, netReceivablePaise: 10_000_000n, snapshot: originalSnapshot } });
    const result = await correctProforma(employeeA, document.id, { ...correctionInput(), correctionReason: "Customer corrected the booked space" });
    expect(result).toEqual({ id: document.id, number: `${marker}/CORRECT-1`, correctionVersion: 1 });
    const stored = await db.financialDocument.findUniqueOrThrow({ where: { id: document.id } });
    expect(stored.snapshot).toEqual(originalSnapshot);
    expect(stored.correctionVersion).toBe(1);
    expect(stored.number).toBe(`${marker}/CORRECT-1`);
    expect([stored.totalPaise, stored.tdsPaise, stored.netReceivablePaise]).toEqual([4_500_000n, 100_000n, 4_400_000n]);
    expect(stored.correctedSnapshot).toMatchObject({ number: `${marker}/CORRECT-1`, internalRevision: 2, totalPaise: "4500000", tdsPaise: "100000", netReceivablePaise: "4400000" });
    await expect(correctProforma(employeeA, document.id, { ...correctionInput("0"), correctionReason: "Trying another correction" })).rejects.toThrow(/already used/);
    await expect(correctProforma(employeeB, document.id, { ...correctionInput("0"), correctionReason: "Unauthorized correction attempt" })).rejects.toThrow(/not found/);
  });

  it("blocks correction while a payment is pending", async () => {
    const issuedAt = new Date();
    const document = await db.financialDocument.create({ data: { organizationId: org, ownerId: employeeA.id, clientId, eventId, seriesId, type: "PROFORMA", status: "ISSUED", number: `${marker}/CORRECT-BLOCKED`, issuedAt, taxablePaise: 100_000n, taxPaise: 0n, totalPaise: 100_000n, netReceivablePaise: 100_000n, snapshot: { number: `${marker}/CORRECT-BLOCKED`, issuedAt: issuedAt.toISOString(), organization: { legalName: "Futurex" } } } });
    const payment = await recordPayment(employeeA, { documentId: document.id, amount: "100", paidOn: today, mode: "CASH" });
    await expect(correctProforma(admin, document.id, { ...correctionInput("0"), correctionReason: "Correction must wait for payment" })).rejects.toThrow(/pending or approved payments/);
    await withdrawPayment(employeeA, payment.id, "Remove test payment");
  });
});

const today = new Date().toISOString().slice(0, 10);

describe("PI numbering under real concurrency", () => {
  it("gives 25 simultaneous SERIALIZABLE issuers unique, gap-free numbers (conflicts retried)", async () => {
    const values = await Promise.all(Array.from({ length: 25 }, () => withTransactionRetry(() => db.$transaction((tx) => allocateDocumentNumber(tx as unknown as Parameters<typeof allocateDocumentNumber>[0], seriesId, series), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15_000, timeout: 20_000 }), 15)));
    expect(new Set(values).size).toBe(25);
    expect(values.sort()).toEqual(Array.from({ length: 25 }, (_, index) => `${marker}/${String(index + 1).padStart(3, "0")}`));
  });

  it("does not consume a number when issuance rolls back", async () => {
    await expect(db.$transaction(async (tx) => { await allocateDocumentNumber(tx as unknown as Parameters<typeof allocateDocumentNumber>[0], seriesId, series); throw new Error("signature missing"); })).rejects.toThrow("signature missing");
    const next = await db.$transaction((tx) => allocateDocumentNumber(tx as unknown as Parameters<typeof allocateDocumentNumber>[0], seriesId, series));
    expect(next).toBe(`${marker}/026`);
  });

  it("lets Admin move the counter forward but never back onto an issued number", async () => {
    await db.financialDocument.update({ where: { id: secondDocumentId }, data: { number: `${marker}/026` } });
    await expect(saveSeries(admin, { nextNumber: "20" }, seriesId)).rejects.toThrow(/already been issued/);
    await expect(saveSeries(employeeA, { nextNumber: "500" }, seriesId)).rejects.toThrow("Forbidden");
    const saved = await saveSeries(admin, { nextNumber: "500" }, seriesId);
    expect(saved.nextPreview).toBe(`${marker}/500`);
    expect(await db.$transaction((tx) => allocateDocumentNumber(tx as unknown as Parameters<typeof allocateDocumentNumber>[0], seriesId, series))).toBe(`${marker}/500`);
  });
});

describe("employee payment entry and Admin verification", () => {
  let paymentId = "";

  it("records a pending entry that does not change the outstanding balance", async () => {
    const payment = await recordPayment(employeeA, { documentId, amount: "20000", tdsAmount: "1000", paidOn: today, mode: "NEFT", reference: `${marker}-UTR1`, remarks: "First instalment" });
    paymentId = payment.id;
    expect(payment.status).toBe("PENDING");
    const [row] = (await loadPiRows(employeeA, {})).filter((item) => item.id === documentId);
    expect(row.approved).toBe(0n);
    expect(row.pending).toBe(2_000_000n);
    expect([row.outstanding, row.pendingTds, row.confirmedTds]).toEqual([9_500_000n, 100_000n, 0n]);
  });

  it("keeps the entry private to its employee and lets only Admin review it", async () => {
    expect((await listVisiblePayments(employeeB)).some((item) => item.id === paymentId)).toBe(false);
    expect((await loadPiRows(employeeB, {})).some((item) => item.id === documentId)).toBe(false);
    await expect(correctPayment(employeeB, paymentId, { amount: "1", paidOn: today, mode: "CASH" })).rejects.toThrow(/not found/);
    await expect(recordPayment(employeeB, { documentId, amount: "1", paidOn: today, mode: "CASH" })).rejects.toThrow(/not found/);
    await expect(verifyPayment(employeeA, paymentId)).rejects.toThrow("Forbidden");
  });

  it("requires a UTR for bank transfers and blocks amounts above the open balance", async () => {
    await expect(recordPayment(employeeA, { documentId, amount: "100", paidOn: today, mode: "UPI" })).rejects.toThrow(/UTR/);
    await expect(recordPayment(employeeA, { documentId, amount: "75000.01", paidOn: today, mode: "CASH" })).rejects.toThrow(/at most ₹75,000.00/);
    await expect(recordPayment(employeeA, { documentId, amount: "100", tdsAmount: "4000.01", paidOn: today, mode: "CASH" })).rejects.toThrow(/at most ₹4,000.00/);
    await expect(recordPayment(employeeA, { documentId, amount: "20000", paidOn: today, mode: "NEFT", reference: `${marker}-UTR1` })).rejects.toThrow(/already recorded/);
  });

  it("supports decline → correct & resubmit → approve, keeping the full history", async () => {
    await expect(rejectPayment(admin, paymentId, "x")).rejects.toThrow();
    await rejectPayment(admin, paymentId, "Not received in Axis Bank");
    let stored = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect([stored.status, stored.reviewNote]).toEqual(["REJECTED", "Not received in Axis Bank"]);

    const resubmitted = await correctPayment(employeeA, paymentId, { amount: "20000", tdsAmount: "1500", paidOn: today, mode: "RTGS", reference: `${marker}-UTR1-FIXED` });
    expect(resubmitted).toMatchObject({ status: "PENDING", resubmitted: true });
    stored = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect([stored.status, stored.submissionCount, stored.reviewNote, stored.reference]).toEqual(["PENDING", 2, null, `${marker}-UTR1-FIXED`]);
    expect((await db.paymentAllocation.findFirstOrThrow({ where: { paymentId } })).tdsPaise).toBe(150_000n);

    await verifyPayment(admin, paymentId);
    await expect(verifyPayment(admin, paymentId)).rejects.toThrow(/no longer pending/);
    const [row] = (await loadPiRows(employeeA, {})).filter((item) => item.id === documentId);
    expect([row.approved, row.pending, row.outstanding, row.confirmedTds, row.pendingTds, row.state]).toEqual([2_000_000n, 0n, 7_500_000n, 150_000n, 0n, "PARTIAL"]);

    const history = await db.auditEvent.findMany({ where: { organizationId: org, entityType: "Payment", entityId: paymentId }, orderBy: { createdAt: "asc" }, select: { action: true } });
    expect(history.map((event) => event.action)).toEqual(["PAYMENT_SUBMITTED", "PAYMENT_REJECTED", "PAYMENT_RESUBMITTED", "PAYMENT_VERIFIED"]);
  });

  it("locks approved entries and blocks cancelling a PI that has approved payments", async () => {
    await expect(correctPayment(employeeA, paymentId, { amount: "1", paidOn: today, mode: "CASH" })).rejects.toThrow(/pending approval or declined/);
    await expect(voidProforma(employeeA, documentId, "Client withdrew")).rejects.toThrow(/approved payments/);
  });

  it("lets the employee withdraw a wrong entry, and cancel a PI only once nothing is pending", async () => {
    const wrong = await recordPayment(employeeA, { documentId: secondDocumentId, amount: "500", paidOn: today, mode: "CASH" });
    await expect(voidProforma(employeeA, secondDocumentId, "Duplicate PI")).rejects.toThrow(/awaiting approval/);
    await expect(withdrawPayment(employeeB, wrong.id, "not mine")).rejects.toThrow(/not found/);
    await withdrawPayment(employeeA, wrong.id, "Recorded against the wrong PI");
    await expect(voidProforma(employeeB, secondDocumentId, "Not mine")).rejects.toThrow(/not found/);
    await voidProforma(employeeA, secondDocumentId, "Duplicate PI");
    const cancelled = await db.financialDocument.findUniqueOrThrow({ where: { id: secondDocumentId } });
    expect([cancelled.status, cancelled.number]).toEqual(["VOIDED", `${marker}/026`]);
    await expect(recordPayment(employeeA, { documentId: secondDocumentId, amount: "1", paidOn: today, mode: "CASH" })).rejects.toThrow(/only against an issued PI/);
  });
});
