import "server-only";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { HttpError } from "@/lib/http";
import { deletePrivateFile, readPrivateFile, writePrivateFile } from "@/lib/storage/private-files";
import { PROOF_EXTENSIONS, PROOF_MAX_BYTES, detectProofMediaType, safeProofFileName } from "./proof-type";

export type StoredProof = { storageKey: string; fileName: string; mediaType: string; sha256: string; sizeBytes: number };

/** Validates and writes an uploaded proof outside the web root. Returns null when no file was attached. */
export async function storeProof(organizationId: string, file: FormDataEntryValue | null): Promise<StoredProof | null> {
  if (!file || typeof file === "string" || file.size === 0) return null;
  if (file.size > PROOF_MAX_BYTES) throw new HttpError(413, "Payment proof must be 4 MB or smaller");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mediaType = detectProofMediaType(bytes);
  if (!mediaType) throw new HttpError(415, "Upload the payment proof as a PDF, JPG, PNG or WEBP file");
  const storageKey = path.posix.join("payment-proofs", organizationId.replace(/[^a-zA-Z0-9_-]/g, ""), `${randomUUID()}${PROOF_EXTENSIONS[mediaType]}`);
  await writePrivateFile(storageKey, bytes, mediaType);
  return { storageKey, fileName: safeProofFileName(file.name, mediaType), mediaType, sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.byteLength };
}

/** Removes a stored file whose database row was never committed. */
export async function discardProof(proof: StoredProof | null) {
  if (!proof) return;
  await deletePrivateFile(proof.storageKey).catch(() => undefined);
}

export const readProof = readPrivateFile;
