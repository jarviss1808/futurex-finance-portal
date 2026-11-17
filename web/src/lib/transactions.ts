// PostgreSQL aborts one side of a conflicting SERIALIZABLE transaction with SQLSTATE 40001
// (or 40P01 for deadlocks). The work is rolled back completely, so it is safe to run again.
const RETRYABLE_SQLSTATES = new Set(["40001", "40P01"]);
const RETRYABLE_MESSAGE = /could not serialize access|deadlock detected|write conflict/i;

export function isRetryableTransactionError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && typeof current === "object" && depth < 6; depth += 1) {
    const value = current as { code?: unknown; originalCode?: unknown; message?: unknown; cause?: unknown };
    if (value.code === "P2034") return true;
    if (typeof value.code === "string" && RETRYABLE_SQLSTATES.has(value.code)) return true;
    if (typeof value.originalCode === "string" && RETRYABLE_SQLSTATES.has(value.originalCode)) return true;
    if (typeof value.message === "string" && RETRYABLE_MESSAGE.test(value.message)) return true;
    current = value.cause;
  }
  return false;
}

export async function withTransactionRetry<T>(run: () => Promise<T>, attempts = 10): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts || !isRetryableTransactionError(error)) throw error;
      const ceiling = Math.min(800, 20 * 2 ** attempt);
      await new Promise((resolve) => setTimeout(resolve, ceiling / 2 + Math.random() * ceiling));
    }
  }
}
