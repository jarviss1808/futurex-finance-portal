import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js/min";

const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

export const COUNTRIES = getCountries()
  .map((code) => ({ code, name: displayNames.of(code) ?? code, dialCode: `+${getCountryCallingCode(code)}` }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const COUNTRY_CODES = new Set<string>(COUNTRIES.map((country) => country.code));

export function dialCodeForCountry(code: string) {
  const country = code.toUpperCase() as CountryCode;
  return COUNTRY_CODES.has(country) ? `+${getCountryCallingCode(country)}` : "+91";
}
