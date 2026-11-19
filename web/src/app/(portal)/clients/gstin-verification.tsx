
"use client";

import { useEffect, useRef, useState } from "react";

import {
  isValidGstin,
  normalizeGstin,
  OFFICIAL_GST_SEARCH_URL,
} from "@/lib/clients/gstin";

import type {
  GstDetails,
  GstLookupResponse,
} from "@/lib/gst/types";

export type GstVerificationDefaults = {
  gstin?: string | null;
  legalName?: string;
  tradeName?: string | null;
  status?: string | null;
  address?: string;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
};

type Mode = "none" | "api" | "manual";

type Props = {
  defaults?: GstVerificationDefaults;
  onDetailsFetched?: (details: GstDetails) => void;
  onGstinChange?: () => void;
};

export function GstinVerification({
  defaults = {},
  onDetailsFetched,
  onGstinChange,
}: Props) {
  const [gstin, setGstin] = useState(
    normalizeGstin(defaults.gstin ?? "")
  );

  const [mode, setMode] = useState<Mode>("none");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [manualConfirmed, setManualConfirmed] =
    useState(false);

  const [legalName, setLegalName] = useState(
    defaults.legalName ?? ""
  );

  const [tradeName, setTradeName] = useState(
    defaults.tradeName ?? ""
  );

  const [status, setStatus] = useState(
    defaults.status ?? ""
  );

  const [address, setAddress] = useState(
    defaults.address ?? ""
  );

  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [lookupAt, setLookupAt] = useState("");
  const [cached, setCached] = useState(false);

  // Prevent outdated requests from changing fields.
  const controllerRef = useRef<AbortController | null>(
    null
  );

  const requestIdRef = useRef(0);
  const gstinRef = useRef(gstin);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      controllerRef.current?.abort();
    };
  }, []);

  const valid = isValidGstin(gstin);

  function cancelLookup() {
    requestIdRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setLoading(false);
  }

  function resetVerification() {
    cancelLookup();

    setMode("none");
    setManualConfirmed(false);
    setError("");
    setLookupAt("");
    setCached(false);

    setLegalName("");
    setTradeName("");
    setStatus("");
    setAddress("");
    setState("");
    setPincode("");
  }

  function changeGstin(value: string) {
    const normalized = normalizeGstin(value).slice(0, 15);

    if (normalized === gstinRef.current) return;

    gstinRef.current = normalized;
    setGstin(normalized);

    resetVerification();

    // Clear previous API-filled parent fields.
    onGstinChange?.();
  }

  function enableManual() {
    cancelLookup();

    setMode("manual");
    setError("");
    setManualConfirmed(false);
    setLookupAt("");
    setCached(false);
  }

  function fillDetails(data: GstDetails) {
    setLegalName(data.legalName);
    setTradeName(data.tradeName ?? "");
    setStatus(data.status);
    setAddress(data.address ?? "");
    setState(data.state ?? "");
    setPincode(data.pincode ?? "");
    setLookupAt(data.verifiedAt);
    setCached(data.cached);
    setManualConfirmed(false);
    setMode("api");

    // Auto-fill main company name and billing address.
    onDetailsFetched?.(data);
  }

  async function lookupGstin() {
    if (!valid || loading) return;

    cancelLookup();

    const requestId = requestIdRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;

    const requestedGstin = gstinRef.current;

    setLoading(true);
    setError("");
    setMode("none");
    setLookupAt("");

    try {
      const response = await fetch(
        "/api/gst/lookup",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({
            gstin: requestedGstin,
          }),
          signal: controller.signal,
        }
      );

      const result: GstLookupResponse =
        await response.json();

      if (
        controller.signal.aborted ||
        requestId !== requestIdRef.current ||
        requestedGstin !== gstinRef.current
      ) {
        return;
      }

      if (!response.ok || !result.success) {
        throw new Error(
          result.success
            ? "GST lookup failed"
            : result.error
        );
      }

      if (result.data.gstin !== requestedGstin) {
        throw new Error("GSTIN mismatch");
      }

      fillDetails(result.data);
    } catch (cause) {
      if (
        controller.signal.aborted ||
        requestId !== requestIdRef.current
      ) {
        return;
      }

      setMode("none");

      setError(
        cause instanceof Error
          ? cause.message
          : "GST details could not be fetched"
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        controllerRef.current = null;
      }
    }
  }

  function updateField(
    setter: (value: string) => void,
    value: string
  ) {
    setter(value);

    // Editing API-verified details requires
    // manual confirmation again.
    if (mode === "api") {
      setMode("manual");
    }

    setManualConfirmed(false);
  }

  const showFields =
    valid && (mode === "api" || mode === "manual");

  const ready =
    valid &&
    legalName.trim().length > 0 &&
    status.trim().length > 0 &&
    address.trim().length > 0 &&
    (
      mode === "api" ||
      (mode === "manual" && manualConfirmed)
    );

  return (
    <>
      <label>
        GSTIN <small>(optional)</small>

        <input
          name="gstin"
          maxLength={15}
          value={gstin}
          onChange={(event) =>
            changeGstin(event.target.value)
          }
          aria-invalid={
            gstin.length > 0 && !valid
          }
          autoComplete="off"
        />
      </label>

      <div className="wide notice">
        <strong>GST Taxpayer Verification</strong>

        <p>
          Enter a GSTIN to fetch company details
          automatically, or verify them manually
          on the official GST portal.
        </p>

        <button
          type="button"
          className="button small"
          disabled={!valid || loading}
          onClick={lookupGstin}
        >
          {loading
            ? "Fetching GST Details..."
            : "Fetch GST Details"}
        </button>

        {" "}

        {valid && (
          <button
            type="button"
            className="button small secondary"
            disabled={loading}
            onClick={enableManual}
          >
            Enter Manually
          </button>
        )}

        {gstin && !valid && (
          <p className="error">
            GSTIN format or checksum is invalid.
          </p>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {valid && (
          <p>
            <a
              href={OFFICIAL_GST_SEARCH_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Verify on Official GST Portal
            </a>
          </p>
        )}

        {defaults.verifiedAt &&
          mode === "none" &&
          gstin ===
            normalizeGstin(defaults.gstin ?? "") && (
            <p className="success">
              Previously saved verification:{" "}
              {defaults.verifiedAt}
              {defaults.verifiedBy
                ? ` by ${defaults.verifiedBy}`
                : ""}
            </p>
          )}
      </div>

      {showFields && (
        <>
          {mode === "api" && (
            <div className="wide notice">
              <p className="success">
                GST details fetched successfully.
                Company name and billing address
                have been auto-filled.
              </p>

              <p>
                Source: GST lookup API
                {cached
                  ? " (provider cached result)"
                  : ""}
              </p>

              <p>Lookup time: {lookupAt}</p>

              {status.toLowerCase() !== "active" && (
                <p className="error">
                  Registration is not Active.
                  Review before saving.
                </p>
              )}
            </div>
          )}

          {mode === "manual" && (
            <div className="wide notice">
              <strong>Manual GST Verification</strong>

              <p>
                Open the official GST portal,
                complete the CAPTCHA, and
                enter the matching details.
              </p>

              <a
                className="button small secondary"
                href={OFFICIAL_GST_SEARCH_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Official GST Portal
              </a>
            </div>
          )}

          <label>
            Verified legal name

            <input
              name="gstVerifiedLegalName"
              value={legalName}
              onChange={(event) =>
                updateField(
                  setLegalName,
                  event.target.value
                )
              }
              required
            />
          </label>

          <label>
            Trade name <small>(optional)</small>

            <input
              name="gstTradeName"
              value={tradeName}
              onChange={(event) =>
                updateField(
                  setTradeName,
                  event.target.value
                )
              }
            />
          </label>

          <label>
            Registration status

            <input
              name="gstRegistrationStatus"
              value={status}
              onChange={(event) =>
                updateField(
                  setStatus,
                  event.target.value
                )
              }
              required
            />
          </label>

          <label className="wide">
            Registered Business Address

            <textarea
              name="gstVerifiedAddress"
              rows={3}
              value={address}
              onChange={(event) =>
                updateField(
                  setAddress,
                  event.target.value
                )
              }
              required
            />
          </label>

          <label>
            State

            <input
              name="gstState"
              value={state}
              onChange={(event) =>
                updateField(
                  setState,
                  event.target.value
                )
              }
            />
          </label>

          <label>
            PIN Code

            <input
              name="gstPincode"
              maxLength={6}
              value={pincode}
              onChange={(event) =>
                updateField(
                  setPincode,
                  event.target.value.replace(/\D/g, "")
                )
              }
            />
          </label>

          {mode === "manual" && (
            <label className="wide check-inline">
              <input
                type="checkbox"
                checked={manualConfirmed}
                onChange={(event) =>
                  setManualConfirmed(event.target.checked)
                }
              />

              I checked this GSTIN on the official
              GST portal and confirm the details
              match its result.
            </label>
          )}

          <input
            type="hidden"
            name="gstVerificationSource"
            value={ready ? mode : ""}
          />

          <input
            type="hidden"
            name="gstLookupAt"
            value={
              ready && mode === "api"
                ? lookupAt
                : ""
            }
          />

          <input
            type="hidden"
            name="confirmGstVerification"
            value={ready ? "on" : ""}
          />

          {ready ? (
            <p className="wide success">
              GST details ready for review and save.
            </p>
          ) : (
            <p className="wide error">
              Complete GST verification before saving.
            </p>
          )}
        </>
      )}
    </>
  );
}
