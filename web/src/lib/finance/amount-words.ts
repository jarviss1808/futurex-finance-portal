const ONES = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function underThousand(value: bigint): string {
  if (value < 20n) return ONES[Number(value)];
  if (value < 100n) return `${TENS[Number(value / 10n)]}${value % 10n ? `-${ONES[Number(value % 10n)]}` : ""}`;
  return `${ONES[Number(value / 100n)]} Hundred${value % 100n ? ` ${underThousand(value % 100n)}` : ""}`;
}

function international(value: bigint): string {
  if (value < 1000n) return underThousand(value);
  const scales: Array<[bigint, string]> = [[1_000_000_000_000n, "Trillion"], [1_000_000_000n, "Billion"], [1_000_000n, "Million"], [1_000n, "Thousand"]];
  for (const [size, name] of scales) if (value >= size) return `${international(value / size)} ${name}${value % size ? ` ${international(value % size)}` : ""}`;
  return "";
}

function indian(value: bigint): string {
  if (value < 1000n) return underThousand(value);
  const scales: Array<[bigint, string]> = [[10_000_000n, "Crore"], [100_000n, "Lakh"], [1_000n, "Thousand"]];
  for (const [size, name] of scales) if (value >= size) return `${indian(value / size)} ${name}${value % size ? ` ${indian(value % size)}` : ""}`;
  return "";
}

export function amountInWords(valuePaise: bigint, currency: string): string {
  if (valuePaise < 0n) throw new Error("Amount in words requires a non-negative value");
  const major = valuePaise / 100n;
  const minor = valuePaise % 100n;
  const code = currency.toUpperCase();
  const majorWords = code === "INR" ? indian(major) : international(major);
  const majorUnit = code === "INR" ? "Indian Rupees" : code === "USD" ? "US Dollars" : code;
  const minorUnit = code === "INR" ? "Paise" : code === "USD" ? "Cents" : "Minor Units";
  return `${majorUnit} ${majorWords}${minor ? ` and ${underThousand(minor)} ${minorUnit}` : ""} Only`;
}

export function documentMoney(valuePaise: bigint, currency: string): string {
  const absolute = valuePaise < 0n ? -valuePaise : valuePaise;
  const integer = (absolute / 100n).toString();
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  const grouped = currency.toUpperCase() === "INR" && integer.length > 3
    ? `${integer.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${integer.slice(-3)}`
    : integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${valuePaise < 0n ? "-" : ""}${currency.toUpperCase()} ${grouped}.${fraction}`;
}
