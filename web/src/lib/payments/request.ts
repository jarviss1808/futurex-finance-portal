import "server-only";

/** Reads either a JSON body or a multipart form (with an optional `proof` file). */
export async function readPaymentRequest(request: Request): Promise<{ fields: Record<string, unknown>; file: FormDataEntryValue | null }> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const form = await request.formData();
    const fields: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) if (typeof value === "string") fields[key] = value;
    return { fields, file: form.get("proof") };
  }
  const body = await request.json().catch(() => ({}));
  return { fields: body && typeof body === "object" ? body as Record<string, unknown> : {}, file: null };
}
