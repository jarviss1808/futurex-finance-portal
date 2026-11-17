import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { formatCurrencyMinor, minorUnitsToDecimal } from "@/lib/finance/money";
import { formatIstDate, istDateString } from "@/lib/reports/period";
import type { Actor } from "@/lib/security/policy";
import { PAYMENT_EVENT_LABEL, PAYMENT_STATUS_LABEL, paymentModeLabel } from "./modes";
import type { listVisiblePayments } from "./repository";

export type HistoryItem = { label: string; at: string; actor: string; detail?: string };
export type PaymentView = {
  id: string; status: string; statusLabel: string; amount: string; amountDecimal: string; currency: string;
  tds: string; tdsDecimal: string;
  paidOn: string; paidOnLabel: string; submittedLabel: string; mode: string; modeLabel: string; reference: string; remarks: string;
  reviewNote: string; reviewer: string; reviewedLabel: string; submissionCount: number; reporter: string;
  pi: { id: string; number: string; client: string; event: string; owner: string; status: string } | null;
  proofs: Array<{ id: string; fileName: string }>; history: HistoryItem[]; receiptId: string | null;
  canEdit: boolean; canReview: boolean;
};

type Row = Awaited<ReturnType<typeof listVisiblePayments>>[number];
type Event = { action: string; at: Date; actor: string; metadata: Prisma.JsonValue };

const at = (value: Date) => `${formatIstDate(value)}, ${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(value)}`;

function describe(event: Event, currency: string): string | undefined {
  const meta = (event.metadata ?? {}) as Record<string, unknown>;
  const money = (value: unknown) => typeof value === "string" && /^-?\d+$/.test(value) ? formatCurrencyMinor(BigInt(value), currency) : undefined;
  if (event.action === "PAYMENT_REJECTED") return typeof meta.note === "string" ? `Reason: ${meta.note}` : undefined;
  if (event.action === "PAYMENT_WITHDRAWN") return typeof meta.reason === "string" ? `Reason: ${meta.reason}` : undefined;
  if (event.action === "PAYMENT_SUBMITTED") return [money(meta.amountPaise), money(meta.tdsPaise) && meta.tdsPaise !== "0" ? `TDS ${money(meta.tdsPaise)}` : undefined, typeof meta.reference === "string" ? `UTR ${meta.reference}` : undefined].filter(Boolean).join(" · ") || undefined;
  if (event.action === "PAYMENT_CORRECTED" || event.action === "PAYMENT_RESUBMITTED") {
    const before = (meta.before ?? {}) as Record<string, unknown>, after = (meta.after ?? {}) as Record<string, unknown>;
    const changes: string[] = [];
    if (before.amountPaise !== after.amountPaise) changes.push(`amount ${money(before.amountPaise)} → ${money(after.amountPaise)}`);
    if (before.tdsPaise !== after.tdsPaise) changes.push(`TDS ${money(before.tdsPaise)} → ${money(after.tdsPaise)}`);
    if (before.paidOn !== after.paidOn) changes.push(`date ${before.paidOn} → ${after.paidOn}`);
    if (before.mode !== after.mode) changes.push(`mode ${paymentModeLabel(String(before.mode))} → ${paymentModeLabel(String(after.mode))}`);
    if (before.reference !== after.reference) changes.push(`UTR ${before.reference ?? "—"} → ${after.reference ?? "—"}`);
    if (before.remarks !== after.remarks) changes.push("remarks updated");
    if (meta.proofAttached) changes.push("new proof attached");
    return changes.length ? `Changed ${changes.join("; ")}` : "Resubmitted without changes";
  }
  if (event.action === "PAYMENT_VERIFIED") return "Counted in collections; outstanding balance reduced";
  return undefined;
}

export function toPaymentView(actor: Actor, payment: Row, events: Event[] = []): PaymentView {
  const document = payment.allocations[0]?.document;
  const tdsPaise = payment.allocations.reduce((sum, allocation) => sum + allocation.tdsPaise, 0n);
  const editable = payment.status === "PENDING" || payment.status === "REJECTED";
  return {
    id: payment.id, status: payment.status, statusLabel: PAYMENT_STATUS_LABEL[payment.status] ?? payment.status,
    amount: formatCurrencyMinor(payment.amountPaise, payment.currency), amountDecimal: minorUnitsToDecimal(payment.amountPaise), currency: payment.currency,
    tds: formatCurrencyMinor(tdsPaise, payment.currency), tdsDecimal: minorUnitsToDecimal(tdsPaise),
    paidOn: istDateString(payment.paidOn), paidOnLabel: formatIstDate(payment.paidOn), submittedLabel: at(payment.submittedAt),
    mode: payment.mode, modeLabel: paymentModeLabel(payment.mode), reference: payment.reference ?? "", remarks: payment.remarks ?? "",
    reviewNote: payment.reviewNote ?? "", reviewer: payment.verifiedBy?.name ?? "", reviewedLabel: payment.reviewedAt ? at(payment.reviewedAt) : "",
    submissionCount: payment.submissionCount, reporter: payment.reportedBy.name,
    pi: document ? { id: document.id, number: document.number ?? "Draft", client: document.client.legalName, event: document.event?.name ?? "—", owner: document.owner.name, status: document.status } : null,
    proofs: payment.proofs.map((proof) => ({ id: proof.id, fileName: proof.fileName })),
    history: events.map((event) => ({ label: PAYMENT_EVENT_LABEL[event.action] ?? event.action.replaceAll("_", " ").toLowerCase(), at: at(event.at), actor: event.actor, detail: describe(event, payment.currency) })),
    receiptId: payment.receipt?.id ?? null,
    canEdit: editable && (actor.role === "ADMIN" || payment.reportedById === actor.id),
    canReview: payment.status === "PENDING" && actor.role === "ADMIN",
  };
}
