// Shared by server validation and client forms; keep free of server-only imports.
export const PAYMENT_MODES = [
  { value: "NEFT", label: "NEFT" },
  { value: "RTGS", label: "RTGS" },
  { value: "IMPS", label: "IMPS" },
  { value: "UPI", label: "UPI" },
  { value: "CHEQUE", label: "Cheque / DD" },
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "INTERNATIONAL_WIRE", label: "International wire (SWIFT)" },
  { value: "BANK_TRANSFER", label: "Other bank transfer" },
  { value: "OTHER", label: "Other" },
] as const;

export type PaymentMode = (typeof PAYMENT_MODES)[number]["value"];
export const PAYMENT_MODE_VALUES = PAYMENT_MODES.map((mode) => mode.value) as [PaymentMode, ...PaymentMode[]];
export const REFERENCE_OPTIONAL_MODES: readonly string[] = ["CASH", "OTHER"];

export function paymentModeLabel(value: string) {
  return PAYMENT_MODES.find((mode) => mode.value === value)?.label ?? value.replaceAll("_", " ");
}

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending approval",
  VERIFIED: "Approved",
  REJECTED: "Declined",
  WITHDRAWN: "Withdrawn",
  REVERSED: "Reversed",
  REFUNDED: "Refunded",
};

export const PAYMENT_EVENT_LABEL: Record<string, string> = {
  PAYMENT_RECORDED: "Submitted",
  PAYMENT_SUBMITTED: "Submitted for approval",
  PAYMENT_CORRECTED: "Details corrected",
  PAYMENT_RESUBMITTED: "Corrected and resubmitted",
  PAYMENT_VERIFIED: "Approved",
  PAYMENT_REJECTED: "Declined",
  PAYMENT_WITHDRAWN: "Withdrawn",
  PAYMENT_PROOF_ADDED: "Proof attached",
  PAYMENT_CONFIRMATION_EMAILED: "Confirmation emailed to client",
};
