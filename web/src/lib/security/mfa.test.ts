import { describe, expect, it } from "vitest";
import { consumeRecoveryCode, decryptMfaSecret, encryptMfaSecret, generateMfaSecret, generateRecoveryCodes, hashRecoveryCode, mfaRolloutState, totpCode, verifyTotp } from "./mfa";

const key = Buffer.alloc(32, 7).toString("base64url");

describe("admin MFA preparation", () => {
  it("matches the RFC 6238 SHA-1 vector and accepts only the adjacent time window", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(totpCode(secret, 59_000)).toBe("287082");
    expect(verifyTotp(secret, "287082", 59_000)).toBe(true);
    expect(verifyTotp(secret, "287082", 120_000)).toBe(false);
  });

  it("encrypts each TOTP secret with authenticated random AES-GCM data", () => {
    const secret = generateMfaSecret();
    const first = encryptMfaSecret(secret, key), second = encryptMfaSecret(secret, key);
    expect(first).not.toBe(second);
    expect(decryptMfaSecret(first, key)).toBe(secret);
    expect(() => decryptMfaSecret(first, Buffer.alloc(32, 8).toString("base64url"))).toThrow();
  });

  it("creates high-entropy one-time recovery codes and consumes only one match", () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    const hashes = codes.map((code) => hashRecoveryCode(code, key));
    const remaining = consumeRecoveryCode(codes[0].toLowerCase(), hashes, key);
    expect(remaining).toHaveLength(9);
    expect(consumeRecoveryCode(codes[0], remaining!, key)).toBeNull();
  });

  it("keeps enrollment and mandatory enforcement fail-closed by default", () => {
    expect(mfaRolloutState({})).toEqual({ keyConfigured: false, enrollmentEnabled: false, mandatory: false });
    expect(mfaRolloutState({ MFA_ENCRYPTION_KEY: key, ADMIN_MFA_ENROLLMENT_ENABLED: "true" })).toEqual({ keyConfigured: true, enrollmentEnabled: true, mandatory: false });
    expect(mfaRolloutState({ MFA_ENCRYPTION_KEY: key, ADMIN_MFA_ENROLLMENT_ENABLED: "true", ADMIN_MFA_REQUIRED: "true" }).mandatory).toBe(true);
  });
});
