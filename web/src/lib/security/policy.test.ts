import { describe, expect, it } from "vitest";
import { canReadFinancialRecord, documentScope, requireCapability, requireEinvoiceDecisionAuthority, type Actor } from "./policy";

const employeeA: Actor = { id: "a", organizationId: "org", role: "EMPLOYEE" };
const employeeB: Actor = { id: "b", organizationId: "org", role: "EMPLOYEE" };

describe("employee data isolation", () => {
  it("denies another employee's private record and cross-organization access", () => {
    expect(canReadFinancialRecord(employeeA, { organizationId: "org", ownerId: employeeB.id })).toBe(false);
    expect(canReadFinancialRecord({ ...employeeA, role: "ADMIN" }, { organizationId: "other", ownerId: employeeA.id })).toBe(false);
  });
  it("permits ownership, explicit sharing, and company-wide finance roles", () => {
    expect(canReadFinancialRecord(employeeA, { organizationId: "org", ownerId: "a" })).toBe(true);
    expect(canReadFinancialRecord(employeeA, { organizationId: "org", ownerId: "b", sharedWith: ["a"] })).toBe(true);
    expect(canReadFinancialRecord({ ...employeeA, role: "ACCOUNTANT" }, { organizationId: "org", ownerId: "b" })).toBe(true);
  });
  it("builds a database scope that cannot omit organization ownership", () => {
    expect(documentScope(employeeA)).toEqual({ organizationId: "org", OR: [{ ownerId: "a" }, { shares: { some: { userId: "a" } } }] });
  });
  it("keeps specialized capabilities default-deny", () => {
    expect(() => requireCapability(employeeA, "VERIFY_PAYMENT")).toThrow("Forbidden");
    expect(() => requireCapability(employeeA, "ISSUE_RECEIPT")).toThrow("Forbidden");
    expect(() => requireCapability({ ...employeeA, role: "PAYMENT_VERIFIER" }, "VERIFY_PAYMENT")).not.toThrow();
    expect(() => requireCapability({ ...employeeA, role: "PAYMENT_VERIFIER" }, "ISSUE_RECEIPT")).not.toThrow();
  });
  it("reserves e-invoice applicability and evidence decisions for finance authorities", () => {
    expect(() => requireEinvoiceDecisionAuthority({ ...employeeA, role: "TAX_INVOICE_ISSUER" }, "NOT_APPLICABLE")).toThrow("Forbidden");
    expect(() => requireEinvoiceDecisionAuthority({ ...employeeA, role: "ACCOUNTANT" }, "NOT_APPLICABLE")).not.toThrow();
    expect(() => requireEinvoiceDecisionAuthority({ ...employeeA, role: "ADMIN" }, "VERIFIED")).not.toThrow();
  });
});
