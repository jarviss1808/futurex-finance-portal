
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

  const sendingRef = useRef(false);

  async function send() {
    if (
      sendingRef.current ||
      recipients.length === 0
    ) {
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
        `/api/documents/${id}/email`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            resend: sent,
          }),
        }
      );

      const data: {
        status?: string;
        error?: string;
        recipients?: string[];
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
        `${status}: ${sentRecipients.join(", ")}`
      );

      if (status === "SENT") {
        setSent(true);
      }
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
      </div>

      <button
        type="button"
        className="button"
        disabled={
          busy || recipients.length === 0
        }
        onClick={send}
      >
        {busy
          ? "Sending…"
          : sent
            ? "Resend PDF"
            : "Send PDF by email"}
      </button>
    </section>
  );
}
