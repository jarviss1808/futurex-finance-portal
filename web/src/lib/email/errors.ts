/** Turns SendGrid API failures into instructions an Admin can act on. */
export function explainSendgridError(status: number, body: string) {
  if (/maximum credits exceeded/i.test(body)) return "SendGrid account has no email credits left, so nothing can be sent. Renew or upgrade the SendGrid plan (SendGrid → Settings → Billing), then try again.";
  if (status === 401) return "SendGrid rejected the API key. Check SENDGRID_API_KEY (it needs Mail Send permission).";
  if (status === 403) return `SendGrid refused to send from this address. Make sure the sender is verified in SendGrid.${body ? ` (${body.slice(0, 200)})` : ""}`;
  if (status === 413) return "The email is too large for SendGrid. Try without the PDF attachment.";
  if (status === 429) return "SendGrid is rate-limiting this account. Wait a minute and try again.";
  return `SendGrid could not send the email (${status})${body ? `: ${body.slice(0, 300)}` : ""}`;
}
