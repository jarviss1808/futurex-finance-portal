
import "server-only";

import {
  isValidGstin,
  normalizeGstin,
} from "@/lib/clients/gstin";

import type { GstDetails } from "./types";

type ProviderResponse = {
  success?: boolean;
  cached?: boolean;
  data?: {
    gstin?: string;
    legal_name?: string;
    trade_name?: string | null;
    status?: string;
    address?: string;
    state?: string;
    pincode?: string;
  };
};

export class GstLookupError extends Error {
  constructor(
    message: string,
    public readonly status = 502
  ) {
    super(message);
    this.name = "GstLookupError";
  }
}

export async function fetchGstDetails(
  value: string
): Promise<GstDetails> {
  const gstin = normalizeGstin(value);

  if (!isValidGstin(gstin)) {
    throw new GstLookupError("Invalid GSTIN", 400);
  }

  const apiKey = process.env.GSTIN_API_KEY;

  if (!apiKey) {
    throw new GstLookupError(
      "GST lookup service is not configured",
      503
    );
  }

  let response: Response;

  try {
    response = await fetch(
      `https://gstin.cloud/api/v1/verify/${gstin}`,
      {
        method: "GET",
        headers: {
          "X-API-Key": apiKey,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      }
    );
  } catch {
    throw new GstLookupError(
      "GST service is temporarily unreachable",
      503
    );
  }

  if (response.status === 429) {
    throw new GstLookupError(
      "GST lookup limit reached. Try again later.",
      429
    );
  }

  if (!response.ok) {
    throw new GstLookupError(
      "GST service failed. Use manual verification.",
      502
    );
  }

  let body: ProviderResponse;

  try {
    body = (await response.json()) as ProviderResponse;
  } catch {
    throw new GstLookupError(
      "Invalid GST provider response",
      502
    );
  }

  const data = body.data;

  if (
    body.success !== true ||
    !data ||
    normalizeGstin(data.gstin ?? "") !== gstin ||
    !data.legal_name?.trim() ||
    !data.status?.trim()
  ) {
    throw new GstLookupError(
      "No valid GST record found. Verify manually.",
      404
    );
  }

  return {
    gstin,
    legalName: data.legal_name,
    tradeName: data.trade_name ?? "",
    status: data.status,
    address: data.address ?? "",
    state: data.state ?? "",
    pincode: data.pincode ?? "",
    verifiedAt: new Date().toISOString(),
    source: "api",
    cached: body.cached === true,
  };
}
