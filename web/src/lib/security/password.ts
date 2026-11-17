import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

const scrypt = (password: string, salt: Buffer, length: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCallback(password, salt, length, options, (error, derived) => error ? reject(error) : resolve(derived)));

// Valid non-user hash used to keep unknown-account login checks on the same scrypt path.
export const DUMMY_PASSWORD_HASH = "scrypt$32768$8$1$ZnV0dXJleC1kdW1teS1zYWx0$Xg5hQgkD2FGntkrxdUn13L2bcD4el29HhUufj4ZABXIQJEN7ydWaXfQTChYfN5AxDXhCTdr95cokHNb3VjgXtw";

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 200) throw new Error("Password must be 12-200 characters");
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$32768$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, n, r, p, saltText, hashText] = stored.split("$");
  if (algorithm !== "scrypt" || !n || !r || !p || !saltText || !hashText) return false;
  try {
    const expected = Buffer.from(hashText, "base64url");
    const actual = await scrypt(password, Buffer.from(saltText, "base64url"), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}
