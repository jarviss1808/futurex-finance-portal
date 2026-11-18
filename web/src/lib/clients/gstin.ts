
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function normalizeGstin(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidGstin(value: string): boolean {
  const gstin = normalizeGstin(value);

  if (
    !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(
      gstin
    )
  ) {
    return false;
  }

  let sum = 0;

  for (let index = 0; index < 14; index++) {
    const code = ALPHABET.indexOf(gstin[index]);
    if (code < 0) return false;

    const product =
      code * (index % 2 === 0 ? 1 : 2);

    sum += Math.floor(product / 36) + (product % 36);
  }

  const checkDigit =
    ALPHABET[(36 - (sum % 36)) % 36];

  return checkDigit === gstin[14];
}

export const OFFICIAL_GST_SEARCH_URL =
  "https://services.gst.gov.in/services/searchtp";
