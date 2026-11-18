
import "server-only";

import {
  isValidGstin,
  normalizeGstin,
} from "@/lib/clients/gstin";

import { fetchGstDetails } from "./provider";

type VerifiedSubmission = {
  gstin: string | null;
  legalName: string;
  tradeName: string;
  status: string;
  address: string;
  source: "api" | "manual" | null;
  verifiedAt: string | null;
};

export async function verifyGstSubmission(
  form: FormData
): Promise<VerifiedSubmission> {
  const get = (key: string) =>
    String(form.get(key) ?? "").trim();

  const gstin = normalizeGstin(get("gstin"));

  if (!gstin) {
    return {
      gstin: null,
      legalName: "",
      tradeName: "",
      status: "",
      address: "",
      source: null,
      verifiedAt: null,
    };
  }

  if (!isValidGstin(gstin)) {
    throw new Error("Invalid GSTIN");
  }

  const source = get("gstVerificationSource");
  const confirmed =
    get("confirmGstVerification") === "on";

  if (!confirmed) {
    throw new Error(
      "GST verification confirmation required"
    );
  }

  if (source === "api") {
    // Reverify server-side before trusting details.
    // This can consume another API credit.
    const record = await fetchGstDetails(gstin);

    if (
      get("gstVerifiedLegalName") !==
        record.legalName ||
      get("gstRegistrationStatus") !==
        record.status ||
      get("gstVerifiedAddress") !==
        record.address
    ) {
      throw new Error(
        "GST details have changed. Fetch again."
      );
    }

    return {
      gstin,
      legalName: record.legalName,
      tradeName: record.tradeName,
      status: record.status,
      address: record.address,
      source: "api",
      verifiedAt: record.verifiedAt,
    };
  }

  if (source !== "manual") {
    throw new Error("Invalid verification method");
  }

  const legalName = get("gstVerifiedLegalName");
  const status = get("gstRegistrationStatus");
  const address = get("gstVerifiedAddress");

  if (!legalName || !status || !address) {
    throw new Error("GST details are incomplete");
  }

  return {
    gstin,
    legalName,
    tradeName: get("gstTradeName"),
    status,
    address,
    source: "manual",
    verifiedAt: new Date().toISOString(),
  };
}
