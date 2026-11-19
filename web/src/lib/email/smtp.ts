
import "server-only";

import nodemailer from "nodemailer";

import type {
  SendMailOptions,
  Transporter,
} from "nodemailer";

let transporter: Transporter | undefined;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Email configuration missing: ${name}`
    );
  }

  return value;
}

function getTransporter(): Transporter {
  if (transporter) {
    return transporter;
  }

  const host = requiredEnv("SMTP_HOST");
  const user = requiredEnv("SMTP_USER");

  const password = requiredEnv(
    "SMTP_APP_PASSWORD"
  ).replace(/\s/g, "");

  const port = Number(
    process.env.SMTP_PORT ?? "465"
  );

  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error("Invalid SMTP_PORT");
  }

  transporter = nodemailer.createTransport({
    host,
    port,

    secure: port === 465,
    requireTLS: port !== 465,

    auth: {
      user,
      pass: password,
    },

    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 30000,

    pool: true,
    maxConnections: 2,
    maxMessages: 50,

    tls: {
      rejectUnauthorized: true,
    },

    disableFileAccess: true,
    disableUrlAccess: true,
  });

  return transporter;
}

export type SmtpMailInput = {
  to: string[];
  subject: string;
  text: string;
  html?: string;

  attachments?: Array<{
    filename: string;
    content: Buffer | Uint8Array;
    contentType?: string;
  }>;
};

export async function sendSmtpMail(
  input: SmtpMailInput
) {
  const recipients = [
    ...new Set(
      input.to
        .map((address) =>
          address.trim().toLowerCase()
        )
        .filter(Boolean)
    ),
  ];

  if (recipients.length === 0) {
    throw new Error(
      "At least one recipient is required"
    );
  }

  const sender =
    process.env.SMTP_FROM_EMAIL?.trim() ||
    requiredEnv("SMTP_USER");

  const replyTo =
    process.env.SMTP_REPLY_TO?.trim() ||
    sender;

  // Convert Uint8Array attachments into Buffer,
  // which Nodemailer 10 accepts as MIME content.
  const attachments = (
    input.attachments ?? []
  ).map((attachment) => ({
    filename: attachment.filename,
    content: Buffer.from(attachment.content),
    ...(attachment.contentType
      ? {
          contentType: attachment.contentType,
        }
      : {}),
  }));

  const options: SendMailOptions = {
    from: sender,
    replyTo,
    to: recipients,
    subject: input.subject,
    text: input.text,

    ...(input.html
      ? {
          html: input.html,
        }
      : {}),

    ...(attachments.length > 0
      ? { attachments }
      : {}),
  };

  const result =
    await getTransporter().sendMail(options);

  // Nodemailer 10 types mark these fields optional.
  const accepted = result.accepted ?? [];
  const rejected = result.rejected ?? [];

  if (
    rejected.length > 0 ||
    accepted.length !== recipients.length
  ) {
    throw new Error(
      "SMTP did not accept all recipients"
    );
  }

  return {
    messageId: result.messageId ?? null,
    accepted: accepted.map(String),
  };
}
