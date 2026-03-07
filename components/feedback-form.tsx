"use client";

import { FormEvent, useState } from "react";

export function FeedbackForm() {
  const [status, setStatus] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setStatus("");

    const formData = new FormData(e.currentTarget);
    const res = await fetch("/api/feedback", { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setStatus(data.error ?? "Feedback submission failed.");
      setSaving(false);
      return;
    }

    setStatus("Feedback submitted. Thank you.");
    e.currentTarget.reset();
    setSaving(false);
  }

  return (
    <form className="panel mt-4 grid gap-3 p-6 md:grid-cols-2" onSubmit={onSubmit}>
      <input name="name" className="input" placeholder="Name (optional)" />
      <input name="email" type="email" className="input" placeholder="Email (optional)" />
      <input name="branch" className="input" placeholder="Branch" />
      <input name="mos" className="input" placeholder="MOS" />
      <select name="feedback_type" className="input" required>
        <option value="general">General</option>
        <option value="suggestion">Suggestion</option>
        <option value="bug">Bug</option>
        <option value="tool_request">Tool Request</option>
      </select>
      <input name="suggested_tool" className="input" placeholder="Suggested Tool (optional)" />
      <textarea name="message" className="input min-h-28 md:col-span-2" placeholder="Message" required />
      <div className="md:col-span-2">
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? "Submitting..." : "Submit Feedback"}
        </button>
      </div>
      {status && <p className="text-sm text-[var(--accent)] md:col-span-2">{status}</p>}
    </form>
  );
}