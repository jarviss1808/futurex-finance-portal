
"use client";

import { useState } from "react";
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

  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    if (pending) return;

    const confirmed = window.confirm(
      `Permanently delete draft "${label}"?\n\n` +
      "This cannot be undone."
    );

    if (!confirmed) return;

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

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ?? "Delete failed"
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
        aria-label={`Delete draft ${label}`}
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
