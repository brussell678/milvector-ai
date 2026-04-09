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

type FeedbackProfile = {
  full_name: string;
  branch: string;
  mos: string;
  professional_email: string;
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
  const [form, setForm] = useState({
    name: "",
    email: "",
    branch: "",
    mos: "",
    feedback_type: "general",
    suggested_tool: "",
    message: "",
  });
  const [status, setStatus] = useState<string>("");
  const [statusKind, setStatusKind] = useState<"success" | "error" | "">("");
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

  useEffect(() => {
    async function loadProfileDefaults() {
      try {
        const res = await fetch("/api/profile", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.profile) return;
        const profile = data.profile as Partial<FeedbackProfile>;
        setForm((current) => ({
          ...current,
          name: current.name || profile.full_name || "",
          email: current.email || profile.professional_email || "",
          branch: current.branch || profile.branch || "",
          mos: current.mos || profile.mos || "",
        }));
      } catch {
        // leave the form usable even if profile preload fails
      }
    }

    void loadProfileDefaults();
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setStatus("");
    setStatusKind("");

    try {
      const formData = new FormData(e.currentTarget);
      const res = await fetch("/api/feedback", { method: "POST", body: formData });
      const rawText = await res.text();
      let data: { error?: unknown } = {};
      if (rawText) {
        try {
          data = JSON.parse(rawText) as { error?: unknown };
        } catch {
          data = { error: rawText };
        }
      }

      if (!res.ok) {
        setStatus(typeof data.error === "string" ? data.error : "Feedback submission failed.");
        setStatusKind("error");
        return;
      }

      setStatus("Feedback submitted. Thank you.");
      setStatusKind("success");
      e.currentTarget.reset();
      setForm((current) => ({
        ...current,
        feedback_type: "general",
        suggested_tool: "",
        message: "",
      }));
      await loadHistory();
    } catch (error) {
      setStatus(error instanceof Error && error.message ? error.message : "Feedback submission failed.");
      setStatusKind("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <form className="panel mt-4 grid gap-3 p-6 md:grid-cols-2" onSubmit={onSubmit}>
        <input name="name" className="input" placeholder="Name (optional)" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} />
        <input name="email" type="email" className="input" placeholder="Email (optional)" value={form.email} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} />
        <input name="branch" className="input" placeholder="Branch" value={form.branch} onChange={(e) => setForm((current) => ({ ...current, branch: e.target.value }))} />
        <input name="mos" className="input" placeholder="MOS" value={form.mos} onChange={(e) => setForm((current) => ({ ...current, mos: e.target.value }))} />
        <select name="feedback_type" className="input" required value={form.feedback_type} onChange={(e) => setForm((current) => ({ ...current, feedback_type: e.target.value }))}>
          <option value="general">General</option>
          <option value="suggestion">Suggestion</option>
          <option value="bug">Bug</option>
          <option value="tool_request">Tool Request</option>
        </select>
        <input name="suggested_tool" className="input" placeholder="Suggested Tool (optional)" value={form.suggested_tool} onChange={(e) => setForm((current) => ({ ...current, suggested_tool: e.target.value }))} />
        <textarea name="message" className="input min-h-28 md:col-span-2" placeholder="Message" required minLength={10} value={form.message} onChange={(e) => setForm((current) => ({ ...current, message: e.target.value }))} />
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
        {status ? <div className={`alert-base md:col-span-2 ${statusKind === "error" ? "alert-error" : "alert-success"}`}>{status}</div> : null}
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
