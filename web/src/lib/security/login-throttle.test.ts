import { describe, expect, it } from "vitest";
import { loginThrottleKeys } from "./login-throttle";

describe("login throttle keys", () => {
  it("keeps an account-wide bucket when a caller spoofs different proxy IP values", () => {
    const first = loginThrottleKeys("Admin@Futurex.Local", "203.0.113.1");
    const second = loginThrottleKeys("admin@futurex.local", "198.51.100.9");
    expect(first[0]).toBe(second[0]);
    expect(first[1]).not.toBe(second[1]);
  });
});
