export type IssuanceInput = {
  documentType: "PROFORMA" | "TAX_INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE" | "RECEIPT" | "GST_RECEIPT_VOUCHER";
  seriesConfigured: boolean;
  taxConfigApproved: boolean;
  snapshotComplete: boolean;
  paymentVerified?: boolean;
  einvoiceStatus?: "UNRESOLVED" | "NOT_APPLICABLE" | "REQUIRED_PENDING" | "VERIFIED";
  irn?: string | null;
  acknowledgementNumber?: string | null;
  signedQrPayload?: string | null;
};

export function issuanceBlockers(input: IssuanceInput): string[] {
  const blockers: string[] = [];
  if (!input.seriesConfigured) blockers.push("NUMBER_SERIES_UNCONFIGURED");
  if (!input.taxConfigApproved) blockers.push("TAX_CONFIGURATION_UNAPPROVED");
  if (!input.snapshotComplete) blockers.push("SNAPSHOT_INCOMPLETE");
  if ((input.documentType === "RECEIPT" || input.documentType === "GST_RECEIPT_VOUCHER") && !input.paymentVerified) blockers.push("PAYMENT_NOT_VERIFIED");
  if (["TAX_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"].includes(input.documentType)) {
    if (!input.einvoiceStatus || input.einvoiceStatus === "UNRESOLVED") blockers.push("EINVOICE_APPLICABILITY_UNRESOLVED");
    if (input.einvoiceStatus === "REQUIRED_PENDING") blockers.push("EINVOICE_REQUIRED_PENDING");
    if (input.einvoiceStatus === "VERIFIED" && (!input.irn || !input.acknowledgementNumber || !input.signedQrPayload)) blockers.push("EINVOICE_EVIDENCE_INCOMPLETE");
  }
  return blockers;
}

export function assertIssuable(input: IssuanceInput) {
  const blockers = issuanceBlockers(input);
  if (blockers.length) throw new Error(`Issuance blocked: ${blockers.join(", ")}`);
}
