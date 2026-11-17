export type Actor = { id: string; organizationId: string; role: "EMPLOYEE" | "PAYMENT_VERIFIER" | "TAX_INVOICE_ISSUER" | "ACCOUNTANT" | "ADMIN" };
export type OwnedRecord = { organizationId: string; ownerId: string; sharedWith?: readonly string[] };

export function canReadFinancialRecord(actor: Actor, record: OwnedRecord): boolean {
  if (actor.organizationId !== record.organizationId) return false;
  if (actor.role === "ACCOUNTANT" || actor.role === "ADMIN") return true;
  return actor.id === record.ownerId || Boolean(record.sharedWith?.includes(actor.id));
}

export function documentScope(actor: Actor) {
  const organizationId = actor.organizationId;
  if (actor.role === "ACCOUNTANT" || actor.role === "ADMIN") return { organizationId };
  return { organizationId, OR: [{ ownerId: actor.id }, { shares: { some: { userId: actor.id } } }] };
}

export function clientRelationshipScope(actor: Actor) {
  return actor.role === "ACCOUNTANT" || actor.role === "ADMIN"
    ? { organizationId: actor.organizationId }
    : { organizationId: actor.organizationId, ownerId: actor.id };
}

export function requireCapability(actor: Actor, capability: "VERIFY_PAYMENT" | "ISSUE_RECEIPT" | "ISSUE_TAX_INVOICE" | "ADMINISTER") {
  const allowed = capability === "VERIFY_PAYMENT"
    ? ["PAYMENT_VERIFIER", "ACCOUNTANT", "ADMIN"]
    : capability === "ISSUE_RECEIPT"
      ? ["PAYMENT_VERIFIER", "ACCOUNTANT", "ADMIN"]
    : capability === "ISSUE_TAX_INVOICE"
      ? ["TAX_INVOICE_ISSUER", "ACCOUNTANT", "ADMIN"]
      : ["ADMIN"];
  if (!allowed.includes(actor.role)) throw new Error("Forbidden");
}

export function requireEinvoiceDecisionAuthority(actor: Actor, status: "UNRESOLVED" | "NOT_APPLICABLE" | "REQUIRED_PENDING" | "VERIFIED") {
  if (status !== "UNRESOLVED" && actor.role !== "ACCOUNTANT" && actor.role !== "ADMIN") throw new Error("Forbidden");
}
