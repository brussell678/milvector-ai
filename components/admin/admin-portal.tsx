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
  admin_response: string | null;
  admin_response_updated_at: string | null;
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

const TYPE_ICONS: Record<string, string> = {
  bug: "🐛",
  suggestion: "💡",
  general: "💬",
  tool_request: "🔧",
};

const STATUS_NEXT: Record<FeedbackItem["status"], FeedbackItem["status"][]> = {
  new: ["reviewing", "resolved", "archived"],
  reviewing: ["resolved", "archived"],
  resolved: ["reviewing", "archived"],
  archived: ["reviewing"],
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value)
  );
}

function TabBtn({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
          : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
      }`}
    >
      {label}
      {count > 0 && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
            active
              ? "bg-[var(--accent)] text-white"
              : "bg-[var(--surface)] text-[var(--muted)]"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function FeedbackCard({
  item,
  feedbackResponse,
  onResponseChange,
  onStatusChange,
  onSaveResponse,
  isBusy,
}: {
  item: FeedbackItem;
  feedbackResponse: string;
  onResponseChange: (val: string) => void;
  onStatusChange: (status: FeedbackItem["status"]) => void;
  onSaveResponse: () => void;
  isBusy: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const icon = TYPE_ICONS[item.feedback_type] ?? "📝";
  const nextStatuses = STATUS_NEXT[item.status] ?? [];
  const isImageAttachment =
    !!item.attachment_url && /\.(png|jpe?g|gif|webp|bmp)$/i.test(item.attachment_url);

  return (
    <article className="rounded-lg border border-[var(--line)] bg-[var(--panel)]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-xl" aria-hidden="true">{icon}</span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{item.name ?? item.email ?? "Anonymous"}</p>
              {item.email && item.name && (
                <a
                  href={`mailto:${item.email}`}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  {item.email}
                </a>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-[var(--muted)]">
              <span>{formatDate(item.created_at)}</span>
              {item.branch && <span>{item.branch}</span>}
              {item.mos && <span>{item.mos}</span>}
              {item.suggested_tool && <span>Tool: {item.suggested_tool}</span>}
            </div>
          </div>
        </div>
        <span className="ticket-badge" data-status={item.status}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} aria-hidden="true" />
          {item.status === "new" ? "New" : item.status === "reviewing" ? "In Review" : item.status === "resolved" ? "Resolved" : "Archived"}
        </span>
      </div>

      {/* Message */}
      <div className="border-t border-[var(--line)] px-4 py-3">
        <p className="whitespace-pre-wrap text-sm text-[var(--muted)]">{item.message}</p>
        {isImageAttachment && item.attachment_signed_url && (
          <a
            href={item.attachment_signed_url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 block w-fit"
            title="Open full size in a new tab"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.attachment_signed_url}
              alt="Support request attachment"
              className="max-h-96 rounded-md border border-[var(--line)]"
            />
          </a>
        )}
      </div>

      {/* Existing response */}
      {item.admin_response && (
        <div className="ticket-reply mx-4 my-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
            Your response · {item.admin_response_updated_at ? formatDate(item.admin_response_updated_at) : ""}
          </p>
          <p className="whitespace-pre-wrap text-sm">{item.admin_response}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] px-4 py-3">
        {item.attachment_signed_url && (
          <a
            href={item.attachment_signed_url}
            className="btn btn-secondary inline-flex text-xs"
            target="_blank"
            rel="noreferrer"
          >
            {isImageAttachment ? "Open Full Size" : "View Attachment"}
          </a>
        )}
        {nextStatuses.map((s) => (
          <button
            key={s}
            className="btn btn-secondary inline-flex text-xs"
            type="button"
            disabled={isBusy}
            onClick={() => onStatusChange(s)}
          >
            {isBusy ? "..." : `Mark ${s === "reviewing" ? "In Review" : s.charAt(0).toUpperCase() + s.slice(1)}`}
          </button>
        ))}
        <button
          className={`btn inline-flex text-xs ${expanded ? "btn-primary" : "btn-secondary"}`}
          type="button"
          onClick={() => setExpanded((v) => !v)}
        >
          {item.admin_response ? (item.admin_response ? "Edit Response" : "Respond") : "Respond"}
        </button>
      </div>

      {/* Expand-to-respond */}
      {expanded && (
        <div className="border-t border-[var(--line)] p-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium">
              {item.admin_response ? "Update Your Response" : "Write a Response"}
            </span>
            <textarea
              className="input min-h-28"
              value={feedbackResponse}
              onChange={(e) => onResponseChange(e.target.value)}
              placeholder="Respond to the user. This message will appear in their Support Cases view and trigger an email notification if they provided an address."
              autoFocus
            />
          </label>
          <div className="mt-3 flex gap-2">
            <button
              className="btn btn-primary text-sm"
              type="button"
              disabled={isBusy}
              onClick={onSaveResponse}
            >
              {isBusy ? "Saving..." : "Send Response"}
            </button>
            <button className="btn btn-secondary text-sm" type="button" onClick={() => setExpanded(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

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
  const [feedbackResponses, setFeedbackResponses] = useState<Record<string, string>>(
    Object.fromEntries(initialFeedback.map((item) => [item.id, item.admin_response ?? ""]))
  );
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [reports, setReports] = useState(initialMessageBoardReports);
  const [blockedUsers, setBlockedUsers] = useState(initialBlockedUsers);
  const [busyFeedbackId, setBusyFeedbackId] = useState<string | null>(null);
  const [busySubmissionId, setBusySubmissionId] = useState<string | null>(null);
  const [busyReportId, setBusyReportId] = useState<string | null>(null);
  const [busyBlockedUserId, setBusyBlockedUserId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"inbox" | "submissions" | "reports" | "blocked">("inbox");

  function showToast(kind: "ok" | "err", msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 4000);
  }

  async function updateFeedbackStatus(id: string, nextStatus: FeedbackItem["status"]) {
    setBusyFeedbackId(id);
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast("err", data.error ?? "Failed to update status."); return; }
      setFeedback((c) => c.map((item) => (item.id === id ? { ...item, status: nextStatus } : item)));
      showToast("ok", `Ticket marked ${nextStatus}.`);
    } catch {
      showToast("err", "Network error.");
    } finally {
      setBusyFeedbackId(null);
    }
  }

  async function saveFeedbackResponse(id: string) {
    setBusyFeedbackId(id);
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminResponse: feedbackResponses[id] ?? "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast("err", data.error ?? "Failed to save response."); return; }
      setFeedback((c) =>
        c.map((item) =>
          item.id === id
            ? {
                ...item,
                admin_response: (feedbackResponses[id] ?? "").trim() || null,
                admin_response_updated_at: (feedbackResponses[id] ?? "").trim()
                  ? new Date().toISOString()
                  : null,
              }
            : item
        )
      );
      showToast("ok", "Response saved. User will be notified by email if they provided an address.");
    } catch {
      showToast("err", "Network error.");
    } finally {
      setBusyFeedbackId(null);
    }
  }

  async function approveSubmission(id: string) {
    setBusySubmissionId(id);
    try {
      const res = await fetch(`/api/admin/library-submissions/${id}/approve`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast("err", data.error ?? "Failed to approve."); return; }
      setSubmissions((c) => c.map((item) => (item.id === id ? { ...item, approved: true } : item)));
      showToast("ok", "Submission published to library.");
    } catch {
      showToast("err", "Network error.");
    } finally {
      setBusySubmissionId(null);
    }
  }

  async function updateReportStatus(id: string, nextStatus: MessageBoardReportItem["status"]) {
    setBusyReportId(id);
    try {
      const res = await fetch(`/api/admin/message-board-reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast("err", data.error ?? "Failed to update report."); return; }
      setReports((c) => c.map((item) => (item.id === id ? { ...item, status: nextStatus } : item)));
      showToast("ok", "Report updated.");
    } catch {
      showToast("err", "Network error.");
    } finally {
      setBusyReportId(null);
    }
  }

  async function blockPosting(userId: string, authorLabel: string) {
    setBusyBlockedUserId(userId);
    try {
      const reason = `Posting blocked by admin after repeat message board moderation issues. (${authorLabel})`;
      const res = await fetch("/api/admin/message-board-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast("err", data.error ?? "Failed to block user."); return; }
      setBlockedUsers((c) => {
        if (c.some((item) => item.user_id === userId)) return c;
        return [{ user_id: userId, reason, created_at: new Date().toISOString() }, ...c];
      });
      showToast("ok", "User blocked from posting.");
    } catch {
      showToast("err", "Network error.");
    } finally {
      setBusyBlockedUserId(null);
    }
  }

  async function unblockPosting(userId: string) {
    setBusyBlockedUserId(userId);
    try {
      const res = await fetch(`/api/admin/message-board-blocks/${userId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast("err", data.error ?? "Failed to remove block."); return; }
      setBlockedUsers((c) => c.filter((item) => item.user_id !== userId));
      showToast("ok", "Posting block removed.");
    } catch {
      showToast("err", "Network error.");
    } finally {
      setBusyBlockedUserId(null);
    }
  }

  const openFeedback = feedback.filter((f) => f.status === "new" || f.status === "reviewing");
  const closedFeedback = feedback.filter((f) => f.status === "resolved" || f.status === "archived");
  const pendingSubmissions = submissions.filter((s) => !s.approved);
  const openReports = reports.filter((r) => r.status === "open");

  return (
    <section className="space-y-4">

      {/* ── Stats row ─────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Total Tickets", value: feedback.length },
          { label: "Open Tickets", value: openFeedback.length },
          { label: "Pending Submissions", value: pendingSubmissions.length },
          { label: "Open Reports", value: openReports.length },
          { label: "Blocked Posters", value: blockedUsers.length },
        ].map(({ label, value }) => (
          <article key={label} className="stat-card">
            <p className="stat-label">{label}</p>
            <p className="stat-value">{value}</p>
          </article>
        ))}
      </div>

      {/* ── Toast ─────────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`rounded-lg border p-3 text-sm font-medium transition-all ${
            toast.kind === "ok"
              ? "border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)]"
              : "border-red-400/30 bg-red-400/5 text-red-400"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* ── Tab nav ───────────────────────────────────────────────── */}
      <div className="section-card p-2">
        <nav className="flex flex-wrap gap-1">
          <TabBtn label="Inbox" count={openFeedback.length} active={activeTab === "inbox"} onClick={() => setActiveTab("inbox")} />
          <TabBtn label="Submissions" count={pendingSubmissions.length} active={activeTab === "submissions"} onClick={() => setActiveTab("submissions")} />
          <TabBtn label="Reports" count={openReports.length} active={activeTab === "reports"} onClick={() => setActiveTab("reports")} />
          <TabBtn label="Blocked Users" count={blockedUsers.length} active={activeTab === "blocked"} onClick={() => setActiveTab("blocked")} />
        </nav>
      </div>

      {/* ── Inbox ─────────────────────────────────────────────────── */}
      {activeTab === "inbox" && (
        <div className="section-card space-y-3">
          <div>
            <h2 className="section-title">Feedback Inbox</h2>
            <p className="section-description">Review and respond to user submissions. Responding triggers an email notification to the user.</p>
          </div>

          {openFeedback.length === 0 && closedFeedback.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No feedback submitted yet.</p>
          )}

          {openFeedback.length > 0 && (
            <div className="space-y-3">
              <p className="tool-kicker">Open</p>
              {openFeedback.map((item) => (
                <FeedbackCard
                  key={item.id}
                  item={item}
                  feedbackResponse={feedbackResponses[item.id] ?? ""}
                  onResponseChange={(val) => setFeedbackResponses((c) => ({ ...c, [item.id]: val }))}
                  onStatusChange={(s) => void updateFeedbackStatus(item.id, s)}
                  onSaveResponse={() => void saveFeedbackResponse(item.id)}
                  isBusy={busyFeedbackId === item.id}
                />
              ))}
            </div>
          )}

          {closedFeedback.length > 0 && (
            <details className={openFeedback.length > 0 ? "mt-2" : ""}>
              <summary className="cursor-pointer list-none">
                <span className="flex items-center gap-2 text-sm font-medium text-[var(--muted)]">
                  <span className="tool-kicker">Closed</span>
                  <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-xs">{closedFeedback.length}</span>
                </span>
              </summary>
              <div className="mt-3 space-y-3">
                {closedFeedback.map((item) => (
                  <FeedbackCard
                    key={item.id}
                    item={item}
                    feedbackResponse={feedbackResponses[item.id] ?? ""}
                    onResponseChange={(val) => setFeedbackResponses((c) => ({ ...c, [item.id]: val }))}
                    onStatusChange={(s) => void updateFeedbackStatus(item.id, s)}
                    onSaveResponse={() => void saveFeedbackResponse(item.id)}
                    isBusy={busyFeedbackId === item.id}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ── Submissions ───────────────────────────────────────────── */}
      {activeTab === "submissions" && (
        <div className="section-card space-y-3">
          <div>
            <h2 className="section-title">Library Submissions</h2>
            <p className="section-description">Review uploaded community documents and publish approved ones to the public library.</p>
          </div>
          {submissions.length === 0 && <p className="text-sm text-[var(--muted)]">No library submissions yet.</p>}
          {submissions.map((item) => (
            <article key={item.id} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">{item.category}</p>
                  <h3 className="mt-1 font-bold">{item.title}</h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">{formatDate(item.created_at)}</p>
                </div>
                <span className="ticket-badge" data-status={item.approved ? "resolved" : "new"}>
                  {item.approved ? "Published" : "Pending Review"}
                </span>
              </div>
              {item.description && <p className="mt-3 text-sm text-[var(--muted)]">{item.description}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {item.review_url && (
                  <a href={item.review_url} className="btn btn-secondary inline-flex text-sm" target="_blank" rel="noreferrer">
                    Open File
                  </a>
                )}
                <button
                  className="btn btn-primary inline-flex text-sm"
                  type="button"
                  disabled={busySubmissionId === item.id || item.approved}
                  onClick={() => void approveSubmission(item.id)}
                >
                  {busySubmissionId === item.id ? "Publishing..." : item.approved ? "Published" : "Approve & Publish"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* ── Reports ───────────────────────────────────────────────── */}
      {activeTab === "reports" && (
        <div className="section-card space-y-3">
          <div>
            <h2 className="section-title">Message Board Reports</h2>
            <p className="section-description">Review user-reported content and action appropriately.</p>
          </div>
          {reports.length === 0 && <p className="text-sm text-[var(--muted)]">No reports yet.</p>}
          {reports.map((item) => (
            <article key={item.id} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">{item.reason}</p>
                  <h3 className="mt-1 font-bold">{item.post?.title ?? "Reply / Comment"}</h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">{formatDate(item.created_at)}</p>
                </div>
                <span className="ticket-badge" data-status={
                  item.status === "open" ? "new" :
                  item.status === "reviewed" ? "reviewing" :
                  item.status === "actioned" ? "resolved" : "archived"
                }>
                  {item.status}
                </span>
              </div>

              <div className="mt-3 rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
                <p className="mb-1 text-xs font-semibold text-[var(--muted)]">
                  Reported content by {item.post?.author_label ?? "Unknown"}
                </p>
                <p className="whitespace-pre-wrap text-sm">{item.post?.body ?? "No content available."}</p>
              </div>

              {item.details && (
                <p className="mt-3 text-sm text-[var(--muted)]">
                  <span className="font-semibold text-[var(--foreground)]">Reporter notes:</span>{" "}
                  {item.details}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {(["open", "reviewed", "dismissed", "actioned"] as const).map((s) => (
                  <button
                    key={s}
                    className="btn btn-secondary inline-flex text-xs"
                    type="button"
                    disabled={busyReportId === item.id || item.status === s}
                    onClick={() => void updateReportStatus(item.id, s)}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
                {item.post?.user_id ? (
                  blockedUsers.some((b) => b.user_id === item.post?.user_id) ? (
                    <button
                      className="btn btn-secondary inline-flex text-xs"
                      type="button"
                      disabled={busyBlockedUserId === item.post.user_id}
                      onClick={() => void unblockPosting(item.post!.user_id)}
                    >
                      Unblock User
                    </button>
                  ) : (
                    <button
                      className="btn btn-secondary inline-flex text-xs"
                      type="button"
                      disabled={busyBlockedUserId === item.post.user_id}
                      onClick={() => void blockPosting(item.post!.user_id, item.post!.author_label)}
                    >
                      Block User
                    </button>
                  )
                ) : null}
                <a
                  className="btn btn-secondary inline-flex text-xs"
                  href={`/app/message-board#thread-${item.post_id}`}
                >
                  Open Thread
                </a>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* ── Blocked Users ─────────────────────────────────────────── */}
      {activeTab === "blocked" && (
        <div className="section-card space-y-3">
          <div>
            <h2 className="section-title">Blocked Message Board Users</h2>
            <p className="section-description">
              These users can still access MilVector but cannot post or reply on the community board.
            </p>
          </div>
          {blockedUsers.length === 0 && (
            <div className="rounded-lg border border-dashed border-[var(--line)] p-8 text-center">
              <p className="text-sm text-[var(--muted)]">No blocked users</p>
            </div>
          )}
          {blockedUsers.map((item) => (
            <article key={item.user_id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
              <div>
                <p className="font-mono text-sm font-semibold">{item.user_id}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Blocked {formatDate(item.created_at)}</p>
                {item.reason && <p className="mt-2 text-sm text-[var(--muted)]">{item.reason}</p>}
              </div>
              <button
                className="btn btn-secondary text-sm"
                type="button"
                disabled={busyBlockedUserId === item.user_id}
                onClick={() => void unblockPosting(item.user_id)}
              >
                {busyBlockedUserId === item.user_id ? "Removing..." : "Remove Block"}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
