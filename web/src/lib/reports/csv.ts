export function csvCell(value: string | number | bigint | Date | null | undefined) {
  let text = value instanceof Date ? value.toISOString() : value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function csvRow(values: Array<string | number | bigint | Date | null | undefined>) {
  return values.map(csvCell).join(",");
}
