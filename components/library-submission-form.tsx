"use client";

import { FormEvent, useState } from "react";

export function LibrarySubmissionForm() {
  const [status, setStatus] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setStatus("");

    const formData = new FormData(e.currentTarget);
    const res = await fetch("/api/library/submit", { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setStatus(data.error ?? "Submission failed.");
      setSaving(false);
      return;
    }

    setStatus("Submission sent for admin review.");
    e.currentTarget.reset();
    setSaving(false);
  }

  return (
    <form className="panel space-y-3 p-5" onSubmit={onSubmit}>
      <h2 className="font-bold">Submit Document</h2>
      <input name="title" className="input" placeholder="Title" required />
      <input name="category" className="input" placeholder="Category" required />
      <textarea name="description" className="input min-h-24" placeholder="Description" />
      <input name="file" type="file" className="input" required />
      <p className="text-xs text-[var(--warn)]">
        Before uploading documents, redact any sensitive personal information such as SSN, full date of birth, or home address.
      </p>
      <button className="btn btn-primary" type="submit" disabled={saving}>
        {saving ? "Submitting..." : "Submit for Approval"}
      </button>
      {status && <p className="text-sm text-[var(--accent)]">{status}</p>}
    </form>
  );
}