// Stays below Vercel Functions' 4.5 MB request limit after multipart overhead.
export const PROOF_MAX_BYTES = 4 * 1024 * 1024;
export const PROOF_EXTENSIONS = { "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" } as const;
export type ProofMediaType = keyof typeof PROOF_EXTENSIONS;

/** Identifies an allowed proof file by its leading bytes; the browser-supplied type is never trusted. */
export function detectProofMediaType(bytes: Uint8Array): ProofMediaType | null {
  const starts = (...signature: number[]) => signature.every((value, index) => bytes[index] === value);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return null;
}

export function safeProofFileName(name: string, mediaType: ProofMediaType) {
  const base = name.replace(/\.[^.]*$/, "").replace(/[^a-zA-Z0-9 ._-]+/g, "_").trim().slice(0, 80) || "payment-proof";
  return `${base}${PROOF_EXTENSIONS[mediaType]}`;
}

export function proofDownloadHeaders(fileName: string, mediaType: string) {
  const safeName = fileName.replace(/[\r\n"]/g, "_");
  return {
    "Content-Type": mediaType,
    "Content-Disposition": `attachment; filename="${safeName}"`,
    "Cache-Control": "private, no-store",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };
}
