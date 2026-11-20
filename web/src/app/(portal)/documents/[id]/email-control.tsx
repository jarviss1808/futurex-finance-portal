
"use client";

import { useRef, useState } from "react";

type Delivery = {
  status: string;
  createdAt: string;
  sentAt: string | null;
  recipients: string[];
};

type Props = {
  id: string;
  recipients: string[];
  latest: Delivery | null;
};

const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export function EmailControl({
  id,
  recipients,
  latest,
}: Props) {
  const [message, setMessage] = useState(
    latest
      ? `${latest.status}: ${latest.recipients.join(", ")}`
      : ""
  );

  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(
    latest?.status === "SENT"
  );

  const [showCc, setShowCc] = useState(false);
  const [ccInput, setCcInput] = useState("");

  const sendingRef = useRef(false);

  function parseCc(): string[] {
    const addresses = ccInput
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);

    if (addresses.length > 3) {
      throw new Error(
        "Maximum 3 CC email addresses allowed."
      );
    }

    if (
      addresses.some(
        (email) => !EMAIL_PATTERN.test(email)
      )
    ) {
      throw new Error(
        "Enter valid CC emails separated by commas."
      );
    }

    const unique = new Set(
      addresses.map((email) => email.toLowerCase())
    );

    if (unique.size !== addresses.length) {
      throw new Error(
        "Duplicate CC email addresses are not allowed."
      );
    }

    const primaryRecipients = new Set(
      recipients.map((email) => email.toLowerCase())
    );

    if (
      addresses.some((email) =>
        primaryRecipients.has(email.toLowerCase())
      )
    ) {
      throw new Error(
        "A CC email is already present in the primary recipients."
      );
    }

    return addresses;
  }

  function openCcBox() {
    if (busy || recipients.length === 0) return;

    setMessage("");
    setShowCc(true);
  }

  function closeCcBox() {
    if (busy) return;

    setShowCc(false);
    setCcInput("");
    setMessage("");
  }

  async function send() {
    if (
      sendingRef.current ||
      recipients.length === 0
    ) {
      return;
    }

    let cc: string[];

    try {
      cc = parseCc();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Invalid CC email addresses"
      );
      return;
    }

    if (
      sent &&
      !window.confirm(
        "This PI was already emailed. Send it again to the listed recipients?"
      )
    ) {
      return;
    }

    sendingRef.current = true;
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/documents/${encodeURIComponent(id)}/email`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            resend: sent,
            cc,
          }),
        }
      );

      const data: {
        status?: string;
        error?: string;
        recipients?: string[];
        cc?: string[];
      } = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ?? "Unable to send email"
        );
      }

      const status = data.status ?? "ACCEPTED";

      const sentRecipients =
        data.recipients ?? recipients;

      setMessage(
        `${status}: ${sentRecipients.join(", ")}` +
          (cc.length
            ? ` | CC requested: ${cc.join(", ")}`
            : "")
      );

      if (status === "SENT") {
        setSent(true);
      }

      setShowCc(false);
      setCcInput("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Email could not be sent"
      );
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="download-bar">
      <div>
        <strong>Email official PI</strong>

        <p>
          {recipients.length
            ? `To: ${recipients.join(", ")}`
            : "Add a client email before sending."}
        </p>

        {message && (
          <small role="status">
            {message}
          </small>
        )}

        {showCc && (
          <div style={{ marginTop: "14px" }}>
            <label
              htmlFor={`pi-cc-${id}`}
              className="field"
            >
              <strong>
                CC email addresses (optional)
              </strong>

              <input
                id={`pi-cc-${id}`}
                type="text"
                value={ccInput}
                onChange={(event) =>
                  setCcInput(event.target.value)
                }
                placeholder="one@gmail.com, two@gmail.com, three@gmail.com"
                autoComplete="off"
                disabled={busy}
                aria-describedby={`pi-cc-help-${id}`}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "8px",
                }}
              />

              <small
                id={`pi-cc-help-${id}`}
                className="block"
              >
                Up to 3 CC addresses, separated by
                commas. Leave blank to send normally.
              </small>
            </label>

            <div
              className="form-actions"
              style={{
                marginTop: "12px",
                display: "flex",
                gap: "8px",
              }}
            >
              <button
                type="button"
                className="button"
                onClick={send}
                disabled={busy}
              >
                {busy
                  ? "Sending…"
                  : sent
                    ? "Confirm resend"
                    : "Send email"}
              </button>

              <button
                type="button"
                className="button secondary"
                onClick={closeCcBox}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {!showCc && (
        <button
          type="button"
          className="button"
          disabled={
            busy || recipients.length === 0
          }
          onClick={openCcBox}
        >
          {sent
            ? "Resend PDF"
            : "Send PDF by email"}
        </button>
      )}
    </section>
  );
}
