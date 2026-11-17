import type { DocumentSnapshot } from "@/lib/documents/generate";
import { formatCurrencyMinor } from "@/lib/finance/money";
import { escapeHtml, renderEmail, renderText, type BankBlock, type SummaryRow } from "./layout";

export type EventInfo = { name: string; edition?: string | null; startsOn?: string; endsOn?: string; venue?: string; city?: string; countryCode?: string } | null | undefined;
export type SenderInfo = { companyName: string; accountsEmail: string; bank?: BankBlock | null };

const b = (value: string) => `<b>${escapeHtml(value)}</b>`;
const money = (value: bigint, currency: string) => formatCurrencyMinor(value, currency);
const day = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));
const greetingFor = (name?: string | null) => `Dear ${escapeHtml(name?.trim() || "Sir/Madam")},`;

export function describeEvent(event: EventInfo) {
  if (!event) return { title: "", details: "" };
  const title = `${event.name}${event.edition ? ` (${event.edition})` : ""}`;
  const dates = event.startsOn && event.endsOn ? (event.startsOn === event.endsOn ? day(event.startsOn) : `${day(event.startsOn)} – ${day(event.endsOn)}`) : "";
  const place = [event.venue, event.city].filter(Boolean).join(", ");
  return { title, details: [dates, place].filter(Boolean).join(", ") };
}

function signature(sender: SenderInfo, managerName?: string | null) {
  return { name: "Accounts Team", lines: [escapeHtml(sender.companyName), escapeHtml(sender.accountsEmail), ...(managerName ? [`Your Futurex contact: ${escapeHtml(managerName)}`] : [])] };
}

function compose(input: Parameters<typeof renderEmail>[0]) {
  return { html: renderEmail(input), text: renderText(input) };
}

export type ReminderInput = {
  contactName?: string | null; clientName: string; piNumber: string; piDate: string; currency: string;
  totalPaise: bigint; approvedPaise: bigint; outstandingPaise: bigint; event?: EventInfo; managerName?: string | null;
  message?: string; sender: SenderInfo; asOf: string;
};

export function buildPaymentReminderEmail(input: ReminderInput) {
  const event = describeEvent(input.event);
  const balance = money(input.outstandingPaise, input.currency);
  const subject = `Payment reminder – ${input.piNumber}${event.title ? ` | ${input.event!.name}` : ""} | Balance due ${balance}`;
  const summary: SummaryRow[] = [
    { label: "Proforma Invoice", value: input.piNumber },
    { label: "PI date", value: day(input.piDate) },
    ...(event.title ? [{ label: "Exhibition", value: event.title }] : []),
    { label: "PI amount", value: money(input.totalPaise, input.currency) },
    { label: "Received so far", value: money(input.approvedPaise, input.currency) },
    { label: "Balance due", value: `${balance} (${input.currency})`, strong: true, tone: "danger" },
  ];
  const content = compose({
    preheader: `Balance of ${balance} due against ${input.piNumber}. Bank details inside.`,
    title: "Friendly payment reminder",
    greeting: greetingFor(input.contactName),
    intro: [
      `Greetings from Futurex, and thank you for being part of ${event.title ? b(event.title) : "our exhibition"}${event.details ? ` (${escapeHtml(event.details)})` : ""}.`,
      `As per our records, a balance of ${b(balance)} is due against Proforma Invoice ${b(input.piNumber)} issued to ${b(input.clientName)}. We request you to kindly arrange the payment at the earliest so that we can complete your participation formalities smoothly.`,
    ],
    summary,
    note: input.message?.trim() || undefined,
    bank: input.sender.bank ?? undefined,
    closing: [
      "If you have already made this payment, please reply to this email with the UTR / transaction reference and payment date so that we can update our records — and please ignore this reminder.",
      `For any query, simply reply to this email${input.managerName ? ` or contact ${b(input.managerName)}` : ""}. We are happy to help.`,
    ],
    signature: signature(input.sender, input.managerName),
    footer: `This reminder is for ${escapeHtml(input.clientName)} regarding ${escapeHtml(input.piNumber)}. The received amount includes only payments confirmed by our accounts team as of ${escapeHtml(input.asOf)}.`,
  });
  return { subject, ...content };
}

export type ConfirmationInput = {
  contactName?: string | null; clientName: string; piNumber: string; currency: string; amountPaise: bigint; paidOn: string; mode: string; reference?: string | null;
  tdsPaise?: bigint;
  totalPaise: bigint; approvedPaise: bigint; outstandingPaise: bigint; event?: EventInfo; managerName?: string | null; sender: SenderInfo;
};

export function buildPaymentConfirmationEmail(input: ConfirmationInput) {
  const event = describeEvent(input.event);
  const amount = money(input.amountPaise, input.currency);
  const settled = input.outstandingPaise <= 0n;
  const subject = `Payment received – ${amount} against ${input.piNumber}`;
  const content = compose({
    preheader: `We have received ${amount} against ${input.piNumber}. ${settled ? "Your PI is fully paid." : `Balance due ${money(input.outstandingPaise, input.currency)}.`}`,
    title: "Thank you — payment received",
    greeting: greetingFor(input.contactName),
    intro: [`We are pleased to confirm receipt of your payment of ${b(amount)} against Proforma Invoice ${b(input.piNumber)}${event.title ? ` for ${b(event.title)}` : ""}. Thank you!`],
    summary: [
      { label: "Amount received", value: amount, strong: true, tone: "success" },
      ...(input.tdsPaise && input.tdsPaise > 0n ? [{ label: "TDS deducted (not cash received)", value: money(input.tdsPaise, input.currency) }] : []),
      { label: "Payment date", value: day(input.paidOn) },
      { label: "Payment mode", value: input.mode },
      ...(input.reference ? [{ label: "UTR / reference", value: input.reference }] : []),
      { label: "PI amount", value: money(input.totalPaise, input.currency) },
      { label: "Total received to date", value: money(input.approvedPaise, input.currency) },
      { label: settled ? "Status" : "Balance due", value: settled ? "Fully paid" : money(input.outstandingPaise, input.currency), strong: true, tone: settled ? "success" : "danger" },
    ],
    bank: settled ? undefined : input.sender.bank ?? undefined,
    closing: [settled ? "Your Proforma Invoice is now fully paid. We look forward to welcoming you at the exhibition." : "The remaining balance can be paid to the bank account shown above. Please share the UTR after payment so that we can update our records quickly."],
    signature: signature(input.sender, input.managerName),
    footer: `Payment acknowledgement for ${escapeHtml(input.clientName)} regarding ${escapeHtml(input.piNumber)}. This email is not a tax invoice.`,
  });
  return { subject, ...content };
}

export function buildDocumentEmail(snapshot: DocumentSnapshot, contactName?: string | null, managerName?: string | null) {
  const event = describeEvent(snapshot.event);
  const total = `${formatCurrencyMinor(snapshot.totalPaise, snapshot.currency)} (${snapshot.currency})`;
  const subject = `${snapshot.title} ${snapshot.number}${snapshot.event?.name ? ` – ${snapshot.event.name}` : ""}`;
  const bank = snapshot.bankDetails?.accountNumber ? { accountName: snapshot.companyName, bankName: snapshot.bankDetails.bankName, branch: snapshot.bankDetails.branch, accountNumber: snapshot.bankDetails.accountNumber, ifsc: snapshot.bankDetails.ifsc, swift: snapshot.bankDetails.swift } : undefined;
  const content = compose({
    preheader: `${snapshot.title} ${snapshot.number} for ${total} is attached.`,
    title: `${snapshot.title} ${snapshot.number}`,
    greeting: greetingFor(contactName),
    intro: [`Thank you for choosing to participate${event.title ? ` in ${b(event.title)}` : ""}. Please find attached ${b(`${snapshot.title} ${snapshot.number}`)} dated ${escapeHtml(day(snapshot.issueDate))}.`],
    summary: [
      { label: snapshot.title, value: snapshot.number },
      ...(event.title ? [{ label: "Exhibition", value: event.title }] : []),
      ...(event.details ? [{ label: "Dates & venue", value: event.details }] : []),
      { label: "Total amount", value: total, strong: true },
    ],
    bank,
    closing: ["Please review the attached PDF and let us know if any correction is required. After making the payment, kindly reply with the UTR / transaction reference so that we can confirm it quickly."],
    signature: { name: "Accounts Team", lines: [escapeHtml(snapshot.companyName), ...(snapshot.accountsEmail ? [escapeHtml(snapshot.accountsEmail)] : []), ...(managerName ? [`Your Futurex contact: ${escapeHtml(managerName)}`] : [])] },
    footer: `Sent to ${escapeHtml(snapshot.customerName)} regarding ${escapeHtml(snapshot.number)}.`,
  });
  return { subject, ...content };
}
