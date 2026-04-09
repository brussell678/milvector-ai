"use client";

import { FormEvent, useEffect, useState } from "react";

type FeedbackRow = {
  id: string;
  created_at: string;
  feedback_type: "bug" | "suggestion" | "general" | "tool_request";
  message: string;
  suggested_tool: string | null;
  status: "new" | "reviewing" | "resolved" | "archived";
  admin_response: string | null;
  admin_response_updated_at: string | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const STATUS_LABELS: Record<FeedbackRow["status"], string> = {
  new: "New",
  reviewing: "Reviewing",
  resolved: "Resolved",
  archived: "Archived",
};

export function FeedbackForm() {
  const [status, setStatus] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<FeedbackRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/feedback", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadingHistory(false);
        return;
      }
      setHistory((data.feedback ?? []) as FeedbackRow[]);
    } catch {
      // keep the page usable even if the history panel fails
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    void loadHistory();
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setStatus("");

    try {
      const formData = new FormData(e.currentTarget);
      const res = await fetch("/api/feedback", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus(typeof data.error === "string" ? data.error : "Feedback submission failed.");
        return;
      }

      setStatus("Feedback submitted. Thank you.");
      e.currentTarget.reset();
      await loadHistory();
    } catch {
      setStatus("Feedback submission failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
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
        <label className="space-y-1 md:col-span-2">
          <span className="text-sm font-medium">Attachment (optional)</span>
          <input
            name="attachment"
            type="file"
            className="input"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt,.md,image/png,image/jpeg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
          />
          <p className="text-xs text-[var(--muted)]">Use this for screenshots, supporting files, or examples that make the issue clearer.</p>
        </label>
        <div className="md:col-span-2">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Submitting..." : "Submit Feedback"}
          </button>
        </div>
        {status && <p className="text-sm text-[var(--accent)] md:col-span-2">{status}</p>}
      </form>

      <section className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Your Feedback Status</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Track the current state of your submissions and review any admin follow-up questions or notes here.</p>
          </div>
          <button className="btn btn-secondary text-sm" type="button" onClick={() => void loadHistory()} disabled={loadingHistory}>
            {loadingHistory ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {loadingHistory ? <p className="text-sm text-[var(--muted)]">Loading your feedback history...</p> : null}
          {!loadingHistory && history.length === 0 ? <p className="text-sm text-[var(--muted)]">No feedback submissions yet.</p> : null}
          {history.map((item) => (
            <article key={item.id} className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">{item.feedback_type.toUpperCase()}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{formatDate(item.created_at)}</p>
                </div>
                <span className="rounded-full bg-[var(--background)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {STATUS_LABELS[item.status]}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--muted)]">{item.message}</p>
              {item.suggested_tool ? <p className="mt-3 text-xs text-[var(--muted)]">Suggested tool: {item.suggested_tool}</p> : null}
              {item.admin_response ? (
                <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">MilVector Response</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--muted)]">{item.admin_response}</p>
                  {item.admin_response_updated_at ? <p className="mt-2 text-xs text-[var(--muted)]">Updated {formatDate(item.admin_response_updated_at)}</p> : null}
                </div>
              ) : (
                <p className="mt-4 text-xs text-[var(--muted)]">No admin follow-up yet.</p>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
