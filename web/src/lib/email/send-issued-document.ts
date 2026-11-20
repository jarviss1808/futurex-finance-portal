
import "server-only";

import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import {
  documentScope,
  type Actor,
} from "@/lib/security/policy";
import { generatePdf } from "@/lib/documents/generate";
import { toOutputSnapshot } from "@/lib/documents/output";
import { clientDocumentRecipients } from "./recipients";
import { buildDocumentEmail } from "./template";
import { deliverMail, emailSettings } from "./sendgrid";
import { effectiveSnapshot } from "@/lib/documents/effective";

type SendOptions = {
  allowResend?: boolean;
  cc?: string[];
};

const EMAIL_PATTERN =
  /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

function validateCc(
  requestedCc: string[],
  primaryRecipients: string[]
): string[] {
  if (requestedCc.length > 3) {
    throw new HttpError(
      400,
      "Maximum 3 CC email addresses are allowed"
    );
  }

  const cc = requestedCc.map((email) => email.trim());

  if (cc.some((email) => !EMAIL_PATTERN.test(email))) {
    throw new HttpError(
      400,
      "Enter valid CC email addresses"
    );
  }

  const normalizedCc = cc.map((email) =>
    email.toLowerCase()
  );

  if (
    new Set(normalizedCc).size !== normalizedCc.length
  ) {
    throw new HttpError(
      400,
      "Duplicate CC email addresses are not allowed"
    );
  }

  const primarySet = new Set(
    primaryRecipients.map((email) =>
      email.trim().toLowerCase()
    )
  );

  if (
    normalizedCc.some((email) => primarySet.has(email))
  ) {
    throw new HttpError(
      400,
      "A CC address is already included in the primary recipients"
    );
  }

  return cc;
}

export async function sendIssuedDocumentEmail(
  actor: Actor,
  documentId: string,
  options: SendOptions = {}
) {
  const document = await db.financialDocument.findFirst({
    where: {
      id: documentId,
      ...documentScope(actor),
    },
    include: {
      client: true,
      owner: {
        select: {
          name: true,
        },
      },
    },
  });

  if (
    !document ||
    document.status !== "ISSUED" ||
    !document.snapshot ||
    !document.number
  ) {
    throw new HttpError(
      404,
      "Issued document not found"
    );
  }

  const recipients = clientDocumentRecipients(
    document.client.contactEmail,
    document.client.additionalEmails
  );

  if (!recipients.length) {
    throw new HttpError(
      409,
      "Add at least one client email address before sending"
    );
  }

  // Optional CC addresses are supplied per send.
  // They do not modify the client's saved email addresses.
  const cc = validateCc(
    options.cc ?? [],
    recipients
  );

  if (!options.allowResend) {
    const sent =
      await db.documentEmailDelivery.findFirst({
        where: {
          documentId,
          kind: "DOCUMENT",
          status: "SENT",
        },
        orderBy: {
          sentAt: "desc",
        },
      });

    if (sent) {
      throw new HttpError(
        409,
        "This document was already emailed. Use Resend only after confirming the recipients."
      );
    }
  }

  const snapshot = toOutputSnapshot(
    effectiveSnapshot(document)
  );

  const content = buildDocumentEmail(
    snapshot,
    document.client.contactName,
    document.owner.name
  );

  const settings = emailSettings();

  if (!settings.dryRun && !settings.configured) {
    throw new HttpError(
      503,
      "Email is not configured. Set SMTP_HOST, SMTP_USER and SMTP_APP_PASSWORD."
    );
  }

  // Store all intended recipients in existing delivery history.
  // The separate CC list is also kept in the audit metadata.
  const allRecipients = [
    ...recipients,
    ...cc,
  ];

  const delivery =
    await db.documentEmailDelivery.create({
      data: {
        organizationId: actor.organizationId,
        documentId,
        requestedById: actor.id,
        kind: "DOCUMENT",
        recipients: allRecipients,
        subject: content.subject,
        status: settings.dryRun
          ? "PREVIEWED"
          : "PENDING",
      },
    });

  try {
    const pdf = await generatePdf(snapshot);

    const result = await deliverMail({
      to: recipients,
      cc,
      subject: content.subject,
      text: content.text,
      html: content.html,
      categories: ["proforma-invoice"],
      attachments: [
        {
          content: pdf,
          type: "application/pdf",
          filename: `${document.number.replace(
            /[^a-zA-Z0-9._-]+/g,
            "_"
          )}.pdf`,
        },
      ],
    });

    const sentAt = new Date();

    await db.$transaction([
      db.documentEmailDelivery.update({
        where: {
          id: delivery.id,
        },
        data: {
          status: result.status,
          sentAt:
            result.status === "SENT"
              ? sentAt
              : null,
          providerMessageId: result.messageId,
        },
      }),

      db.auditEvent.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.id,
          action:
            result.status === "SENT"
              ? "DOCUMENT_EMAIL_SENT"
              : "DOCUMENT_EMAIL_PREVIEWED",
          entityType: "FinancialDocument",
          entityId: documentId,
          metadata: {
            deliveryId: delivery.id,
            recipientCount: allRecipients.length,
            ccCount: cc.length,
            cc,
            providerMessageId: result.messageId,
          },
        },
      }),
    ]);

    return {
      id: delivery.id,
      status: result.status,
      sentAt:
        result.status === "SENT"
          ? sentAt
          : null,
      recipients,
      cc,
      subject: content.subject,
    };
  } catch (error) {
    // Avoid storing raw SMTP errors that may
    // contain sensitive details.
    const failureReason =
      error instanceof HttpError
        ? error.message.slice(0, 1000)
        : "Email delivery failed. Check SMTP server logs.";

    await db.$transaction([
      db.documentEmailDelivery.update({
        where: {
          id: delivery.id,
        },
        data: {
          status: "FAILED",
          failureReason,
        },
      }),

      db.auditEvent.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.id,
          action: "DOCUMENT_EMAIL_FAILED",
          entityType: "FinancialDocument",
          entityId: documentId,
          metadata: {
            deliveryId: delivery.id,
            ccCount: cc.length,
          },
        },
      }),
    ]);

    throw error instanceof HttpError
      ? error
      : new HttpError(502, failureReason);
  }
}
