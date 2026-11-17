import { describe, expect, it } from "vitest";
import { detectProofMediaType, proofDownloadHeaders, safeProofFileName } from "./proof-type";

describe("payment proof hardening", () => {
  it("detects content signatures and sanitizes filenames", () => {
    expect(detectProofMediaType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe("application/pdf");
    expect(safeProofFileName("..\\invoice\r\n.pdf", "application/pdf")).toBe(".._invoice_.pdf");
  });

  it("forces untrusted proofs to download in a sandboxed no-store response", () => {
    const headers = proofDownloadHeaders("proof.pdf\r\nX-Evil: yes", "application/pdf");
    expect(headers["Content-Disposition"]).toMatch(/^attachment;/);
    expect(headers["Content-Disposition"]).not.toMatch(/[\r\n]/);
    expect(headers["Content-Security-Policy"]).toContain("sandbox");
    expect(headers["Cache-Control"]).toBe("private, no-store");
  });
});
