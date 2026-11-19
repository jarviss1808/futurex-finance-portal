
import "server-only";

import { z } from "zod";

import {
  isValidGstin,
  normalizeGstin,
} from "@/lib/clients/gstin";

import type { GstDetails } from "./types";

// Fixed trusted endpoint. Never accept an arbitrary
// provider URL from a browser request.
const GST_API_BASE =
  "https://gstin.cloud/api/v1/verify";

// Default timeout: 5 seconds.
const DEFAULT_TIMEOUT_MS = 5000;

// Provider data validation.
const providerSchema = z.object({
  success: z.boolean(),
  cached: z.boolean().optional(),

  data: z.object({
    gstin: z.string(),

    legal_name: z.string(),

    trade_name: z.string().nullish(),

    status: z.string(),

    address: z.string().nullish(),

    state: z.string().nullish(),

    pincode: z.string().nullish(),
  }).optional(),

  error: z.string().optional(),
});

export class GstLookupError extends Error {
  constructor(
    message: string,
    public readonly status = 502
  ) {
    super(message);
    this.name = "GstLookupError";
  }
}

function getTimeout(): number {
  const configured = Number(
    process.env.GST_LOOKUP_TIMEOUT_MS ??
      DEFAULT_TIMEOUT_MS
  );

  if (!Number.isFinite(configured)) {
    return DEFAULT_TIMEOUT_MS;
  }

  // Keep configurable timeouts within safe limits.
  return Math.min(
    10000,
    Math.max(2000, configured)
  );
}

function handleProviderError(status: number): never {
  // Only safe metadata is logged.
  console.error("[GST Lookup] Provider failure", {
    status,
  });

  switch (status) {
    case 400:
    case 422:
      throw new GstLookupError(
        "GST number rejected by verification service.",
        422
      );

    case 401:
      throw new GstLookupError(
        "GST API authentication failed. Contact administrator.",
        503
      );

    case 402:
      throw new GstLookupError(
        "GST API credits exhausted. Contact administrator.",
        503
      );

    case 403:
      throw new GstLookupError(
        "GST API access is restricted. Contact administrator.",
        503
      );

    case 404:
      throw new GstLookupError(
        "GST record not found. Verify manually.",
        404
      );

    case 429:
      throw new GstLookupError(
        "GST lookup rate limit reached. Try later.",
        429
      );

    case 500:
    case 502:
    case 503:
    case 504:
      throw new GstLookupError(
        "GST verification service is temporarily unavailable. Use manual verification.",
        503
      );

    default:
      throw new GstLookupError(
        "GST lookup failed. Use manual verification.",
        502
      );
  }
}

export async function fetchGstDetails(
  value: string
): Promise<GstDetails> {
  // 1. Normalize and validate locally.
  const gstin = normalizeGstin(value);

  if (!isValidGstin(gstin)) {
    throw new GstLookupError(
      "Invalid GST number.",
      400
    );
  }

  // 2. Read credentials on server only.
  const apiKey = process.env.GSTIN_API_KEY?.trim();

  if (!apiKey) {
    throw new GstLookupError(
      "GST lookup API is not configured.",
      503
    );
  }

  // 3. Fixed URL + validated GSTIN.
  const url =
    `${GST_API_BASE}/${encodeURIComponent(gstin)}`;

  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",

      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
      },

      cache: "no-store",

      signal: AbortSignal.timeout(getTimeout()),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (
        error.name === "TimeoutError" ||
        error.name === "AbortError"
      )
    ) {
      throw new GstLookupError(
        "GST lookup timed out. Please try again or verify manually.",
        504
      );
    }

    console.error(
      "[GST Lookup] Provider connection failure"
    );

    throw new GstLookupError(
      "Unable to connect to GST service. Use manual verification.",
      503
    );
  }

  // 4. Handle upstream errors individually.
  if (!response.ok) {
    handleProviderError(response.status);
  }

  // 5. Parse JSON.
  let raw: unknown;

  try {
    raw = await response.json();
  } catch {
    throw new GstLookupError(
      "GST provider returned invalid JSON.",
      502
    );
  }

  // 6. Validate external response shape.
  const parsed = providerSchema.safeParse(raw);

  if (!parsed.success) {
    console.error(
      "[GST Lookup] Unexpected provider response shape"
    );

    throw new GstLookupError(
      "Unexpected GST provider response. Use manual verification.",
      502
    );
  }

  const body = parsed.data;

  if (!body.success || !body.data) {
    throw new GstLookupError(
      "GST details are unavailable. Verify manually.",
      404
    );
  }

  const data = body.data;

  // 7. Verify requested GSTIN matches response.
  if (
    normalizeGstin(data.gstin) !== gstin
  ) {
    throw new GstLookupError(
      "GST provider returned mismatched data.",
      502
    );
  }

  // 8. Check essential company fields.
  const legalName = data.legal_name.trim();
  const status = data.status.trim();
  const address = data.address?.trim() ?? "";

  if (!legalName || !status) {
    throw new GstLookupError(
      "Incomplete GST details. Verify manually.",
      422
    );
  }

  // 9. Return existing frontend-compatible shape.
  return {
    gstin,

    legalName,

    tradeName:
      data.trade_name?.trim() ?? "",

    status,

    address,

    state:
      data.state?.trim() ?? "",

    pincode:
      data.pincode?.trim() ?? "",

    verifiedAt:
      new Date().toISOString(),

    source: "api",

    cached: body.cached === true,
  };
}
