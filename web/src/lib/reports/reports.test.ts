import { describe, expect, it } from "vitest";
import { financialYearLabel, inPeriod, istDateString, resolvePeriod } from "./period";
import { collectionPercent, formatTotals, piBalance } from "./balances";
import { groupTable, paymentTable, piRegisterTable } from "./tables";
import { tableToCsv, tableToPdf, tableToXlsx } from "./export";
import type { PiRow } from "./sales";
import { documentListJson } from "@/lib/documents/serialize";

// 16 Nov 2026 20:00 IST (a Monday) = 14:30 UTC
const now = new Date("2026-11-16T14:30:00.000Z");
const range = (preset: string) => { const period = resolvePeriod(preset, undefined, undefined, now); return [period.fromDate, period.toDate]; };

describe("reporting periods (IST)", () => {
  it("resolves calendar presets on the India calendar", () => {
    expect(range("today")).toEqual(["2026-11-16", "2026-11-16"]);
    expect(range("yesterday")).toEqual(["2026-11-15", "2026-11-15"]);
    expect(range("this_week")).toEqual(["2026-11-16", "2026-11-22"]);
    expect(range("last_week")).toEqual(["2026-11-09", "2026-11-15"]);
    expect(range("this_month")).toEqual(["2026-11-01", "2026-11-30"]);
    expect(range("last_month")).toEqual(["2026-10-01", "2026-10-31"]);
    expect(range("this_quarter")).toEqual(["2026-10-01", "2026-12-31"]);
    expect(range("last_quarter")).toEqual(["2026-07-01", "2026-09-30"]);
    expect(range("this_half")).toEqual(["2026-10-01", "2027-03-31"]);
    expect(range("last_half")).toEqual(["2026-04-01", "2026-09-30"]);
    expect(range("this_fy")).toEqual(["2026-04-01", "2027-03-31"]);
    expect(range("last_fy")).toEqual(["2025-04-01", "2026-03-31"]);
    expect(range("this_year")).toEqual(["2026-01-01", "2026-12-31"]);
  });
  it("uses IST midnight boundaries, not UTC", () => {
    const today = resolvePeriod("today", undefined, undefined, now);
    expect(today.from!.toISOString()).toBe("2026-11-15T18:30:00.000Z");
    expect(inPeriod(new Date("2026-11-15T19:00:00.000Z"), today)).toBe(true); // 00:30 IST on the 16th
    expect(inPeriod(new Date("2026-11-15T18:00:00.000Z"), today)).toBe(false); // 23:30 IST on the 15th
    expect(istDateString(new Date("2026-11-15T19:00:00.000Z"))).toBe("2026-11-16");
  });
  it("handles January for quarter and FY rollover", () => {
    const january = new Date("2027-01-10T06:00:00.000Z");
    expect(resolvePeriod("this_fy", undefined, undefined, january).fromDate).toBe("2026-04-01");
    expect(resolvePeriod("last_quarter", undefined, undefined, january).fromDate).toBe("2026-10-01");
    expect(resolvePeriod("this_half", undefined, undefined, january).fromDate).toBe("2026-10-01");
    expect(financialYearLabel(january)).toBe("26-27");
    expect(financialYearLabel(new Date("2027-04-01T00:00:00.000Z"))).toBe("27-28");
  });
  it("accepts inclusive custom ranges, swaps reversed dates and rejects invalid ones", () => {
    const custom = resolvePeriod("custom", "2026-10-31", "2026-10-01", now);
    expect([custom.fromDate, custom.toDate]).toEqual(["2026-10-01", "2026-10-31"]);
    expect(inPeriod(new Date("2026-10-31T18:00:00.000Z"), custom)).toBe(true); // 23:30 IST 31 Oct
    expect(resolvePeriod("custom", "2026-02-30", undefined, now).preset).toBe("this_month");
    expect(resolvePeriod("all", undefined, undefined, now).from).toBeUndefined();
  });
});

describe("document list JSON", () => {
  it("serialises bigint money so GET /api/documents cannot crash (regression)", () => {
    const row = documentListJson({ id: "d1", status: "ISSUED", totalPaise: 9_558_000n, tdsPaise: 558_000n, netReceivablePaise: 9_000_000n, allocations: [{ amountPaise: 2_000_000n, payment: { status: "VERIFIED" } }, { amountPaise: 100n, payment: { status: "PENDING" } }] });
    expect(JSON.parse(JSON.stringify(row))).toEqual({ id: "d1", status: "ISSUED", totalPaise: "9558000", tdsPaise: "558000", netReceivablePaise: "9000000", approvedPaise: "2000000", outstandingPaise: "7000000" });
  });
});

describe("official PI balances", () => {
  it("counts only approved payments against outstanding", () => {
    const balance = piBalance(10_000_000n, "ISSUED", [{ amountPaise: 2_000_000n, status: "VERIFIED" }, { amountPaise: 3_000_000n, status: "VERIFIED" }, { amountPaise: 1_000_000n, status: "PENDING" }, { amountPaise: 500_000n, status: "REJECTED" }, { amountPaise: 700_000n, status: "WITHDRAWN" }]);
    expect(balance).toEqual({ approved: 5_000_000n, pending: 1_000_000n, declined: 500_000n, outstanding: 5_000_000n, state: "PARTIAL" });
    expect(piBalance(100n, "ISSUED", []).state).toBe("UNPAID");
    expect(piBalance(100n, "ISSUED", [{ amountPaise: 100n, status: "VERIFIED" }]).state).toBe("PAID");
    expect(piBalance(100n, "VOIDED", []).outstanding).toBe(0n);
  });
  it("never mixes currencies and computes collection share with integers", () => {
    expect(formatTotals(new Map([["USD", 50_000n], ["INR", 9_558_000n]]))).toBe("₹95,580.00 · US$500.00");
    expect(formatTotals(new Map())).toBe("₹0.00");
    expect(collectionPercent(5_000_000n, 10_000_000n)).toBe("50.0%");
    expect(collectionPercent(1n, 3n)).toBe("33.3%");
    expect(collectionPercent(0n, 0n)).toBe("—");
  });
});

const row = (overrides: Partial<PiRow>): PiRow => ({ id: "d1", number: "FUT/PI/26-27/001", issuedAt: new Date("2026-11-10T06:00:00.000Z"), status: "ISSUED", currency: "INR", category: "EXHIBITION_PARTICIPATION", area: "9", rate: 900_000n, taxable: 8_100_000n, cgst: 0n, sgst: 0n, igst: 1_458_000n, tax: 1_458_000n, total: 10_000_000n, tds: 0n, confirmedTds: 0n, pendingTds: 0n, netReceivable: 10_000_000n, approved: 5_000_000n, pending: 0n, declined: 0n, outstanding: 5_000_000n, state: "PARTIAL", owner: { id: "u1", name: "Employee A" }, client: { id: "c1", legalName: "=HYPERLINK(\"x\") Ltd", contactName: null, contactEmail: null, additionalEmails: [] }, event: { id: "e1", name: "India Battery Show", venue: "Auto Cluster", city: "Pune", countryCode: "IN" }, ...overrides });

describe("report tables and exports", () => {
  const register = piRegisterTable([row({}), row({ id: "d2", number: "FUT/PI/26-27/002", total: 5_000n, approved: 0n, outstanding: 5_000n, state: "UNPAID", client: { id: "c2", legalName: "Société Générale – ಕನ್ನಡ", contactName: null, contactEmail: null, additionalEmails: [] } })], { title: "PI register", subtitle: "This month" });
  it("totals money per currency", () => {
    expect(register.footer).toHaveLength(1);
    expect(register.footer[0].value).toBe(10_005_000n);
    expect(register.footer[0].outstanding).toBe(5_005_000n);
  });
  it("exports CSV with decimal amounts and spreadsheet-formula protection", () => {
    const csv = tableToCsv(register);
    expect(csv).toContain('"100000.00"');
    expect(csv).toContain(`"'=HYPERLINK(""x"") Ltd"`);
    expect(csv.startsWith("﻿")).toBe(true);
  });
  it("builds XLSX and PDF files even with non-Latin client names", async () => {
    const xlsx = await tableToXlsx(register);
    expect(xlsx.subarray(0, 2).toString()).toBe("PK");
    const pdf = await tableToPdf(register);
    expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe("%PDF-");
  });
  it("creates one row per currency in grouped summaries", () => {
    const table = groupTable([{ key: "u1", label: "Employee A", count: 3, value: new Map([["INR", 100n], ["USD", 50n]]), tds: new Map([["INR", 10n]]), confirmedTds: new Map([["INR", 8n]]), netReceivable: new Map([["INR", 90n], ["USD", 50n]]), approved: new Map([["INR", 50n]]), pending: new Map(), outstanding: new Map([["INR", 40n], ["USD", 50n]]) }], "employee", { title: "t", subtitle: "s" });
    expect(table.rows.map((item) => [item.currency, item.count, item.collected])).toEqual([["INR", 3, "55.5%"], ["USD", 0, "0.0%"]]);
  });
  it("labels payment statuses and resubmissions", () => {
    const table = paymentTable([{ paidOn: new Date(), submittedAt: new Date(), reviewedAt: null, status: "PENDING", mode: "NEFT", reference: "UTR1", remarks: null, reviewNote: null, amountPaise: 100n, currency: "INR", submissionCount: 2, reportedBy: { name: "A" }, verifiedBy: null, allocations: [{ tdsPaise: 10n, document: { number: "PI-1", owner: { name: "A" }, client: { legalName: "C" }, event: { name: "E" } } }] }], { title: "Payments", subtitle: "" });
    expect(table.rows[0].status).toBe("Pending approval (resubmitted ×1)");
    expect(table.rows[0].tds).toBe(10n);
  });
});
