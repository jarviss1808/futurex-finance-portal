import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function encryptionKey(text: string) {
  const key = Buffer.from(text, "base64url");
  if (key.length !== 32) throw new Error("MFA_ENCRYPTION_KEY must be 32 random bytes encoded as base64url");
  return key;
}

function base32Encode(bytes: Uint8Array) {
  let bits = 0, value = 0, output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { output += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(text: string) {
  const normalized = text.toUpperCase().replace(/=+$/, "");
  let bits = 0, value = 0;
  const bytes: number[] = [];
  for (const character of normalized) {
    const index = BASE32.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}

export function generateMfaSecret() {
  return base32Encode(randomBytes(20));
}

export function encryptMfaSecret(secret: string, keyText: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(keyText), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptMfaSecret(value: string, keyText: string) {
  const [version, ivText, tagText, ciphertextText] = value.split(".");
  if (version !== "v1" || !ivText || !tagText || !ciphertextText) throw new Error("Invalid MFA secret envelope");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(keyText), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
}

export function totpCode(secret: string, timeMs = Date.now(), digits = 6) {
  const counter = BigInt(Math.floor(timeMs / 30_000));
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(counter);
  const digest = createHmac("sha1", base32Decode(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % (10 ** digits)).padStart(digits, "0");
}

export function verifyTotp(secret: string, candidate: string, timeMs = Date.now()) {
  if (!/^\d{6}$/.test(candidate)) return false;
  const supplied = Buffer.from(candidate);
  return [-1, 0, 1].some((offset) => timingSafeEqual(supplied, Buffer.from(totpCode(secret, timeMs + offset * 30_000))));
}

export function generateRecoveryCodes(count = 10) {
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error("Recovery-code count must be 1-20");
  return Array.from({ length: count }, () => randomBytes(10).toString("hex").toUpperCase().match(/.{1,5}/g)!.join("-"));
}

function normalizeRecoveryCode(code: string) {
  return code.toUpperCase().replace(/[^A-F0-9]/g, "");
}

export function hashRecoveryCode(code: string, keyText: string) {
  return createHmac("sha256", encryptionKey(keyText)).update(normalizeRecoveryCode(code)).digest("base64url");
}

export function consumeRecoveryCode(code: string, storedHashes: readonly string[], keyText: string) {
  const candidate = Buffer.from(hashRecoveryCode(code, keyText));
  const index = storedHashes.findIndex((hash) => {
    const value = Buffer.from(hash);
    return value.length === candidate.length && timingSafeEqual(value, candidate);
  });
  return index < 0 ? null : storedHashes.filter((_, current) => current !== index);
}

export function mfaRolloutState(env: Record<string, string | undefined> = process.env) {
  let keyConfigured = false;
  try { if (env.MFA_ENCRYPTION_KEY) { encryptionKey(env.MFA_ENCRYPTION_KEY); keyConfigured = true; } } catch { keyConfigured = false; }
  const enrollmentEnabled = env.ADMIN_MFA_ENROLLMENT_ENABLED === "true" && keyConfigured;
  return { keyConfigured, enrollmentEnabled, mandatory: enrollmentEnabled && env.ADMIN_MFA_REQUIRED === "true" };
}
