
"use client";

import { useState } from "react";

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

export function GstinVerification({
  defaults = {},
}: {
  defaults?: GstVerificationDefaults;
}) {
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

  const valid = isValidGstin(gstin);

  function resetVerification() {
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
    setGstin(
      normalizeGstin(value).slice(0, 15)
    );
    resetVerification();
  }

  function enableManual() {
    setMode("manual");
    setError("");
    setManualConfirmed(false);
    setLookupAt("");
    setCached(false);
  }

  function fillDetails(data: GstDetails) {
    setLegalName(data.legalName);
    setTradeName(data.tradeName);
    setStatus(data.status);
    setAddress(data.address);
    setState(data.state);
    setPincode(data.pincode);
    setLookupAt(data.verifiedAt);
    setCached(data.cached);
    setManualConfirmed(false);
    setMode("api");
  }

  async function lookupGstin() {
    if (!valid || loading) return;

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
          body: JSON.stringify({ gstin }),
        }
      );

      const result: GstLookupResponse =
        await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.success
            ? "GST lookup failed"
            : result.error
        );
      }

      // Ensure the response belongs to the input.
      if (result.data.gstin !== gstin) {
        throw new Error("GSTIN mismatch");
      }

      fillDetails(result.data);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not fetch GST details"
      );

      // User can switch to manual verification.
      setMode("none");
    } finally {
      setLoading(false);
    }
  }

  function updateField(
    setter: (value: string) => void,
    value: string
  ) {
    setter(value);

    // Editing fetched details invalidates automatic
    // verification; manual review is then required.
    if (mode === "api") {
      setMode("manual");
      setManualConfirmed(false);
    }

    if (mode === "manual") {
      setManualConfirmed(false);
    }
  }

  const showFields =
    valid && (mode === "api" || mode === "manual");

  const ready =
    valid &&
    legalName.trim().length > 0 &&
    status.trim().length > 0 &&
    address.trim().length > 0 &&
    (mode === "api" ||
      (mode === "manual" && manualConfirmed));

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
          Enter a GSTIN to automatically fetch company
          details, or verify manually on the official
          GST portal.
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
            <p>
              Previously saved verification:{" "}
              {defaults.verifiedAt}
            </p>
          )}
      </div>

      {showFields && (
        <>
          {mode === "api" && (
            <div className="wide notice">
              <p className="success">
                GST details retrieved successfully.
              </p>

              <p>
                Source: GST lookup API
                {cached
                  ? " (provider cached result)"
                  : ""}
              </p>

              <p>
                Lookup time: {lookupAt}
              </p>

              {status.toLowerCase() !== "active" && (
                <p className="error">
                  Registration status is not Active.
                  Review before saving.
                </p>
              )}
            </div>
          )}

          {mode === "manual" && (
            <div className="wide notice">
              <strong>Manual Verification</strong>

              <p>
                Open the official GST portal,
                complete the CAPTCHA, search
                this GSTIN, and enter the
                matching details below.
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
            Legal Company Name
            <input
              name="gstVerifiedLegalName"
              value={legalName}
              onChange={(event) =>
                updateField(
                  setLegalName,
                  event.target.value
                )
              }
              required={showFields}
            />
          </label>

          <label>
            Trade Name <small>(optional)</small>
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
            Registration Status
            <input
              name="gstRegistrationStatus"
              value={status}
              onChange={(event) =>
                updateField(
                  setStatus,
                  event.target.value
                )
              }
              required={showFields}
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
              required={showFields}
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
                  event.target.value.replace(
                    /\D/g,
                    ""
                  )
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
                  setManualConfirmed(
                    event.target.checked
                  )
                }
              />

              I checked this GSTIN on the official
              GST portal and confirm that these
              details match its result.
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

          {ready && (
            <p className="wide success">
              GST details ready for review and save.
            </p>
          )}

          {!ready && (
            <p className="wide error">
              Complete verification before saving
              GST details.
            </p>
          )}
        </>
      )}
    </>
  );
}
