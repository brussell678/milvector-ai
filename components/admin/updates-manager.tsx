"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export type FeedbackOption = {
  id: string;
  label: string;
  hasEmail: boolean;
  status: string;
};

export type ExistingUpdate = {
  id: string;
  title: string;
  body: string;
  category: "new" | "improvement" | "fix" | string;
  is_user_requested: boolean;
  linked_feedback_id: string | null;
  published: boolean;
  published_at: string;
};

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "new", label: "New" },
  { value: "improvement", label: "Improved" },
  { value: "fix", label: "Fixed" },
];

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

export function UpdatesManager({
  initialUpdates,
  feedbackOptions,
}: {
  initialUpdates: ExistingUpdate[];
  feedbackOptions: FeedbackOption[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("improvement");
  const [userRequested, setUserRequested] = useState(false);
  const [linkedFeedbackId, setLinkedFeedbackId] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error" | ""; text: string }>({ kind: "", text: "" });

  const linkedOption = feedbackOptions.find((option) => option.id === linkedFeedbackId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus({ kind: "", text: "" });
    try {
      const res = await fetch("/api/admin/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          category,
          is_user_requested: userRequested,
          linked_feedback_id: linkedFeedbackId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ kind: "error", text: typeof data.error === "string" ? data.error : "Failed to post update." });
        return;
      }
      setStatus({
        kind: "success",
        text: linkedFeedbackId && linkedOption?.hasEmail
          ? "Posted. The linked case was resolved and the reporter was emailed."
          : "Posted. It's now live on the announcement bar and What's New.",
      });
      setTitle("");
      setBody("");
      setCategory("improvement");
      setUserRequested(false);
      setLinkedFeedbackId("");
      router.refresh();
    } catch {
      setStatus({ kind: "error", text: "Network error posting the update." });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    const res = await fetch(`/api/admin/updates/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Composer */}
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <label className="space-y-1">
          <span className="text-sm font-medium">Title</span>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Add your awards to your Master Resume"
            required
            minLength={3}
            maxLength={160}
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Body</span>
          <textarea
            className="input min-h-28"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Plain-language description of what changed and why it helps."
            required
            minLength={10}
            maxLength={4000}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium">Category</span>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 pt-6 text-sm">
            <input type="checkbox" checked={userRequested} onChange={(e) => setUserRequested(e.target.checked)} />
            <span>Requested by a user</span>
          </label>
        </div>

        <label className="space-y-1">
          <span className="text-sm font-medium">
            Link a support case <span className="font-normal text-[var(--muted)]">(optional)</span>
          </span>
          <select className="input" value={linkedFeedbackId} onChange={(e) => setLinkedFeedbackId(e.target.value)}>
            <option value="">Not linked (off-platform request or general update)</option>
            {feedbackOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.hasEmail ? "✉ " : ""}
                {option.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-[var(--muted)]">
            {linkedFeedbackId
              ? linkedOption?.hasEmail
                ? "Posting will resolve this case and email the reporter that their request is live."
                : "Posting will resolve this case. No email — the reporter left no address."
              : "Leave unlinked for ideas that came in through other channels."}
          </span>
        </label>

        {status.kind && (
          <p className={`text-sm font-medium ${status.kind === "success" ? "text-[var(--accent)]" : "text-red-500"}`}>
            {status.text}
          </p>
        )}

        <button className="btn btn-primary w-full sm:w-auto" type="submit" disabled={saving}>
          {saving ? "Posting…" : "Post Update"}
        </button>
      </form>

      {/* Existing updates */}
      <div className="flex flex-col gap-3">
        <p className="tool-kicker">POSTED UPDATES</p>
        {initialUpdates.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nothing posted yet.</p>
        ) : (
          initialUpdates.map((update) => (
            <div key={update.id} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{update.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {formatDate(update.published_at)} · {update.category}
                    {update.is_user_requested ? " · user-requested" : ""}
                    {update.published ? "" : " · draft"}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary shrink-0 text-xs"
                  onClick={() => void onDelete(update.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
