
"use client";

import {
  useRef,
  useState,
  type FormEvent,
} from "react";

import { useRouter } from "next/navigation";
import { api } from "@/components/api";

import {
  COUNTRIES,
  dialCodeForCountry,
} from "@/lib/clients/countries";

import type { GstDetails } from "@/lib/gst/types";
import { GstinVerification } from "./gstin-verification";

export function ClientForm() {
  const router = useRouter();

  const [message, setMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const [pending, setPending] = useState(false);

  // Main company details
  const [legalName, setLegalName] = useState("");
  const [billingAddress, setBillingAddress] =
    useState("");

  // Existing country and currency settings
  const [countryCode, setCountryCode] =
    useState("IN");

  const [currency, setCurrency] =
    useState<"INR" | "USD">("INR");

  const [dialCode, setDialCode] =
    useState("+91");

  // Remount GST component after successful save.
  const [gstFormKey, setGstFormKey] = useState(0);

  // Track values populated by the GST API.
  const autoFilled = useRef<{
    legalName: string;
    billingAddress: string;
  } | null>(null);

  // Called only after successful GST API lookup.
  function handleGstDetailsFetched(details: GstDetails) {
    const name = details.legalName.trim();
    const address = details.address.trim();

    if (name) {
      setLegalName(name);
    }

    if (address) {
      setBillingAddress(address);
    }

    autoFilled.current = {
      legalName: name,
      billingAddress: address,
    };

    // A valid Indian GSTIN represents an
    // Indian GST registration.
    setCountryCode("IN");
    setCurrency("INR");
    setDialCode(dialCodeForCountry("IN"));

    setMessage(null);
  }

  // Reset only values that still match the
  // previous API auto-fill. Preserve manual edits.
  function handleGstinChanged() {
    const previous = autoFilled.current;

    if (!previous) return;

    setLegalName((current) =>
      current === previous.legalName ? "" : current
    );

    setBillingAddress((current) =>
      current === previous.billingAddress ? "" : current
    );

    autoFilled.current = null;
  }

  function changeCountry(code: string) {
    setCountryCode(code);
    setDialCode(dialCodeForCountry(code));
    setCurrency(code === "IN" ? "INR" : "USD");
  }

  async function submit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (pending) return;

    const form = event.currentTarget;

    setPending(true);
    setMessage(null);

    try {
      // Existing API and field names preserved.
      await api(
        "/api/clients",
        Object.fromEntries(new FormData(form))
      );

      form.reset();

      // Reset controlled fields.
      setLegalName("");
      setBillingAddress("");

      setCountryCode("IN");
      setCurrency("INR");
      setDialCode("+91");

      autoFilled.current = null;

      // Clear GSTIN, verification result and
      // manual confirmation for next client.
      setGstFormKey((key) => key + 1);

      setMessage({
        ok: true,
        text:
          "Client added. You can now create a PI for them.",
      });

      router.refresh();
    } catch (error) {
      setMessage({
        ok: false,
        text:
          error instanceof Error
            ? error.message
            : "Unable to add client.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="form form-grid"
      onSubmit={submit}
    >
      {/* MAIN COMPANY NAME */}
      <label>
        Legal company name

        <input
          name="legalName"
          value={legalName}
          onChange={(event) =>
            setLegalName(event.target.value)
          }
          required
        />
      </label>

      {/* COUNTRY */}
      <label>
        Country

        <select
          name="countryCode"
          value={countryCode}
          onChange={(event) =>
            changeCountry(event.target.value)
          }
        >
          {COUNTRIES.map((country) => (
            <option
              key={country.code}
              value={country.code}
            >
              {country.name} ({country.code})
            </option>
          ))}
        </select>
      </label>

      {/* CURRENCY */}
      <label>
        Currency

        <select
          name="defaultCurrency"
          value={currency}
          onChange={(event) =>
            setCurrency(
              event.target.value as "INR" | "USD"
            )
          }
        >
          <option value="INR">
            INR — Indian Rupee
          </option>

          <option value="USD">
            USD — US Dollar
          </option>
        </select>
      </label>

      {/* GST VERIFICATION */}
      <GstinVerification
        key={gstFormKey}
        onDetailsFetched={handleGstDetailsFetched}
        onGstinChange={handleGstinChanged}
      />

      {/* BILLING ADDRESS */}
      <label className="wide">
        Billing address

        <textarea
          name="billingAddress"
          required
          rows={3}
          value={billingAddress}
          onChange={(event) =>
            setBillingAddress(event.target.value)
          }
        />
      </label>

      {/* PRIMARY CONTACT */}
      <label>
        Primary contact

        <input
          name="contactName"
          required
        />
      </label>

      {/* PRIMARY EMAIL */}
      <label>
        Primary email

        <input
          name="contactEmail"
          type="email"
          required
        />
      </label>

      {/* DIALING CODE */}
      <label>
        Dialing code

        <select
          name="contactDialCode"
          value={dialCode}
          onChange={(event) =>
            setDialCode(event.target.value)
          }
        >
          {COUNTRIES.map((country) => (
            <option
              key={country.code}
              value={country.dialCode}
            >
              {country.dialCode} · {country.name}
            </option>
          ))}
        </select>
      </label>

      {/* CONTACT PHONE */}
      <label>
        Contact phone

        <input
          name="contactPhone"
          inputMode="tel"
          required
        />
      </label>

      {/* ADDITIONAL EMAILS */}
      <label className="wide">
        Additional email recipients{" "}
        <small>
          (optional, maximum 2; comma separated
          — they also get PIs and reminders)
        </small>

        <input
          name="additionalEmails"
          placeholder={
            "buyer@example.com, owner@example.com"
          }
        />
      </label>

      {/* PRIVATE NOTES */}
      <label className="wide">
        Private notes

        <textarea
          name="privateNotes"
          rows={2}
        />
      </label>

      {/* SAVE BUTTON */}
      <div className="wide form-actions">
        {message && (
          <p
            className={
              message.ok ? "success" : "error"
            }
            role="status"
          >
            {message.text}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
        >
          {pending ? "Saving…" : "Add client"}
        </button>
      </div>
    </form>
  );
}
