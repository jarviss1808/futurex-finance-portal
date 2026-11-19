import "server-only";

import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";

import { db } from "@/lib/db";

import { HttpError } from "@/lib/http";

import { documentScope, requireCapability, type Actor } from "@/lib/security/policy";

import { generatePdf } from "@/lib/documents/generate";

import { toOutputSnapshot } from "@/lib/documents/output";

import { effectiveSnapshot } from "@/lib/documents/effective";

import { piBalance } from "@/lib/reports/balances";

import { formatIstDate, istDateString } from "@/lib/reports/period";

import { paymentModeLabel } from "@/lib/payments/modes";

import { clientDocumentRecipients } from "./recipients";

import { deliverMail, type MailAttachment } from "./sendgrid";

import { buildDocumentEmail, buildPaymentConfirmationEmail, buildPaymentReminderEmail, type SenderInfo } from "./template";



export const REMINDER_COOLDOWN_HOURS = 20;

const MAX_BATCH = 300;



export async function senderInfo(organizationId: string): Promise<SenderInfo> {

  const [profile, organization] = await Promise.all([

    db.companyProfile.findUnique({ where: { organizationId } }),

    db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } }),

  ]);

  const bank = profile?.bankDetails as { bankName?: string; accountNumber?: string; branch?: string; ifsc?: string; swift?: string } | null;

  const companyName = profile?.legalName ?? organization.name;

  return {

    companyName,

    accountsEmail: profile?.accountsEmail ?? process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER ?? "",

    bank: bank?.accountNumber && bank.ifsc ? { accountName: companyName, bankName: bank.bankName ?? "", branch: bank.branch, accountNumber: bank.accountNumber, ifsc: bank.ifsc, swift: bank.swift } : null,

  };

}



const reminderInclude = {

  client: { select: { legalName: true, contactName: true, contactEmail: true, additionalEmails: true } },

  owner: { select: { name: true } },

  event: { select: { name: true, edition: true, startsOn: true, endsOn: true, venue: true, city: true, countryCode: true, timezone: true } },

  allocations: { select: { amountPaise: true, payment: { select: { status: true } } } },

  emailDeliveries: { where: { kind: "PAYMENT_REMINDER", status: { in: ["SENT", "PREVIEWED"] } }, select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },

} satisfies Prisma.FinancialDocumentInclude;



type ReminderDocument = Prisma.FinancialDocumentGetPayload<{ include: typeof reminderInclude }>;



/** Reminders sent after this instant count as "recent" and are skipped in bulk sends. */

export function reminderCooldownCutoff() {

  return new Date(Date.now() - REMINDER_COOLDOWN_HOURS * 3_600_000);

}



function eventInfo(event: ReminderDocument["event"]) {

  if (!event) return null;

  const date = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);

  return { name: event.name, edition: event.edition, startsOn: date(event.startsOn), endsOn: date(event.endsOn), venue: event.venue, city: event.city, countryCode: event.countryCode };

}



const reminderInput = z.object({

  documentIds: z.array(z.string().cuid()).min(1, "Select at least one PI").max(MAX_BATCH, `Send at most ${MAX_BATCH} reminders at a time`),

  message: z.string().trim().max(1000).optional(),

  attachPdf: z.boolean().optional().default(true),

  force: z.boolean().optional().default(false),

});



type Outcome = { id: string; number: string; client: string; status: "SENT" | "PREVIEWED" | "SKIPPED" | "FAILED"; reason?: string };



async function inBatches<T, R>(items: T[], size: number, run: (item: T) => Promise<R>) {

  const results: R[] = [];

  for (let index = 0; index < items.length; index += size) results.push(...await Promise.all(items.slice(index, index + size).map(run)));

  return results;

}



/** Personalised outstanding-balance reminders. Employees can remind only clients on PIs they can see. */

export async function sendPaymentReminders(actor: Actor, raw: unknown) {

  const input = reminderInput.parse(raw);

  const ids = [...new Set(input.documentIds)];

  const visible = await db.financialDocument.findMany({ where: { id: { in: ids }, type: "PROFORMA", ...documentScope(actor) }, include: reminderInclude });

  const sender = await senderInfo(actor.organizationId);

  const now = Date.now();

  const outcomes: Outcome[] = ids.filter((id) => !visible.some((document) => document.id === id)).map((id) => ({ id, number: "—", client: "—", status: "SKIPPED", reason: "Not found or not yours" }));



  const sendable = visible.filter((document) => {

    const base = { id: document.id, number: document.number ?? "Draft", client: document.client.legalName };

    const balance = piBalance(document.netReceivablePaise, document.status, document.allocations.map((item) => ({ amountPaise: item.amountPaise, status: item.payment.status })));

    const recipients = clientDocumentRecipients(document.client.contactEmail, document.client.additionalEmails);

    const last = document.emailDeliveries[0]?.createdAt;

    const reason = document.status !== "ISSUED" || !document.number ? "PI is not issued" : balance.outstanding <= 0n ? "Already fully paid" : !recipients.length ? "Client has no email address" : !input.force && last && now - last.getTime() < REMINDER_COOLDOWN_HOURS * 3_600_000 ? `Already reminded on ${formatIstDate(last)}` : null;

    if (reason) outcomes.push({ ...base, status: "SKIPPED", reason });

    return !reason;

  });



  const asOf = formatIstDate(new Date());

  outcomes.push(...await inBatches(sendable, 4, async (document): Promise<Outcome> => {

    const base = { id: document.id, number: document.number!, client: document.client.legalName };

    const balance = piBalance(document.netReceivablePaise, document.status, document.allocations.map((item) => ({ amountPaise: item.amountPaise, status: item.payment.status })));

    const recipients = clientDocumentRecipients(document.client.contactEmail, document.client.additionalEmails);

    const content = buildPaymentReminderEmail({ contactName: document.client.contactName, clientName: document.client.legalName, piNumber: document.number!, piDate: istDateString(document.issuedAt ?? document.createdAt), currency: document.currency, totalPaise: document.totalPaise, approvedPaise: balance.approved, outstandingPaise: balance.outstanding, event: eventInfo(document.event), managerName: document.owner.name, message: input.message, sender, asOf });

    const delivery = await db.documentEmailDelivery.create({ data: { organizationId: actor.organizationId, documentId: document.id, requestedById: actor.id, kind: "PAYMENT_REMINDER", recipients, subject: content.subject, status: "PENDING" } });

    try {

      const attachments: MailAttachment[] = input.attachPdf && document.snapshot ? [{ content: await generatePdf(toOutputSnapshot(effectiveSnapshot(document))), type: "application/pdf", filename: `${document.number!.replace(/[^a-zA-Z0-9._-]+/g, "_")}.pdf` }] : [];

      const result = await deliverMail({ to: recipients, subject: content.subject, text: content.text, html: content.html, attachments, categories: ["payment-reminder"] });

      await db.$transaction([

        db.documentEmailDelivery.update({ where: { id: delivery.id }, data: { status: result.status, sentAt: result.status === "SENT" ? new Date() : null, providerMessageId: result.messageId } }),

        db.auditEvent.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: "PAYMENT_REMINDER_SENT", entityType: "FinancialDocument", entityId: document.id, metadata: { deliveryId: delivery.id, recipientCount: recipients.length, outstandingPaise: balance.outstanding.toString(), dryRun: result.status === "PREVIEWED" } } }),

      ]);

      return { ...base, status: result.status };

    } catch (error) {

      const reason = error instanceof Error ? error.message.slice(0, 500) : "Delivery failed";

      await db.documentEmailDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", failureReason: reason } });

      return { ...base, status: "FAILED", reason };

    }

  }));



  const count = (status: Outcome["status"]) => outcomes.filter((item) => item.status === status).length;

  return { sent: count("SENT"), previewed: count("PREVIEWED"), skipped: count("SKIPPED"), failed: count("FAILED"), outcomes };

}



/** Optional client acknowledgement after Admin approves a payment. Never blocks the approval itself. */

export async function sendPaymentConfirmation(actor: Actor, paymentId: string) {

  requireCapability(actor, "VERIFY_PAYMENT");

  const payment = await db.payment.findFirst({ where: { id: paymentId, organizationId: actor.organizationId, status: "VERIFIED" }, include: { allocations: { include: { document: { include: reminderInclude } } } } });

  const document = payment?.allocations[0]?.document;

  if (!payment || !document || !document.number) throw new HttpError(404, "Approved payment not found");

  const recipients = clientDocumentRecipients(document.client.contactEmail, document.client.additionalEmails);

  if (!recipients.length) throw new HttpError(409, "Client has no email address");

  const balance = piBalance(document.netReceivablePaise, document.status, document.allocations.map((item) => ({ amountPaise: item.amountPaise, status: item.payment.status })));

  const content = buildPaymentConfirmationEmail({ contactName: document.client.contactName, clientName: document.client.legalName, piNumber: document.number, currency: payment.currency, amountPaise: payment.amountPaise, tdsPaise: payment.allocations.reduce((sum, allocation) => sum + allocation.tdsPaise, 0n), paidOn: istDateString(payment.paidOn), mode: paymentModeLabel(payment.mode), reference: payment.reference, totalPaise: document.totalPaise, approvedPaise: balance.approved, outstandingPaise: balance.outstanding, event: eventInfo(document.event), managerName: document.owner.name, sender: await senderInfo(actor.organizationId) });

  const delivery = await db.documentEmailDelivery.create({ data: { organizationId: actor.organizationId, documentId: document.id, requestedById: actor.id, kind: "PAYMENT_CONFIRMATION", recipients, subject: content.subject, status: "PENDING" } });

  try {

    const result = await deliverMail({ to: recipients, subject: content.subject, text: content.text, html: content.html, categories: ["payment-confirmation"] });

    await db.$transaction([

      db.documentEmailDelivery.update({ where: { id: delivery.id }, data: { status: result.status, sentAt: result.status === "SENT" ? new Date() : null, providerMessageId: result.messageId } }),

      db.auditEvent.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: "PAYMENT_CONFIRMATION_EMAILED", entityType: "Payment", entityId: payment.id, metadata: { deliveryId: delivery.id, recipientCount: recipients.length } } }),

    ]);

    return { status: result.status, recipients };

  } catch (error) {

    await db.documentEmailDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", failureReason: error instanceof Error ? error.message.slice(0, 500) : "Delivery failed" } });

    throw error;

  }

}



const testInput = z.object({ to: z.string().trim().toLowerCase().email("Enter a valid email address"), template: z.enum(["reminder", "confirmation", "document"]) });



/** Admin-only preview delivery to an internal address. Uses the latest issued PI as sample data. */

export async function sendTestEmail(actor: Actor, raw: unknown) {

  requireCapability(actor, "ADMINISTER");

  const input = testInput.parse(raw);

  const latest = await db.financialDocument.findFirst({ where: { organizationId: actor.organizationId, type: "PROFORMA", status: "ISSUED", number: { not: null } }, orderBy: { issuedAt: "desc" }, include: reminderInclude });

  if (!latest?.number || !latest.snapshot) throw new HttpError(409, "Issue at least one PI first; test emails use the latest PI as sample data.");

  const sender = await senderInfo(actor.organizationId);

  const balance = piBalance(latest.netReceivablePaise, latest.status, latest.allocations.map((item) => ({ amountPaise: item.amountPaise, status: item.payment.status })));

  const snapshot = toOutputSnapshot(effectiveSnapshot(latest));

  const base = { contactName: latest.client.contactName, clientName: latest.client.legalName, piNumber: latest.number, currency: latest.currency, totalPaise: latest.totalPaise, event: eventInfo(latest.event), managerName: latest.owner.name, sender };

  const sampleAmount = latest.totalPaise / 4n;

  const content = input.template === "reminder"

    ? buildPaymentReminderEmail({ ...base, piDate: istDateString(latest.issuedAt ?? latest.createdAt), approvedPaise: balance.approved, outstandingPaise: balance.outstanding, message: "This is a test message added by the sender. It appears here when an employee or Admin writes a personal note.", asOf: formatIstDate(new Date()) })

    : input.template === "confirmation"

      ? buildPaymentConfirmationEmail({ ...base, amountPaise: sampleAmount, paidOn: istDateString(new Date()), mode: "NEFT", reference: "TESTUTR0001", approvedPaise: balance.approved + sampleAmount, outstandingPaise: balance.outstanding - sampleAmount })

      : buildDocumentEmail(snapshot, latest.client.contactName, latest.owner.name);

  const attachments: MailAttachment[] = input.template === "confirmation" ? [] : [{ content: await generatePdf(snapshot), type: "application/pdf", filename: `${latest.number.replace(/[^a-zA-Z0-9._-]+/g, "_")}.pdf` }];

  const subject = `[TEST] ${content.subject}`;

  const result = await deliverMail({ to: [input.to], subject, text: content.text, html: content.html, attachments, categories: ["test-email"] });

  await db.documentEmailDelivery.create({ data: { organizationId: actor.organizationId, documentId: latest.id, requestedById: actor.id, kind: "TEST", recipients: [input.to], subject, status: result.status, sentAt: result.status === "SENT" ? new Date() : null, providerMessageId: result.messageId } });

  await db.auditEvent.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: "TEST_EMAIL_SENT", entityType: "Email", entityId: input.template, metadata: { template: input.template, providerMessageId: result.messageId } } });

  return { status: result.status, subject, to: input.to, sample: latest.number };

}
