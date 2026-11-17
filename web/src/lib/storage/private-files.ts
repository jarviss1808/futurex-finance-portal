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

function validatedKey(storageKey: string) {
  const normalized = path.posix.normalize(storageKey.replaceAll("\\", "/"));
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.startsWith("/") || normalized.includes("/../")) {
    throw new Error("Invalid private storage key");
  }
  return normalized;
}

function filesystemTarget(storageKey: string) {
  const root = path.resolve(/* turbopackIgnore: true */ process.env.PRIVATE_STORAGE_ROOT ?? "./.private");
  const target = path.resolve(root, validatedKey(storageKey));
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Invalid private storage path");
  return target;
}

function assertBlobConfigured() {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !(process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID)) {
    throw new Error("Vercel Private Blob is not connected");
  }
}

export async function writePrivateFile(storageKey: string, bytes: Uint8Array, mediaType = "application/octet-stream") {
  const key = validatedKey(storageKey);
  if (privateStorageBackend() === "vercel-blob") {
    assertBlobConfigured();
    await put(key, Buffer.from(bytes), { access: "private", addRandomSuffix: false, allowOverwrite: false, contentType: mediaType });
    return;
  }
  const target = filesystemTarget(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });
}

export async function readPrivateFile(storageKey: string) {
  const key = validatedKey(storageKey);
  if (privateStorageBackend() === "vercel-blob") {
    assertBlobConfigured();
    const result = await get(key, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) throw new Error("Private file not found");
    return new Uint8Array(await new Response(result.stream).arrayBuffer());
  }
  return new Uint8Array(await readFile(filesystemTarget(key)));
}

export async function deletePrivateFile(storageKey: string) {
  const key = validatedKey(storageKey);
  if (privateStorageBackend() === "vercel-blob") {
    assertBlobConfigured();
    await del(key);
    return;
  }
  await unlink(filesystemTarget(key));
}
