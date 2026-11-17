import { describe, expect, it } from "vitest";
import { assertDisposableDatabaseUrl } from "./database-safety.mjs";

describe("destructive database target guard", () => {
  it("allows only explicitly named disposable integration and restore databases", () => {
    expect(assertDisposableDatabaseUrl("postgresql://qa:secret@127.0.0.1/futurex_test").database).toBe("futurex_test");
    expect(assertDisposableDatabaseUrl("postgresql://qa:secret@127.0.0.1/futurex_restore_test", { purpose: "restore" }).database).toBe("futurex_restore_test");
  });

  it("rejects production, system, wrong-purpose, and same-as-production targets", () => {
    expect(() => assertDisposableDatabaseUrl("postgresql://app:secret@db/futurex")).toThrow(/must end with _test/);
    expect(() => assertDisposableDatabaseUrl("postgresql://app:secret@db/postgres")).toThrow();
    expect(() => assertDisposableDatabaseUrl("postgresql://app:secret@db/futurex_test", { purpose: "restore" })).toThrow(/_restore_test/);
    expect(() => assertDisposableDatabaseUrl("postgresql://app:one@db/futurex_test", { productionUrl: "postgresql://app:two@db/futurex_test?schema=public" })).toThrow(/DATABASE_URL/);
  });
});
