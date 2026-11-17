import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import { deletePrivateFile, privateStorageBackend, readPrivateFile, writePrivateFile } from "./private-files";

const originalBackend = process.env.PRIVATE_STORAGE_BACKEND;
const originalRoot = process.env.PRIVATE_STORAGE_ROOT;
const roots: string[] = [];

afterEach(async () => {
  if (originalBackend === undefined) delete process.env.PRIVATE_STORAGE_BACKEND;
  else process.env.PRIVATE_STORAGE_BACKEND = originalBackend;
  if (originalRoot === undefined) delete process.env.PRIVATE_STORAGE_ROOT;
  else process.env.PRIVATE_STORAGE_ROOT = originalRoot;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("private storage backend", () => {
  it("keeps the existing filesystem backend as the default", () => {
    delete process.env.PRIVATE_STORAGE_BACKEND;
    expect(privateStorageBackend()).toBe("filesystem");
  });

  it("writes, reads and deletes an authorized local private key", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "futurex-private-"));
    roots.push(root);
    process.env.PRIVATE_STORAGE_BACKEND = "filesystem";
    process.env.PRIVATE_STORAGE_ROOT = root;
    const expected = new Uint8Array([1, 2, 3, 4]);
    await writePrivateFile("payment-proofs/org/file.pdf", expected, "application/pdf");
    expect(await readPrivateFile("payment-proofs/org/file.pdf")).toEqual(expected);
    await deletePrivateFile("payment-proofs/org/file.pdf");
    await expect(readPrivateFile("payment-proofs/org/file.pdf")).rejects.toThrow();
  });

  it("rejects traversal before touching either backend", async () => {
    process.env.PRIVATE_STORAGE_BACKEND = "filesystem";
    await expect(readPrivateFile("../../outside.txt")).rejects.toThrow("Invalid private storage key");
  });
});
