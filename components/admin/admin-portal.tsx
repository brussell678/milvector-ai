"use client";

import { useState } from "react";

type FeedbackItem = {
  id: string;
  created_at: string;
  name: string | null;
  email: string | null;
  branch: string | null;
  mos: string | null;
  feedback_type: string;
  message: string;
  suggested_tool: string | null;
  status: "new" | "reviewing" | "resolved" | "archived";
  attachment_url: string | null;
  attachment_signed_url?: string | null;
};

type SubmissionItem = {
  id: string;
  created_at: string;
  title: string;
  description: string | null;
  category: string;
  file_url: string;
  approved: boolean;
  review_url?: string | null;
};

type MessageBoardReportItem = {
  id: string;
  created_at: string;
  reason: string;
  details: string | null;
  status: "open" | "reviewed" | "dismissed" | "actioned";
  moderator_notes: string | null;
  post_id: string;
  reported_by_user_id: string;
  post?: {
    user_id: string;
    title: string | null;
    body: string;
    author_label: string;
    parent_post_id: string | null;
  } | null;
};

type MessageBoardBlockedUserItem = {
  user_id: string;
  reason: string | null;
  created_at: string;
};

export function AdminPortal({
  initialFeedback,
  initialSubmissions,
  initialMessageBoardReports,
  initialBlockedUsers,
}: {
  initialFeedback: FeedbackItem[];
  initialSubmissions: SubmissionItem[];
  initialMessageBoardReports: MessageBoardReportItem[];
  initialBlockedUsers: MessageBoardBlockedUserItem[];
}) {
  const [feedback, setFeedback] = useState(initialFeedback);
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [reports, setReports] = useState(initialMessageBoardReports);
  const [blockedUsers, setBlockedUsers] = useState(initialBlockedUsers);
  const [busyFeedbackId, setBusyFeedbackId] = useState<string | null>(null);
  const [busySubmissionId, setBusySubmissionId] = useState<string | null>(null);
  const [busyReportId, setBusyReportId] = useState<string | null>(null);
  const [busyBlockedUserId, setBusyBlockedUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateFeedbackStatus(id: string, nextStatus: FeedbackItem["status"]) {
    setBusyFeedbackId(id);
    setStatus(null);
    setError(null);

    try {
      const res = await fetch(`/api/admin/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Failed to update feedback status.");
        return;
      }

      setFeedback((current) =>
        current.map((item) => (item.id === id ? { ...item, status: nextStatus } : item))
      );
      setStatus("Feedback status updated.");
    } catch {
      setError("Network error while updating feedback.");
    } finally {
      setBusyFeedbackId(null);
    }
  }

  async function approveSubmission(id: string) {
    setBusySubmissionId(id);
    setStatus(null);
    setError(null);

    try {
      const res = await fetch(`/api/admin/library-submissions/${id}/approve`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Failed to approve submission.");
        return;
      }

      setSubmissions((current) =>
        current.map((item) => (item.id === id ? { ...item, approved: true } : item))
      );
      setStatus("Library submission approved and published.");
    } catch {
      setError("Network error while approving the submission.");
    } finally {
      setBusySubmissionId(null);
    }
  }

  async function updateReportStatus(id: string, nextStatus: MessageBoardReportItem["status"]) {
    setBusyReportId(id);
    setStatus(null);
    setError(null);

    try {
      const res = await fetch(`/api/admin/message-board-reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Failed to update report status.");
        return;
      }

      setReports((current) => current.map((item) => (item.id === id ? { ...item, status: nextStatus } : item)));
      setStatus("Message board report updated.");
    } catch {
      setError("Network error while updating the report.");
    } finally {
      setBusyReportId(null);
    }
  }

  async function blockPosting(userId: string, authorLabel: string) {
    setBusyBlockedUserId(userId);
    setStatus(null);
    setError(null);

    try {
      const res = await fetch("/api/admin/message-board-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          reason: `Posting blocked by admin after repeat message board moderation issues. (${authorLabel})`,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Failed to block this user.");
        return;
      }

      setBlockedUsers((current) => {
        if (current.some((item) => item.user_id === userId)) return current;
        return [
          {
            user_id: userId,
            reason: `Posting blocked by admin after repeat message board moderation issues. (${authorLabel})`,
            created_at: new Date().toISOString(),
          },
          ...current,
        ];
      });
      setStatus("User blocked from posting on the message board.");
    } catch {
      setError("Network error while blocking this user.");
    } finally {
      setBusyBlockedUserId(null);
    }
  }

  async function unblockPosting(userId: string) {
    setBusyBlockedUserId(userId);
    setStatus(null);
    setError(null);

    try {
      const res = await fetch(`/api/admin/message-board-blocks/${userId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Failed to remove posting block.");
        return;
      }

      setBlockedUsers((current) => current.filter((item) => item.user_id !== userId));
      setStatus("Message board posting block removed.");
    } catch {
      setError("Network error while removing the posting block.");
    } finally {
      setBusyBlockedUserId(null);
    }
  }

  return (
    <section className="space-y-4">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <article className="stat-card">
          <p className="stat-label">Feedback Items</p>
          <p className="stat-value">{feedback.length}</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Open Feedback</p>
          <p className="stat-value">{feedback.filter((item) => item.status === "new" || item.status === "reviewing").length}</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Pending Submissions</p>
          <p className="stat-value">{submissions.filter((item) => !item.approved).length}</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Open Reports</p>
          <p className="stat-value">{reports.filter((item) => item.status === "open").length}</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Blocked Posters</p>
          <p className="stat-value">{blockedUsers.length}</p>
        </article>
      </section>

      {status && (
        <section className="section-card border-[var(--accent)]">
          <p className="text-sm font-medium text-[var(--accent)]">{status}</p>
        </section>
      )}
      {error && (
        <section className="section-card border-[#d69f9f]">
          <p className="text-sm font-medium text-red-700">{error}</p>
        </section>
      )}

      <section className="section-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="section-title">Feedback Queue</h2>
            <p className="section-description">Review suggestions, bug reports, and tool requests from users.</p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {feedback.length === 0 && <p className="text-sm text-[var(--muted)]">No feedback yet.</p>}
          {feedback.map((item) => (
            <article key={item.id} className="subtle-panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">{item.feedback_type.toUpperCase()}</p>
                  <h3 className="mt-1 text-base font-bold">{item.name || item.email || "Unnamed feedback"}</h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">{new Date(item.created_at).toLocaleString()}</p>
                </div>
                <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {item.status}
                </span>
              </div>
              <p className="mt-3 text-sm text-[var(--muted)]">{item.message}</p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--muted)]">
                {item.email && <span>Email: {item.email}</span>}
                {item.branch && <span>Branch: {item.branch}</span>}
                {item.mos && <span>MOS: {item.mos}</span>}
                {item.suggested_tool && <span>Suggested Tool: {item.suggested_tool}</span>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {item.attachment_signed_url ? (
                  <a
                    href={item.attachment_signed_url}
                    className="btn btn-secondary inline-flex text-sm"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Attachment
                  </a>
                ) : null}
                {(["new", "reviewing", "resolved", "archived"] as const).map((nextStatus) => (
                  <button
                    key={nextStatus}
                    className="btn btn-secondary inline-flex text-sm"
                    type="button"
                    disabled={busyFeedbackId === item.id || item.status === nextStatus}
                    onClick={() => void updateFeedbackStatus(item.id, nextStatus)}
                  >
                    {busyFeedbackId === item.id && item.status !== nextStatus ? "Updating..." : `Mark ${nextStatus}`}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section-card">
        <h2 className="section-title">Library Submission Review</h2>
        <p className="section-description">Review uploaded community documents and publish approved ones into the public library.</p>
        <div className="mt-4 space-y-3">
          {submissions.length === 0 && <p className="text-sm text-[var(--muted)]">No library submissions yet.</p>}
          {submissions.map((item) => (
            <article key={item.id} className="subtle-panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">{item.category}</p>
                  <h3 className="mt-1 text-base font-bold">{item.title}</h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">{new Date(item.created_at).toLocaleString()}</p>
                </div>
                <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {item.approved ? "Published" : "Pending"}
                </span>
              </div>
              {item.description && <p className="mt-3 text-sm text-[var(--muted)]">{item.description}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {item.review_url ? (
                  <a href={item.review_url} className="btn btn-secondary inline-flex text-sm" target="_blank" rel="noreferrer">
                    Review File
                  </a>
                ) : null}
                <button
                  className="btn btn-secondary inline-flex text-sm"
                  type="button"
                  disabled={busySubmissionId === item.id || item.approved}
                  onClick={() => void approveSubmission(item.id)}
                >
                  {busySubmissionId === item.id ? "Publishing..." : item.approved ? "Published" : "Approve And Publish"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section-card">
        <h2 className="section-title">Message Board Reports</h2>
        <p className="section-description">Review user reports from the community board and decide whether each item should stay open, be dismissed, or be actioned.</p>
        <div className="mt-4 space-y-3">
          {reports.length === 0 && <p className="text-sm text-[var(--muted)]">No message board reports yet.</p>}
          {reports.map((item) => (
            <article key={item.id} className="subtle-panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">{item.reason.toUpperCase()}</p>
                  <h3 className="mt-1 text-base font-bold">{item.post?.title || "Reply report"}</h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">{new Date(item.created_at).toLocaleString()}</p>
                </div>
                <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {item.status}
                </span>
              </div>
              <p className="mt-3 text-sm"><span className="font-semibold">Reported content by:</span> {item.post?.author_label || "Unknown author"}</p>
              <p className="mt-2 text-sm text-[var(--muted)] whitespace-pre-wrap">{item.post?.body || "No post body available."}</p>
              {item.details ? <p className="mt-3 text-sm text-[var(--muted)]"><span className="font-semibold text-[var(--foreground)]">Reporter notes:</span> {item.details}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {(["open", "reviewed", "dismissed", "actioned"] as const).map((nextStatus) => (
                  <button
                    key={nextStatus}
                    className="btn btn-secondary inline-flex text-sm"
                    type="button"
                    disabled={busyReportId === item.id || item.status === nextStatus}
                    onClick={() => void updateReportStatus(item.id, nextStatus)}
                  >
                    {busyReportId === item.id && item.status !== nextStatus ? "Updating..." : `Mark ${nextStatus}`}
                  </button>
                ))}
                {item.post?.user_id ? (
                  blockedUsers.some((blocked) => blocked.user_id === item.post?.user_id) ? (
                    <button
                      className="btn btn-secondary inline-flex text-sm"
                      type="button"
                      disabled={busyBlockedUserId === item.post.user_id}
                      onClick={() => void unblockPosting(item.post!.user_id)}
                    >
                      {busyBlockedUserId === item.post.user_id ? "Updating..." : "Unblock User"}
                    </button>
                  ) : (
                    <button
                      className="btn btn-secondary inline-flex text-sm"
                      type="button"
                      disabled={busyBlockedUserId === item.post.user_id}
                      onClick={() => void blockPosting(item.post!.user_id, item.post!.author_label)}
                    >
                      {busyBlockedUserId === item.post.user_id ? "Updating..." : "Block User From Posting"}
                    </button>
                  )
                ) : null}
                <a className="btn btn-secondary inline-flex text-sm" href={`/app/message-board#thread-${item.post_id}`}>
                  Open Thread
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section-card">
        <h2 className="section-title">Blocked Message Board Users</h2>
        <p className="section-description">These users can still access MilVector, but they cannot create new message board posts or replies until you remove the block.</p>
        <div className="mt-4 space-y-3">
          {blockedUsers.length === 0 && <p className="text-sm text-[var(--muted)]">No blocked message board users.</p>}
          {blockedUsers.map((item) => (
            <article key={item.user_id} className="subtle-panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold">{item.user_id}</h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">{new Date(item.created_at).toLocaleString()}</p>
                </div>
                <button
                  className="btn btn-secondary inline-flex text-sm"
                  type="button"
                  disabled={busyBlockedUserId === item.user_id}
                  onClick={() => void unblockPosting(item.user_id)}
                >
                  {busyBlockedUserId === item.user_id ? "Updating..." : "Remove Block"}
                </button>
              </div>
              {item.reason ? <p className="mt-3 text-sm text-[var(--muted)]">{item.reason}</p> : null}
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
