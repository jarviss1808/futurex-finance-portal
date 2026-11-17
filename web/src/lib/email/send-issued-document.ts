import "server-only";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { documentScope, type Actor } from "@/lib/security/policy";
import { generatePdf } from "@/lib/documents/generate";
import { toOutputSnapshot } from "@/lib/documents/output";
import { clientDocumentRecipients } from "./recipients";
import { buildDocumentEmail } from "./template";
import { deliverMail, emailSettings } from "./sendgrid";
import { effectiveSnapshot } from "@/lib/documents/effective";

type SendOptions = { allowResend?: boolean };

export async function sendIssuedDocumentEmail(actor: Actor, documentId: string, options: SendOptions = {}) {
  const document = await db.financialDocument.findFirst({
    where: { id: documentId, ...documentScope(actor) },
    include: { client: true, owner: { select: { name: true } } },
  });
  if (!document || document.status !== "ISSUED" || !document.snapshot || !document.number) throw new HttpError(404, "Issued document not found");

  const recipients = clientDocumentRecipients(document.client.contactEmail, document.client.additionalEmails);
  if (!recipients.length) throw new HttpError(409, "Add at least one client email address before sending");
  if (!options.allowResend) {
    const sent = await db.documentEmailDelivery.findFirst({ where: { documentId, kind: "DOCUMENT", status: "SENT" }, orderBy: { sentAt: "desc" } });
    if (sent) throw new HttpError(409, "This document was already emailed. Use Resend only after confirming the recipients.");
  }

  const snapshot = toOutputSnapshot(effectiveSnapshot(document));
  const content = buildDocumentEmail(snapshot, document.client.contactName, document.owner.name);
  const settings = emailSettings();
  if (!settings.dryRun && !settings.configured) throw new HttpError(503, "Email is not configured. Set SENDGRID_API_KEY and a verified SENDGRID_FROM_EMAIL.");

  const delivery = await db.documentEmailDelivery.create({ data: { organizationId: actor.organizationId, documentId, requestedById: actor.id, kind: "DOCUMENT", recipients, subject: content.subject, status: settings.dryRun ? "PREVIEWED" : "PENDING" } });
  try {
    const pdf = await generatePdf(snapshot);
    const result = await deliverMail({ to: recipients, subject: content.subject, text: content.text, html: content.html, categories: ["proforma-invoice"], attachments: [{ content: pdf, type: "application/pdf", filename: `${document.number.replace(/[^a-zA-Z0-9._-]+/g, "_")}.pdf` }] });
    const sentAt = new Date();
    await db.$transaction([
      db.documentEmailDelivery.update({ where: { id: delivery.id }, data: { status: result.status, sentAt: result.status === "SENT" ? sentAt : null, providerMessageId: result.messageId } }),
      db.auditEvent.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: result.status === "SENT" ? "DOCUMENT_EMAIL_SENT" : "DOCUMENT_EMAIL_PREVIEWED", entityType: "FinancialDocument", entityId: documentId, metadata: { deliveryId: delivery.id, recipientCount: recipients.length, providerMessageId: result.messageId } } }),
    ]);
    return { id: delivery.id, status: result.status, sentAt, recipients, subject: content.subject };
  } catch (error) {
    const failureReason = error instanceof Error ? error.message.slice(0, 1000) : "Email delivery failed";
    await db.$transaction([
      db.documentEmailDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", failureReason } }),
      db.auditEvent.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: "DOCUMENT_EMAIL_FAILED", entityType: "FinancialDocument", entityId: documentId, metadata: { deliveryId: delivery.id } } }),
    ]);
    throw error instanceof HttpError ? error : new HttpError(502, failureReason);
  }
}
