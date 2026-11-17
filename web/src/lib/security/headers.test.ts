import { describe, expect, it } from "vitest";
import { applicationSecurityHeaders } from "./headers";

describe("application security headers", () => {
  it("restricts active content, framing and cross-origin embedding", () => {
    const headers = Object.fromEntries(applicationSecurityHeaders(false).map(({ key, value }) => [key, value]));
    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Content-Security-Policy"]).toContain("script-src-attr 'none'");
    expect(headers["Cross-Origin-Resource-Policy"]).toBe("same-origin");
    expect(headers["Strict-Transport-Security"]).toBeUndefined();
  });

  it("adds transport pinning only for an HTTPS deployment", () => {
    const headers = Object.fromEntries(applicationSecurityHeaders(true).map(({ key, value }) => [key, value]));
    expect(headers["Strict-Transport-Security"]).toContain("max-age=31536000");
    expect(headers["Content-Security-Policy"]).toContain("upgrade-insecure-requests");
  });
});
