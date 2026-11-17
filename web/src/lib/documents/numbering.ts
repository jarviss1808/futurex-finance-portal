type Series = { prefix: string; suffix: string; padding: number; financialYear: string; configured: boolean };
type AllocatedRow = { allocated: bigint; prefix: string; suffix: string; padding: number; financialYear: string };

export function formatDocumentNumber(series: Series, serial: bigint): string {
  if (!series.configured) throw new Error("Number series is not verified");
  if (serial < 0n || series.padding < 1 || series.padding > 12) throw new Error("Invalid number series");
  return `${series.prefix}${serial.toString().padStart(series.padding, "0")}${series.suffix}`;
}

/** Returns the serial embedded in `number` when it belongs to the series format, otherwise null. */
export function parseSerial(number: string, series: Pick<Series, "prefix" | "suffix">): bigint | null {
  if (!number.startsWith(series.prefix) || !number.endsWith(series.suffix)) return null;
  const middle = number.slice(series.prefix.length, number.length - series.suffix.length);
  return /^\d{1,18}$/.test(middle) ? BigInt(middle) : null;
}

/** Highest serial already used by `numbers` in this series format (issued or voided), or null when unused. */
export function highestUsedSerial(numbers: Iterable<string | null>, series: Pick<Series, "prefix" | "suffix">): bigint | null {
  let highest: bigint | null = null;
  for (const number of numbers) {
    if (!number) continue;
    const serial = parseSerial(number, series);
    if (serial !== null && (highest === null || serial > highest)) highest = serial;
  }
  return highest;
}

/**
 * Atomically takes the next serial. The counter row is locked by the UPDATE, so concurrent issuers
 * queue on it; a rolled-back transaction also rolls back its increment, so no gaps are created.
 * Prefix, suffix and padding are read from the same locked row, so an Admin change applies to the
 * very next allocation.
 */
export async function allocateDocumentNumber(
  tx: { $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<AllocatedRow[]> },
  seriesId: string,
  series: Series,
): Promise<string> {
  if (!series.configured) throw new Error("Number series is not verified");
  const rows = await tx.$queryRaw`
    UPDATE "DocumentSeries"
       SET "nextNumber" = "nextNumber" + 1, "updatedAt" = NOW()
     WHERE "id" = ${seriesId} AND "configured" = TRUE
     RETURNING "nextNumber" - 1 AS allocated, "prefix", "suffix", "padding", "financialYear"
  `;
  if (rows.length !== 1) throw new Error("Number series unavailable");
  const row = rows[0];
  return formatDocumentNumber({ prefix: row.prefix, suffix: row.suffix, padding: Number(row.padding), financialYear: row.financialYear, configured: true }, BigInt(row.allocated));
}
