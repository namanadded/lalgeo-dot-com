"use client";

import { useFormStatus } from "react-dom";

export function EmailSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="button" disabled={pending} aria-disabled={pending}>
      {pending ? "Sending Email…" : "Send Email With PDF"}
    </button>
  );
}
