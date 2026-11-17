export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export type SummaryRow = { label: string; value: string; strong?: boolean; tone?: "danger" | "success" };
export type BankBlock = { accountName: string; bankName: string; accountNumber: string; ifsc: string; swift?: string; branch?: string };

const BLUE = "#101e58", RED = "#ed1c24", INK = "#1d2939", MUTED = "#667085", LINE = "#e4e7ec";

/** Plain, table-based HTML that renders consistently in Gmail, Outlook and mobile mail apps. */
export function renderEmail(input: { preheader: string; title: string; greeting: string; intro: string[]; summary?: SummaryRow[]; note?: string; bank?: BankBlock; closing: string[]; signature: { name: string; lines: string[] }; footer: string }) {
  const paragraph = (text: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK}">${text}</p>`;
  const summary = input.summary?.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:6px;border-collapse:separate;margin:6px 0 20px">${input.summary.map((row, index) => `<tr><td style="padding:11px 14px;font-size:14px;color:${MUTED};${index ? `border-top:1px solid ${LINE};` : ""}">${escapeHtml(row.label)}</td><td align="right" style="padding:11px 14px;font-size:${row.strong ? 16 : 14}px;font-weight:${row.strong ? 700 : 600};color:${row.tone === "danger" ? RED : row.tone === "success" ? "#067647" : INK};${index ? `border-top:1px solid ${LINE};` : ""}">${escapeHtml(row.value)}</td></tr>`).join("")}</table>` : "";
  const note = input.note ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td style="background:#f6f7fb;border-left:3px solid ${BLUE};padding:12px 14px;font-size:14px;line-height:1.6;color:${INK}">${escapeHtml(input.note).replace(/\n/g, "<br>")}</td></tr></table>` : "";
  const bank = input.bank ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#f6f7fb;border-radius:6px"><tr><td style="padding:14px 16px;font-size:13px;line-height:1.7;color:${INK}"><div style="font-size:11px;letter-spacing:1.2px;color:${MUTED};font-weight:700;margin-bottom:4px">BANK DETAILS FOR PAYMENT</div>Account name: <b>${escapeHtml(input.bank.accountName)}</b><br>Bank: ${escapeHtml(input.bank.bankName)}${input.bank.branch ? `, ${escapeHtml(input.bank.branch)}` : ""}<br>Account no.: <b>${escapeHtml(input.bank.accountNumber)}</b><br>IFSC: <b>${escapeHtml(input.bank.ifsc)}</b>${input.bank.swift ? ` &nbsp;·&nbsp; SWIFT: ${escapeHtml(input.bank.swift)}` : ""}</td></tr></table>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title></head>
<body style="margin:0;padding:0;background:#f2f4f7">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f7"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">
<tr><td style="padding:22px 28px 16px;border-bottom:3px solid ${BLUE}"><img src="cid:futurex-logo" width="200" alt="Futurex" style="display:block;width:200px;max-width:60%;height:auto;border:0"></td></tr>
<tr><td style="padding:26px 28px 6px">
<h1 style="margin:0 0 18px;font-size:20px;line-height:1.3;color:${BLUE}">${escapeHtml(input.title)}</h1>
${paragraph(input.greeting)}
${input.intro.map(paragraph).join("")}
${summary}${note}${bank}
${input.closing.map(paragraph).join("")}
<p style="margin:22px 0 0;font-size:15px;line-height:1.6;color:${INK}">Warm regards,<br><b>${escapeHtml(input.signature.name)}</b>${input.signature.lines.map((line) => `<br><span style="color:${MUTED};font-size:13px">${line}</span>`).join("")}</p>
</td></tr>
<tr><td style="padding:22px 28px 26px"><div style="border-top:1px solid ${LINE};padding-top:14px;font-size:11px;line-height:1.6;color:${MUTED}">${input.footer}</div></td></tr>
</table></td></tr></table></body></html>`;
}

/** Text alternative so the message is readable in every client and less likely to be flagged as spam. */
export function renderText(input: { greeting: string; intro: string[]; summary?: SummaryRow[]; note?: string; bank?: BankBlock; closing: string[]; signature: { name: string; lines: string[] } }) {
  const strip = (value: string) => value.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const parts = [strip(input.greeting), ...input.intro.map(strip)];
  if (input.summary?.length) parts.push(input.summary.map((row) => `${row.label}: ${row.value}`).join("\n"));
  if (input.note) parts.push(input.note);
  if (input.bank) parts.push(`Bank details for payment\nAccount name: ${input.bank.accountName}\nBank: ${input.bank.bankName}${input.bank.branch ? `, ${input.bank.branch}` : ""}\nAccount no.: ${input.bank.accountNumber}\nIFSC: ${input.bank.ifsc}${input.bank.swift ? `\nSWIFT: ${input.bank.swift}` : ""}`);
  parts.push(...input.closing.map(strip));
  parts.push(`Warm regards,\n${input.signature.name}\n${input.signature.lines.map(strip).join("\n")}`);
  return parts.join("\n\n");
}
