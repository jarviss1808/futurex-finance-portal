import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { HttpError } from "@/lib/http";
import { explainSendgridError } from "./errors";

export type MailAttachment = { content: Uint8Array; type: string; filename: string; inlineId?: string };
export type OutgoingMail = { to: string[]; subject: string; text: string; html: string; attachments?: MailAttachment[]; categories?: string[] };
export type DeliveryResult = { status: "SENT" | "PREVIEWED"; messageId: string | null };

export function emailSettings() {
  const apiKey = process.env.SENDGRID_API_KEY?.trim() || "";
  const fromEmail = process.env.SENDGRID_FROM_EMAIL?.trim() || "";
  const fromName = process.env.SENDGRID_FROM_NAME?.trim() || "Accounts Futurex Trade";
  const replyTo = process.env.SENDGRID_REPLY_TO?.trim() || fromEmail;
  const dryRun = process.env.SENDGRID_DRY_RUN === "true";
  return { apiKey, fromEmail, fromName, replyTo, dryRun, configured: Boolean(apiKey && fromEmail) };
}

let logoCache: Uint8Array | null = null;
async function emailLogo() {
  logoCache ??= new Uint8Array(await readFile(path.join(process.cwd(), "public", "branding", "futurex-logo-email.png")));
  return logoCache;
}

export const EMAIL_LOGO_CID = "futurex-logo";

/**
 * Sends one message through SendGrid. Every recipient gets a separate personalization so client
 * addresses are never disclosed to each other. With SENDGRID_DRY_RUN=true nothing leaves the server.
 */
export async function deliverMail(mail: OutgoingMail): Promise<DeliveryResult> {
  const settings = emailSettings();
  if (!mail.to.length) throw new HttpError(409, "No recipient email address");
  if (settings.dryRun) return { status: "PREVIEWED", messageId: null };
  if (!settings.configured) throw new HttpError(503, "Email is not configured. Set SENDGRID_API_KEY and a verified SENDGRID_FROM_EMAIL.");
  const attachments = [{ content: await emailLogo(), type: "image/png", filename: "futurex-logo.png", inlineId: EMAIL_LOGO_CID }, ...(mail.attachments ?? [])];
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: mail.to.map((address) => ({ to: [{ email: address }] })),
      from: { email: settings.fromEmail, name: settings.fromName },
      reply_to: { email: settings.replyTo, name: settings.fromName },
      subject: mail.subject,
      content: [{ type: "text/plain", value: mail.text }, { type: "text/html", value: mail.html }],
      attachments: attachments.map((item) => ({ content: Buffer.from(item.content).toString("base64"), type: item.type, filename: item.filename, disposition: item.inlineId ? "inline" : "attachment", ...(item.inlineId ? { content_id: item.inlineId } : {}) })),
      categories: (mail.categories ?? ["futurex-finance"]).slice(0, 10),
      tracking_settings: { click_tracking: { enable: false, enable_text: false } },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new HttpError(502, explainSendgridError(response.status, (await response.text()).slice(0, 600)));
  return { status: "SENT", messageId: response.headers.get("x-message-id") };
}

let creditCache: { at: number; value: { remain: number; total: number; nextReset: string | null } | null } | null = null;
/** Remaining SendGrid credits for the Admin settings panel; null when unavailable. Cached for one minute. */
export async function sendgridCredits() {
  const settings = emailSettings();
  if (!settings.apiKey || settings.dryRun) return null;
  if (creditCache && Date.now() - creditCache.at < 60_000) return creditCache.value;
  try {
    const response = await fetch("https://api.sendgrid.com/v3/user/credits", { headers: { Authorization: `Bearer ${settings.apiKey}` }, signal: AbortSignal.timeout(5_000) });
    if (!response.ok) console.warn(`SendGrid credit check failed with HTTP ${response.status}`);
    const data = response.ok ? await response.json() as { remain?: number; total?: number; next_reset?: string } : null;
    creditCache = { at: Date.now(), value: data ? { remain: Number(data.remain ?? 0), total: Number(data.total ?? 0), nextReset: data.next_reset ?? null } : null };
  } catch (error) {
    console.warn("SendGrid credit check failed:", error instanceof Error ? error.message : error);
    creditCache = { at: Date.now(), value: null };
  }
  return creditCache.value;
}
