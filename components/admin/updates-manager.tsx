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

// A draft waiting for the admin: its full wording, which can be edited, and a
// two-step Publish because publishing reaches every member at once.
function DraftCard({ update, onChanged }: { update: ExistingUpdate; onChanged: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [title, setTitle] = useState(update.title);
  const [body, setBody] = useState(update.body);
  const [category, setCategory] = useState(update.category);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(method: "PATCH" | "DELETE", change?: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/updates/${update.id}`, {
        method,
        headers: change ? { "Content-Type": "application/json" } : undefined,
        body: change ? JSON.stringify(change) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "That did not save. Try again.");
        return false;
      }
      return true;
    } catch {
      setError("Network error. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (await send("PATCH", { title, body, category })) {
      setEditing(false);
      onChanged("Draft saved. Members still see nothing until you publish it.");
    }
  }

  async function publish() {
    if (await send("PATCH", { published: true })) onChanged(`Published "${update.title}". It is on the announcement bar and What's New now.`);
  }

  async function remove() {
    if (await send("DELETE")) onChanged(`Deleted the draft "${update.title}".`);
  }

  return (
    <article className="rounded-lg border border-[var(--accent)] bg-[var(--surface)] p-4">
      {editing ? (
        <div className="flex flex-col gap-3">
          <label className="space-y-1">
            <span className="text-sm font-medium">Title</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Body</span>
            <textarea className="input min-h-40" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
          </label>
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
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary text-sm" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save draft"}
            </button>
            <button
              type="button"
              className="btn btn-secondary text-sm"
              disabled={busy}
              onClick={() => {
                setTitle(update.title);
                setBody(update.body);
                setCategory(update.category);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Draft · {CATEGORIES.find((c) => c.value === update.category)?.label ?? update.category}
          </p>
          <h3 className="mt-1 text-base font-semibold">{update.title}</h3>
          <p className="mt-2 whitespace-pre-line text-sm">{update.body}</p>
          {confirming ? (
            <div className="mt-4 flex flex-col gap-2">
              <p className="text-sm font-medium">Publish to every member now?</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary text-sm" disabled={busy} onClick={() => void publish()}>
                  {busy ? "Publishing…" : "Yes, publish"}
                </button>
                <button type="button" className="btn btn-secondary text-sm" disabled={busy} onClick={() => setConfirming(false)}>
                  Not yet
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary text-sm" disabled={busy} onClick={() => setConfirming(true)}>
                Publish
              </button>
              <button type="button" className="btn btn-secondary text-sm" disabled={busy} onClick={() => setEditing(true)}>
                Edit wording
              </button>
              <button type="button" className="btn btn-secondary text-sm" disabled={busy} onClick={() => void remove()}>
                Delete
              </button>
            </div>
          )}
        </>
      )}
      {error ? (
        <p className="alert-base alert-error mt-3" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
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
  const [draftStatus, setDraftStatus] = useState("");

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

  const drafts = initialUpdates.filter((update) => !update.published);
  const posted = initialUpdates.filter((update) => update.published);

  return (
    <div className="flex flex-col gap-6">
      {(drafts.length > 0 || draftStatus) && (
        <section id="drafts" className="flex scroll-mt-28 flex-col gap-3" aria-labelledby="drafts-heading">
          <div>
            <p id="drafts-heading" className="tool-kicker">
              DRAFTS WAITING FOR YOU
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Members see nothing until you publish. Publishing puts it on the announcement bar for 21 days and on What&apos;s New.
            </p>
          </div>
          {draftStatus ? (
            <p className="alert-base alert-success" aria-live="polite">
              {draftStatus}
            </p>
          ) : null}
          {drafts.map((update) => (
            <DraftCard
              key={update.id}
              update={update}
              onChanged={(message) => {
                setDraftStatus(message);
                router.refresh();
              }}
            />
          ))}
        </section>
      )}
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
                : "Posting will resolve this case. No email, because the reporter left no address."
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
        {posted.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nothing posted yet.</p>
        ) : (
          posted.map((update) => (
            <div key={update.id} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{update.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {formatDate(update.published_at)} · {update.category}
                    {update.is_user_requested ? " · user-requested" : ""}
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
    </div>
  );
}
