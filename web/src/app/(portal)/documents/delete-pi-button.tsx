
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  id: string;
  label: string;
  returnToList?: boolean;
};

export function DeletePiButton({
  id,
  label,
  returnToList = false,
}: Props) {
  const router = useRouter();
  const submittingRef = useRef(false);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    if (submittingRef.current) return;

    const confirmed = window.confirm(
      `Permanently delete Draft PI for "${label}"?\n\n` +
        "This action cannot be undone."
    );

    if (!confirmed) return;

    submittingRef.current = true;
    setPending(true);
    setError("");

    try {
      const response = await fetch(
        `/api/documents/${encodeURIComponent(id)}/delete`,
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
        }
      );

      const result: {
        ok?: boolean;
        error?: string;
      } = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ?? "Unable to delete Draft PI"
        );
      }

      if (returnToList) {
        router.push("/documents");
      }

      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to delete document"
      );
    } finally {
      submittingRef.current = false;
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className="button small secondary"
        onClick={handleDelete}
        disabled={pending}
        aria-label={`Delete Draft PI for ${label}`}
      >
        {pending ? "Deleting..." : "Delete"}
      </button>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
