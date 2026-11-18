import { NextRequest, NextResponse } from "next/server";

import { currentUser } from "@/lib/security/session";
import { assertSameOrigin } from "@/lib/security/request";

import {
  isValidGstin,
  normalizeGstin,
} from "@/lib/clients/gstin";

import {
  fetchGstDetails,
  GstLookupError,
} from "@/lib/gst/provider";

// No runtime or dynamic route segment exports.

function reply(body: object, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: NextRequest) {
  // 1. Same-origin security
  try {
    assertSameOrigin(request);
  } catch {
    return reply(
      { success: false, error: "Forbidden origin" },
      403
    );
  }

  // 2. Existing FutureX login session
  const user = await currentUser();

  if (!user || !user.active) {
    return reply(
      {
        success: false,
        error: "Please log in again",
      },
      401
    );
  }

  // 3. Basic request size check
  const contentLength = request.headers.get(
    "content-length"
  );

  if (
    contentLength &&
    Number(contentLength) > 1024
  ) {
    return reply(
      {
        success: false,
        error: "Request too large",
      },
      413
    );
  }

  // 4. Read JSON safely
  let payload: unknown;

  try {
    const text = await request.text();

    if (text.length > 1024) {
      return reply(
        {
          success: false,
          error: "Request too large",
        },
        413
      );
    }

    payload = JSON.parse(text);
  } catch {
    return reply(
      {
        success: false,
        error: "Invalid JSON",
      },
      400
    );
  }

  // 5. Validate GSTIN input
  if (
    !payload ||
    typeof payload !== "object" ||
    !("gstin" in payload) ||
    typeof payload.gstin !== "string"
  ) {
    return reply(
      {
        success: false,
        error: "GSTIN is required",
      },
      400
    );
  }

  const gstin = normalizeGstin(payload.gstin);

  if (!isValidGstin(gstin)) {
    return reply(
      {
        success: false,
        error: "Invalid GSTIN",
      },
      400
    );
  }

  // 6. Fetch GST details
  try {
    const data = await fetchGstDetails(gstin);

    return reply(
      {
        success: true,
        data,
      },
      200
    );
  } catch (error) {
    if (error instanceof GstLookupError) {
      return reply(
        {
          success: false,
          error: error.message,
        },
        error.status
      );
    }

    console.error("GST lookup failed", error);

    return reply(
      {
        success: false,
        error: "GST lookup failed. Try manual verification.",
      },
      500
    );
  }
}
