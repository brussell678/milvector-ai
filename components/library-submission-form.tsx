"use client";

import { FormEvent, useState } from "react";
import { UploadWarning } from "@/components/upload-warning";

export function LibrarySubmissionForm() {
  const [status, setStatus] = useState<string>("");
  const [statusKind, setStatusKind] = useState<"success" | "error" | "">("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setStatus("");
    setStatusKind("");

    try {
      const formData = new FormData(e.currentTarget);
      const res = await fetch("/api/library/submit", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus(data.error ?? "Submission failed.");
        setStatusKind("error");
        return;
      }

      setStatus("Submission sent for admin review.");
      setStatusKind("success");
      e.currentTarget.reset();
    } catch {
      setStatus("Submission failed.");
      setStatusKind("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="section-card space-y-3" onSubmit={onSubmit}>
      <div>
        <h2 className="section-title">Submit Document</h2>
        <p className="section-description">Share a transition resource for admin review.</p>
      </div>
      <input name="title" className="input" placeholder="Title" required />
      <input name="category" className="input" placeholder="Category" required />
      <textarea name="description" className="input min-h-24" placeholder="Description" />
      <input name="file" type="file" className="input" required />
      <UploadWarning />
      <button className="btn btn-primary w-full sm:w-auto" type="submit" disabled={saving}>
        {saving ? "Submitting..." : "Submit for Approval"}
      </button>
      {status ? <div className={`alert-base ${statusKind === "error" ? "alert-error" : "alert-success"}`}>{status}</div> : null}
    </form>
  );
}
