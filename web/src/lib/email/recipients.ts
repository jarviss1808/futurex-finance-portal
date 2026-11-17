import { z } from "zod";

const email = z.string().trim().toLowerCase().email().max(254);

export function parseAdditionalEmails(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[;,\n]/) : [];
  const parsed = raw.map((item) => String(item).trim()).filter(Boolean).map((item) => email.parse(item));
  return z.array(email).max(2, "Add no more than two additional email addresses").parse([...new Set(parsed)]);
}

export function clientDocumentRecipients(primary: string | null | undefined, additional: readonly string[] = []): string[] {
  const values = [primary, ...additional].filter((value): value is string => Boolean(value?.trim()));
  const parsed = values.map((value) => email.parse(value));
  return [...new Set(parsed)].slice(0, 3);
}
