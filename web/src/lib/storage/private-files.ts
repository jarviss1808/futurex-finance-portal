import "server-only";

import { del, get, put } from "@vercel/blob";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export type PrivateStorageBackend = "filesystem" | "vercel-blob";

export function privateStorageBackend(): PrivateStorageBackend {
  const configured = process.env.PRIVATE_STORAGE_BACKEND?.trim().toLowerCase();
  if (!configured || configured === "filesystem") return "filesystem";
  if (configured === "vercel-blob") return "vercel-blob";
  throw new Error("PRIVATE_STORAGE_BACKEND must be filesystem or vercel-blob");
}

function validatedKey(storageKey: string): string {
  if (!storageKey || storageKey.includes("\0")) {
    throw new Error("Invalid private storage key");
  }
  // Reject traversal instead of allowing normalization to silently resolve it.
  const segments = storageKey.replaceAll("\\", "/").split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Invalid private storage key");
  }
  const normalized = path.posix.normalize(segments.join("/"));
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error("Invalid private storage key");
  }
  return normalized;
}

function storageRoot(): string {
  // Avoid relying on a Unix root on Windows. Set PRIVATE_STORAGE_ROOT
  // explicitly if this project already uses a persistent storage directory.
  return path.resolve(
    /* turbopackIgnore: true */ process.env.PRIVATE_STORAGE_ROOT ?? "./.private"
  );
}

function filesystemTarget(storageKey: string): string {
  const root = storageRoot();
  const target = path.resolve(root, validatedKey(storageKey));
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid private storage path");
  }
  return target;
}

function assertBlobConfigured(): void {
  if (
    !process.env.BLOB_READ_WRITE_TOKEN &&
    !(process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID)
  ) {
    throw new Error("Vercel Private Blob is not connected");
  }
}

export async function writePrivateFile(
  storageKey: string,
  bytes: Uint8Array,
  mediaType = "application/octet-stream"
): Promise<void> {
  const key = validatedKey(storageKey);
  if (privateStorageBackend() === "vercel-blob") {
    assertBlobConfigured();
    await put(key, Buffer.from(bytes), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: mediaType,
    });
    return;
  }
  const target = filesystemTarget(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });
}

export async function readPrivateFile(storageKey: string): Promise<Uint8Array> {
  const key = validatedKey(storageKey);
  if (privateStorageBackend() === "vercel-blob") {
    assertBlobConfigured();
    const result = await get(key, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) {
      throw new Error("Private file not found in configured Blob store");
    }
    return new Uint8Array(await new Response(result.stream).arrayBuffer());
  }
  return new Uint8Array(await readFile(filesystemTarget(key)));
}

export async function deletePrivateFile(storageKey: string): Promise<void> {
  const key = validatedKey(storageKey);
  if (privateStorageBackend() === "vercel-blob") {
    assertBlobConfigured();
    await del(key);
    return;
  }
  await unlink(filesystemTarget(key));
}

// Safe, non-secret configuration metadata for troubleshooting.
export function privateStorageDiagnostics(): {
  backend: PrivateStorageBackend;
  root?: string;
  blobConfigured?: boolean;
} {
  const backend = privateStorageBackend();
  if (backend === "filesystem") {
    return { backend, root: storageRoot() };
  }
  return {
    backend,
    blobConfigured: Boolean(
      process.env.BLOB_READ_WRITE_TOKEN ||
      (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID)
    ),
  };
}
