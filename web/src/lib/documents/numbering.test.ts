import { describe, expect, it } from "vitest";
import { allocateDocumentNumber, formatDocumentNumber, highestUsedSerial, parseSerial } from "./numbering";
import { isRetryableTransactionError, withTransactionRetry } from "@/lib/transactions";

describe("document numbering", () => {
  const series = { prefix: "FUT/PI/26-27/P", suffix: "", padding: 3, financialYear: "26-27", configured: true };
  it("formats only verified series", () => {
    expect(formatDocumentNumber(series, 109n)).toBe("FUT/PI/26-27/P109");
    expect(() => formatDocumentNumber({ ...series, configured: false }, 109n)).toThrow(/not verified/);
  });
  it("allocates through one atomic database statement", async () => {
    let calls = 0;
    const tx = { $queryRaw: async () => { calls++; return [{ allocated: 109n, prefix: "FUT/PI/26-27/P", suffix: "", padding: 3, financialYear: "26-27" }]; } };
    await expect(allocateDocumentNumber(tx, "series", series)).resolves.toBe("FUT/PI/26-27/P109");
    expect(calls).toBe(1);
  });
  it("formats with the prefix read from the locked row, not a stale copy", async () => {
    const tx = { $queryRaw: async () => [{ allocated: 500n, prefix: "FUT/PI/27-28/", suffix: "", padding: 3, financialYear: "27-28" }] };
    await expect(allocateDocumentNumber(tx, "series", series)).resolves.toBe("FUT/PI/27-28/500");
  });
  it("parses serials only for the matching series format", () => {
    expect(parseSerial("FUT/PI/26-27/002", { prefix: "FUT/PI/26-27/", suffix: "" })).toBe(2n);
    expect(parseSerial("FUT/PI/26-27/P109", { prefix: "FUT/PI/26-27/", suffix: "" })).toBeNull();
    expect(parseSerial("FUT/PI/25-26/009", { prefix: "FUT/PI/26-27/", suffix: "" })).toBeNull();
    expect(highestUsedSerial(["FUT/PI/26-27/002", null, "FUT/PI/26-27/010", "OTHER/011"], { prefix: "FUT/PI/26-27/", suffix: "" })).toBe(10n);
    expect(highestUsedSerial([], { prefix: "X/", suffix: "" })).toBeNull();
  });
});

describe("transaction retry", () => {
  it("recognises PostgreSQL serialization and deadlock failures", () => {
    expect(isRetryableTransactionError({ code: "P2034" })).toBe(true);
    expect(isRetryableTransactionError({ cause: { originalCode: "40001" } })).toBe(true);
    expect(isRetryableTransactionError(new Error("could not serialize access due to concurrent update"))).toBe(true);
    expect(isRetryableTransactionError(new Error("Payment not found"))).toBe(false);
  });
  it("retries only retryable failures", async () => {
    let calls = 0;
    await expect(withTransactionRetry(async () => { calls++; if (calls < 3) throw { code: "40001" }; return "ok"; })).resolves.toBe("ok");
    expect(calls).toBe(3);
    calls = 0;
    await expect(withTransactionRetry(async () => { calls++; throw new Error("validation"); })).rejects.toThrow("validation");
    expect(calls).toBe(1);
  });
});
