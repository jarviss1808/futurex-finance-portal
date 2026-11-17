export function normalizeCompanyName(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

export function companyCanonicalKey(input: { legalName: string; countryCode: string; gstin?: string | null }) {
  const gstin = input.gstin?.trim().toUpperCase();
  if (gstin) return `GSTIN:${gstin}`;
  return `NAME:${normalizeCompanyName(input.legalName)}:${input.countryCode.trim().toUpperCase()}`;
}

export function defaultCurrencyForCountry(countryCode: string) {
  return countryCode.trim().toUpperCase() === "IN" ? "INR" : "USD";
}
