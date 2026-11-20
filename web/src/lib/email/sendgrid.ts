
import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

import { HttpError } from "@/lib/http";

export type MailAttachment = {
  content: Uint8Array;
  type: string;
  filename: string;
  inlineId?: string;
};

export type OutgoingMail = {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html: string;
  attachments?: MailAttachment[];
  categories?: string[];
};

export type DeliveryResult = {
  status: "SENT" | "PREVIEWED";
  messageId: string | null;
};

export const EMAIL_LOGO_CID = "futurex-logo";

export function emailSettings() {
  const host =
    process.env.SMTP_HOST?.trim() ?? "";

  const port = Number(
    process.env.SMTP_PORT ?? "465"
  );

  const user =
    process.env.SMTP_USER?.trim() ?? "";

  const password =
    process.env.SMTP_APP_PASSWORD?.replace(
      /\s/g,
      ""
    ) ?? "";

  const fromEmail =
    process.env.SMTP_FROM_EMAIL?.trim() || user;

  const fromName =
    process.env.SMTP_FROM_NAME?.trim() ||
    "Accounts Futurex Trade";

  const replyTo =
    process.env.SMTP_REPLY_TO?.trim() ||
    fromEmail;

  const dryRun =
    process.env.SMTP_DRY_RUN === "true";

  return {
    host,
    port,
    user,
    password,
    fromEmail,
    fromName,
    replyTo,
    dryRun,

    configured: Boolean(
      host &&
        user &&
        password &&
        fromEmail &&
        Number.isInteger(port) &&
        port > 0 &&
        port <= 65535
    ),
  };
}

type SmtpSettings = ReturnType<
  typeof emailSettings
>;

type SmtpTransporter = Transporter<
  SMTPTransport.SentMessageInfo
>;

let transport: SmtpTransporter | null = null;
let transportIdentity = "";

let logoCache: Uint8Array | null = null;

async function emailLogo(): Promise<Uint8Array> {
  if (!logoCache) {
    logoCache = new Uint8Array(
      await readFile(
        path.join(
          process.cwd(),
          "public",
          "branding",
          "futurex-logo-email.png"
        )
      )
    );
  }

  return logoCache;
}

function smtpTransport(
  settings: SmtpSettings
): SmtpTransporter {
  const identity = [
    settings.host,
    settings.port,
    settings.user,
    settings.password,
  ].join(":");

  if (
    transport &&
    transportIdentity === identity
  ) {
    return transport;
  }

  if (transport) {
    transport.close();
  }

  transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,

    secure: settings.port === 465,
    requireTLS: settings.port !== 465,

    auth: {
      user: settings.user,
      pass: settings.password,
    },

    pool: true,
    maxConnections: 2,
    maxMessages: 50,

    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 25_000,

    disableFileAccess: true,
    disableUrlAccess: true,

    tls: {
      rejectUnauthorized: true,
    },
  });

  transportIdentity = identity;

  return transport;
}

/**
 * Sends separate messages to primary recipients.
 *
 * Optional CC addresses are included only on
 * the first primary recipient's message, so
 * CC recipients receive one copy, not one
 * copy per primary recipient.
 *
 * SMTP acceptance does not guarantee
 * final inbox delivery.
 */
export async function deliverMail(
  mail: OutgoingMail
): Promise<DeliveryResult> {
  const settings = emailSettings();

  const recipients = [
    ...new Set(
      mail.to
        .map((item) =>
          item.trim().toLowerCase()
        )
        .filter(Boolean)
    ),
  ];

  const cc = [
    ...new Set(
      (mail.cc ?? [])
        .map((item) =>
          item.trim().toLowerCase()
        )
        .filter(Boolean)
    ),
  ];

  if (!recipients.length) {
    throw new HttpError(
      409,
      "No recipient email address"
    );
  }

  if (
    cc.some((email) =>
      recipients.includes(email)
    )
  ) {
    throw new HttpError(
      400,
      "A CC address is already a primary recipient"
    );
  }

  if (settings.dryRun) {
    return {
      status: "PREVIEWED",
      messageId: null,
    };
  }

  if (!settings.configured) {
    throw new HttpError(
      503,
      "Email is not configured. Set SMTP_HOST, SMTP_USER and SMTP_APP_PASSWORD."
    );
  }

  if (
    settings.fromEmail.toLowerCase() !==
    settings.user.toLowerCase()
  ) {
    throw new HttpError(
      503,
      "SMTP_FROM_EMAIL must match SMTP_USER for this mailbox setup."
    );
  }

  const attachments = [
    {
      filename: "futurex-logo.png",
      content: Buffer.from(
        await emailLogo()
      ),
      contentType: "image/png",
      cid: EMAIL_LOGO_CID,
      contentDisposition:
        "inline" as const,
    },

    ...(mail.attachments ?? []).map(
      (item) => ({
        filename: item.filename,
        content: Buffer.from(
          item.content
        ),
        contentType: item.type,

        ...(item.inlineId
          ? {
              cid: item.inlineId,
              contentDisposition:
                "inline" as const,
            }
          : {
              contentDisposition:
                "attachment" as const,
            }),
      })
    ),
  ];

  const sender = {
    name: settings.fromName,
    address: settings.fromEmail,
  };

  const smtp = smtpTransport(settings);

  // Each primary recipient receives a
  // separate message. CC is attached to
  // the first message only.
  const results = await Promise.allSettled(
    recipients.map((recipient, index) =>
      smtp.sendMail({
        from: sender,
        replyTo: settings.replyTo,
        to: recipient,

        ...(index === 0 && cc.length > 0
          ? { cc }
          : {}),

        subject: mail.subject,
        text: mail.text,
        html: mail.html,

        attachments,
      })
    )
  );

  const failures = results.filter(
    (result, index) => {
      if (result.status === "rejected") {
        return true;
      }

      const accepted = (
        result.value.accepted ?? []
      ).map((address) =>
        String(address).toLowerCase()
      );

      const rejected = (
        result.value.rejected ?? []
      ).map((address) =>
        String(address).toLowerCase()
      );

      const expected = [
        recipients[index],
        ...(index === 0 ? cc : []),
      ];

      return (
        rejected.length > 0 ||
        expected.some(
          (address) =>
            !accepted.includes(address)
        )
      );
    }
  );

  if (failures.length > 0) {
    console.error(
      "[SMTP] Recipient messages failed",
      {
        attempted: recipients.length + cc.length,
        failedMessages: failures.length,
      }
    );

    throw new HttpError(
      502,
      "SMTP failed to accept one or more recipient messages. Check delivery logs before resending."
    );
  }

  const first = results[0];

  return {
    status: "SENT",
    messageId:
      first.status === "fulfilled"
        ? first.value.messageId || null
        : null,
  };
}

/**
 * Compatibility for existing Admin settings.
 * SMTP has no SendGrid credit API.
 */
export async function sendgridCredits(): Promise<null> {
  return null;
}
