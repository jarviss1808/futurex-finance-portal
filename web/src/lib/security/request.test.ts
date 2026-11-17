import { describe, expect, it } from "vitest";
import { HttpError } from "@/lib/http";
import { assertRequestBodySize, assertSameOrigin, requestClientIp } from "./request";
describe("mutation origin validation", () => {
  it("allows same-origin requests", () => expect(() => assertSameOrigin(new Request("https://portal.test/api", { headers: { origin: "https://portal.test" } }))).not.toThrow());
  it("rejects missing and cross-origin headers", () => { expect(() => assertSameOrigin(new Request("https://portal.test/api"))).toThrow(); expect(() => assertSameOrigin(new Request("https://portal.test/api", { headers: { origin: "https://evil.test" } }))).toThrow(); });
  it("returns a controlled forbidden error", () => {
    try { assertSameOrigin(new Request("https://portal.test/api", { headers: { origin: "https://evil.test" } })); }
    catch (error) { expect(error).toBeInstanceOf(HttpError); expect((error as HttpError).status).toBe(403); }
  });
});

describe("request boundary guards", () => {
  it("requires a valid bounded Content-Length before multipart parsing", () => {
    expect(() => assertRequestBodySize(new Request("https://portal.test", { headers: { "content-length": "1024" } }), 2048)).not.toThrow();
    for (const value of [undefined, "abc", "2049"]) {
      const headers = value ? { "content-length": value } : undefined;
      expect(() => assertRequestBodySize(new Request("https://portal.test", { headers }), 2048)).toThrow(HttpError);
    }
  });

  it("uses the trusted proxy hop instead of a spoofable first forwarded value", () => {
    expect(requestClientIp(new Request("https://portal.test", { headers: { "x-real-ip": "203.0.113.7", "x-forwarded-for": "6.6.6.6, 10.0.0.2" } }))).toBe("203.0.113.7");
    expect(requestClientIp(new Request("https://portal.test", { headers: { "x-forwarded-for": "6.6.6.6, 10.0.0.2" } }))).toBe("10.0.0.2");
  });
});
