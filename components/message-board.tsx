"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { MESSAGE_BOARD_LINK_OPTIONS, MESSAGE_BOARD_REPORT_REASONS } from "@/lib/message-board";

type BoardPost = {
  id: string;
  userId: string;
  parentPostId: string | null;
  title: string | null;
  body: string;
  authorLabel: string;
  createdAt: string;
  editedAt: string | null;
  lastActivityAt: string | null;
  status: "active" | "hidden" | "removed";
  isPinned: boolean;
  isLocked: boolean;
  linkedToolSlug: string | null;
  linkedResourceType: string | null;
  linkedResourcePath: string | null;
  linkedResourceLabel: string | null;
  score: number;
  userVote: number;
};

type Thread = BoardPost & { replies: BoardPost[] };
type BoardNotification = {
  id: string;
  postId: string;
  type: "thread_reply" | "followed_thread_reply";
  message: string;
  readAt: string | null;
  createdAt: string;
};
type StatusState = { kind: "success" | "error" | "info"; message: string } | null;
type SortMode = "top" | "new" | "active";
type FilterMode = "all" | "my_posts" | "unanswered" | "pinned" | "locked";
type ReportReason = (typeof MESSAGE_BOARD_REPORT_REASONS)[number];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function buildThreads(posts: BoardPost[]) {
  const repliesByParent = new Map<string, BoardPost[]>();
  for (const post of posts) {
    if (!post.parentPostId) continue;
    const replies = repliesByParent.get(post.parentPostId) ?? [];
    replies.push(post);
    repliesByParent.set(post.parentPostId, replies);
  }

  return posts
    .filter((post) => !post.parentPostId)
    .map((post) => ({
      ...post,
      replies: (repliesByParent.get(post.id) ?? []).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    }));
}

async function requestJson(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false as const, error: data.error ?? "Request failed.", data: null };
    return { ok: true as const, data };
  } catch {
    return { ok: false as const, error: "Network request failed. Please try again.", data: null };
  }
}

export function MessageBoard() {
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [notifications, setNotifications] = useState<BoardNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [status, setStatus] = useState<StatusState>(null);
  const [posting, setPosting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [votingPostId, setVotingPostId] = useState<string | null>(null);
  const [adminBusyId, setAdminBusyId] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [canPost, setCanPost] = useState(false);
  const [requiresSavedProfile, setRequiresSavedProfile] = useState(true);
  const [postingBlocked, setPostingBlocked] = useState(false);
  const [postingBlockReason, setPostingBlockReason] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("top");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [reportingPostId, setReportingPostId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>(MESSAGE_BOARD_REPORT_REASONS[0]);
  const [reportDetails, setReportDetails] = useState("");
  const [reporting, setReporting] = useState(false);
  const [seedingStarters, setSeedingStarters] = useState(false);

  async function loadBoard() {
    setLoading(true);
    const result = await requestJson("/api/message-board", { cache: "no-store" });
    if (!result.ok) {
      setStatus({ kind: "error", message: result.error });
      setLoading(false);
      return;
    }
    setPosts((result.data.posts ?? []) as BoardPost[]);
    setCanPost(Boolean(result.data.canPost));
    setRequiresSavedProfile(Boolean(result.data.requiresSavedProfile));
    setPostingBlocked(Boolean(result.data.postingBlocked));
    setPostingBlockReason((result.data.postingBlockReason as string | null) ?? null);
    setIsAdmin(Boolean(result.data.isAdmin));
    setCurrentUserId((result.data.currentUserId as string | null) ?? null);
    setLoading(false);
  }

  async function loadNotifications() {
    setNotificationsLoading(true);
    const result = await requestJson("/api/message-board/notifications", { cache: "no-store" });
    if (!result.ok) {
      setNotificationsLoading(false);
      return;
    }
    setNotifications((result.data.notifications ?? []) as BoardNotification[]);
    setNotificationsLoading(false);
  }

  useEffect(() => {
    void loadBoard();
    void loadNotifications();
  }, []);

  const unreadNotifications = notifications.filter((item) => !item.readAt);

  const threads = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const built = buildThreads(posts);
    const filtered = built.filter((thread) => {
      if (filterMode === "my_posts" && currentUserId) {
        const matchesMine = thread.userId === currentUserId || thread.replies.some((reply) => reply.userId === currentUserId);
        if (!matchesMine) return false;
      }
      if (filterMode === "unanswered" && thread.replies.length > 0) return false;
      if (filterMode === "pinned" && !thread.isPinned) return false;
      if (filterMode === "locked" && !thread.isLocked) return false;

      if (!normalizedQuery) return true;

      const haystacks = [
        thread.title ?? "",
        thread.body,
        thread.authorLabel,
        thread.linkedResourceLabel ?? "",
        ...thread.replies.flatMap((reply) => [reply.body, reply.authorLabel]),
      ].join("\n").toLowerCase();

      return haystacks.includes(normalizedQuery);
    });

    return filtered.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (sortMode === "new") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortMode === "active") return new Date(b.lastActivityAt ?? b.createdAt).getTime() - new Date(a.lastActivityAt ?? a.createdAt).getTime();
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [posts, searchQuery, filterMode, sortMode, currentUserId]);

  async function submitPost(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canPost) {
      setStatus({ kind: "error", message: "Save your MilVector profile before posting on the message board." });
      return;
    }
    setPosting(true);
    setStatus({ kind: "info", message: "Posting your message..." });
    try {
      const form = new FormData(e.currentTarget);
      const result = await requestJson("/api/message-board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.get("title")?.toString() ?? "",
          body: form.get("body")?.toString() ?? "",
          linkKey: form.get("linkKey")?.toString() || null,
        }),
      });
      if (!result.ok) {
        setStatus({ kind: "error", message: result.error ?? "Unable to create post." });
        return;
      }
      e.currentTarget.reset();
      setStatus({ kind: "success", message: "Your message has been posted." });
      await Promise.all([loadBoard(), loadNotifications()]);
    } finally {
      setPosting(false);
    }
  }

  async function submitReply(postId: string) {
    if (!canPost) {
      setStatus({ kind: "error", message: "Save your MilVector profile before replying on the message board." });
      return;
    }
    const body = replyDrafts[postId]?.trim() ?? "";
    if (!body) {
      setStatus({ kind: "error", message: "Reply text cannot be empty." });
      return;
    }
    setPosting(true);
    setStatus({ kind: "info", message: "Posting your reply..." });
    try {
      const result = await requestJson("/api/message-board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentPostId: postId, body }),
      });
      if (!result.ok) {
        setStatus({ kind: "error", message: result.error ?? "Unable to add reply." });
        return;
      }
      setReplyDrafts((current) => ({ ...current, [postId]: "" }));
      setReplyingTo(null);
      setExpandedReplies((current) => ({ ...current, [postId]: true }));
      setStatus({ kind: "success", message: "Your reply has been posted." });
      await Promise.all([loadBoard(), loadNotifications()]);
    } finally {
      setPosting(false);
    }
  }

  async function castVote(postId: string, value: 1 | -1) {
    setVotingPostId(postId);
    setStatus(null);
    try {
      const result = await requestJson("/api/message-board/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, value }),
      });
      if (!result.ok) {
        setStatus({ kind: "error", message: result.error ?? "Unable to record vote." });
        return;
      }
      await loadBoard();
    } finally {
      setVotingPostId(null);
    }
  }

  async function moderatePost(postId: string, updates: Record<string, unknown>, successMessage: string) {
    setAdminBusyId(postId);
    setStatus(null);
    try {
      const result = await requestJson(`/api/message-board/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!result.ok) {
        setStatus({ kind: "error", message: result.error ?? "Unable to update thread." });
        return;
      }
      setStatus({ kind: "success", message: successMessage });
      await loadBoard();
    } finally {
      setAdminBusyId(null);
    }
  }

  function beginEdit(post: BoardPost) {
    setEditingPostId(post.id);
    setEditTitle(post.title ?? "");
    setEditBody(post.body);
  }

  async function saveEdit(post: BoardPost) {
    const payload: Record<string, unknown> = { body: editBody };
    if (!post.parentPostId) payload.title = editTitle;
    const result = await requestJson(`/api/message-board/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!result.ok) {
      setStatus({ kind: "error", message: result.error ?? "Unable to save changes." });
      return;
    }
    setEditingPostId(null);
    setStatus({ kind: "success", message: "Post updated." });
    await loadBoard();
  }

  async function deleteOwnPost(post: BoardPost) {
    const confirmed = window.confirm("Delete this post or reply? This cannot be undone.");
    if (!confirmed) return;
    const result = await requestJson(`/api/message-board/${post.id}`, { method: "DELETE" });
    if (!result.ok) {
      setStatus({ kind: "error", message: result.error ?? "Unable to delete post." });
      return;
    }
    setStatus({ kind: "success", message: "Post deleted." });
    await Promise.all([loadBoard(), loadNotifications()]);
  }

  async function submitReport(post: BoardPost) {
    setReporting(true);
    const result = await requestJson("/api/message-board/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postId: post.id,
        reason: reportReason,
        details: reportDetails.trim() || null,
      }),
    });
    if (!result.ok) {
      setStatus({ kind: "error", message: result.error ?? "Unable to submit report." });
      setReporting(false);
      return;
    }
    setStatus({ kind: "success", message: "Report submitted for admin review." });
    setReporting(false);
    setReportingPostId(null);
    setReportDetails("");
    setReportReason(MESSAGE_BOARD_REPORT_REASONS[0]);
  }

  async function markNotificationsRead(ids?: string[]) {
    const result = await requestJson("/api/message-board/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!result.ok) {
      setStatus({ kind: "error", message: result.error ?? "Unable to update notifications." });
      return;
    }
    await loadNotifications();
  }

  async function seedStarterThreads() {
    setSeedingStarters(true);
    const result = await requestJson("/api/message-board/starter-threads", { method: "POST" });
    if (!result.ok) {
      setStatus({ kind: "error", message: result.error ?? "Unable to seed starter threads." });
      setSeedingStarters(false);
      return;
    }
    const created = Number(result.data.created ?? 0);
    setStatus({
      kind: "success",
      message: created > 0 ? `Starter threads created: ${created}.` : "Starter threads were already in place.",
    });
    setSeedingStarters(false);
    await loadBoard();
  }

  function statusBadge(post: BoardPost) {
    const labels = [];
    if (post.isPinned) labels.push("Pinned");
    if (post.isLocked) labels.push("Locked");
    if (post.status !== "active") labels.push(post.status === "hidden" ? "Hidden" : "Removed");
    return labels;
  }

  function canManageOwn(post: BoardPost, thread: Thread) {
    return currentUserId === post.userId && !thread.isLocked;
  }

  function visibleReplies(thread: Thread) {
    if (expandedReplies[thread.id] || thread.replies.length <= 1) return thread.replies;
    return [thread.replies[thread.replies.length - 1]];
  }

  function renderLinkedReference(post: BoardPost) {
    if (!post.linkedResourcePath || !post.linkedResourceLabel) return null;
    return (
      <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">Linked Resource</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-sm text-[var(--muted)]">{post.linkedResourceLabel}</span>
          <Link href={post.linkedResourcePath} className="btn btn-secondary text-sm">
            Open Resource
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-[1.4fr,1fr]">
        <section className="panel p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">How the Board Works</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Use this board to share questions, ideas, field notes, and product feedback with the MilVector community.
              </p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Upvotes increase a post&apos;s importance and help move it higher on the board. You can also link a post directly to a MilVector tool or resource so discussion leads into action.
              </p>
            </div>
            {isAdmin ? (
              <button type="button" className="btn btn-secondary text-sm" disabled={seedingStarters} onClick={() => void seedStarterThreads()}>
                {seedingStarters ? "Seeding..." : "Seed Starter Threads"}
              </button>
            ) : null}
          </div>
          {postingBlocked ? (
            <div className="mt-4 rounded-md border border-[#d69f9f] bg-[var(--surface)] p-4 text-sm text-red-700">
              {postingBlockReason?.trim() || "Your account is currently blocked from posting on the message board."}
            </div>
          ) : null}
          {requiresSavedProfile && !canPost && !postingBlocked ? (
            <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
              Save your MilVector profile before posting or replying so the board stays grounded in real platform members.
            </div>
          ) : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
              <p className="text-sm font-semibold">Posting Standards</p>
              <p className="mt-2 text-sm text-[var(--muted)]">Share enough context to help others respond, avoid duplicate posts, and keep the board practical and mission-focused.</p>
            </div>
            <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
              <p className="text-sm font-semibold">Moderation</p>
              <p className="mt-2 text-sm text-[var(--muted)]">Report spam, unsafe advice, or sensitive information. Admin can review, hide, lock, and pin threads when needed.</p>
            </div>
          </div>
        </section>

        <section className="panel p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Board Activity</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">Recent replies to your threads and conversations you joined.</p>
            </div>
            {unreadNotifications.length > 0 ? (
              <button type="button" className="btn btn-secondary text-sm" onClick={() => void markNotificationsRead()}>
                Mark All Read
              </button>
            ) : null}
          </div>
          <div className="mt-4 space-y-3">
            {notificationsLoading ? <p className="text-sm text-[var(--muted)]">Loading activity...</p> : null}
            {!notificationsLoading && notifications.length === 0 ? <p className="text-sm text-[var(--muted)]">No board notifications yet.</p> : null}
            {notifications.map((notification) => (
              <div key={notification.id} className={`rounded-md border p-4 ${notification.readAt ? "border-[var(--line)] bg-[var(--background)]" : "border-[var(--accent)] bg-[var(--surface)]"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{notification.message}</p>
                  {!notification.readAt ? (
                    <button type="button" className="btn btn-secondary text-xs" onClick={() => void markNotificationsRead([notification.id])}>
                      Mark Read
                    </button>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Link href={`/app/message-board#thread-${notification.postId}`} className="btn btn-secondary text-xs">
                    Open Thread
                  </Link>
                  <span className="text-xs text-[var(--muted)]">{formatDate(notification.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </section>

      <section className="panel grid gap-3 p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-bold">Board Controls</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Find the right thread quickly and keep the feed focused on what matters.</p>
          </div>
          <label className="block min-w-64 space-y-1">
            <span className="text-sm font-medium">Search</span>
            <input className="input" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search posts, replies, authors, or linked resources" />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["top", "new", "active"] as const).map((mode) => (
            <button key={mode} type="button" className={sortMode === mode ? "btn btn-primary text-sm" : "btn btn-secondary text-sm"} onClick={() => setSortMode(mode)}>
              {mode === "top" ? "Top" : mode === "new" ? "New" : "Active"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            ["all", "All"],
            ["my_posts", "My Posts"],
            ["unanswered", "Unanswered"],
            ["pinned", "Pinned"],
            ["locked", "Locked"],
          ] as const).map(([mode, label]) => (
            <button key={mode} type="button" className={filterMode === mode ? "btn btn-primary text-sm" : "btn btn-secondary text-sm"} onClick={() => setFilterMode(mode)}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <form className="panel grid gap-3 p-6" onSubmit={submitPost}>
        <div>
          <h2 className="text-lg font-bold">Start a Discussion</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Share a question, suggestion, or field note. You can optionally connect the post to a MilVector workflow so people can jump straight into the right tool or resource.
          </p>
        </div>
        <input name="title" className="input" placeholder="Post title" required minLength={3} maxLength={140} disabled={posting || !canPost} />
        <textarea name="body" className="input min-h-32" placeholder="What should the community know or weigh in on?" required minLength={3} maxLength={4000} disabled={posting || !canPost} />
        <label className="space-y-1">
          <span className="text-sm font-medium">Link this thread to a MilVector workflow or resource</span>
          <select name="linkKey" className="input" defaultValue="" disabled={posting || !canPost}>
            <option value="">No linked resource</option>
            {MESSAGE_BOARD_LINK_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div>
          <button className="btn btn-primary" type="submit" disabled={posting || !canPost}>
            {posting ? "Posting..." : canPost ? "Post to Board" : postingBlocked ? "Posting Blocked" : "Save Profile To Post"}
          </button>
        </div>
      </form>

      {status ? <div className={`alert-base ${status.kind === "error" ? "alert-error" : status.kind === "info" ? "alert-info" : "alert-success"}`} aria-live="polite">{status.message}</div> : null}

      <section className="space-y-4">
        {loading ? (
          <div className="panel p-6 text-sm text-[var(--muted)]">Loading board...</div>
        ) : threads.length === 0 ? (
          <div className="panel p-6">
            <h3 className="text-base font-bold">No matching discussions yet.</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">Try a different filter, seed a starter prompt, or open a new thread with enough context for the community to respond well.</p>
          </div>
        ) : (
          threads.map((thread) => (
            <article key={thread.id} id={`thread-${thread.id}`} className="panel p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  {editingPostId === thread.id ? (
                    <div className="space-y-3">
                      <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} minLength={3} maxLength={140} />
                      <textarea className="input min-h-32" value={editBody} onChange={(e) => setEditBody(e.target.value)} minLength={3} maxLength={4000} />
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn btn-primary text-sm" onClick={() => void saveEdit(thread)}>Save Changes</button>
                        <button type="button" className="btn btn-secondary text-sm" onClick={() => setEditingPostId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold">{thread.title}</h3>
                        {statusBadge(thread).map((label) => (
                          <span key={`${thread.id}-${label}`} className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                            {label}
                          </span>
                        ))}
                        <span className="rounded-full bg-[var(--background)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                          {thread.replies.length} repl{thread.replies.length === 1 ? "y" : "ies"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {thread.authorLabel} · {formatDate(thread.createdAt)}{thread.editedAt ? ` · edited ${formatDate(thread.editedAt)}` : ""} · active {formatDate(thread.lastActivityAt ?? thread.createdAt)}
                      </p>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{thread.body}</p>
                      {renderLinkedReference(thread)}
                    </>
                  )}
                </div>

                <div className="flex min-w-32 items-center gap-2 md:flex-col md:items-stretch">
                  <button type="button" className={`btn ${thread.userVote === 1 ? "btn-primary" : "btn-secondary"}`} onClick={() => castVote(thread.id, 1)} disabled={votingPostId === thread.id || thread.status !== "active"}>
                    Upvote
                  </button>
                  <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-center text-sm font-semibold">Score {thread.score}</div>
                  <button type="button" className={`btn ${thread.userVote === -1 ? "btn-primary" : "btn-secondary"}`} onClick={() => castVote(thread.id, -1)} disabled={votingPostId === thread.id || thread.status !== "active"}>
                    Downvote
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="button" className="btn btn-secondary" disabled={!canPost || thread.isLocked || thread.status !== "active"} onClick={() => setReplyingTo((current) => current === thread.id ? null : thread.id)}>
                  {replyingTo === thread.id ? "Cancel Reply" : `Reply${thread.replies.length ? ` (${thread.replies.length})` : ""}`}
                </button>
                {thread.replies.length > 1 ? (
                  <button type="button" className="btn btn-secondary text-sm" onClick={() => setExpandedReplies((current) => ({ ...current, [thread.id]: !current[thread.id] }))}>
                    {expandedReplies[thread.id] ? "Collapse Replies" : `Show All Replies (${thread.replies.length})`}
                  </button>
                ) : null}
                {canManageOwn(thread, thread) && editingPostId !== thread.id ? (
                  <>
                    <button type="button" className="btn btn-secondary text-sm" onClick={() => beginEdit(thread)}>Edit</button>
                    <button type="button" className="btn btn-secondary text-sm" onClick={() => void deleteOwnPost(thread)}>Delete</button>
                  </>
                ) : null}
                {currentUserId && currentUserId !== thread.userId ? (
                  <button type="button" className="btn btn-secondary text-sm" onClick={() => setReportingPostId((current) => current === thread.id ? null : thread.id)}>
                    {reportingPostId === thread.id ? "Cancel Report" : "Report"}
                  </button>
                ) : null}
                {isAdmin ? (
                  <>
                    <button type="button" className="btn btn-secondary text-sm" disabled={adminBusyId === thread.id} onClick={() => void moderatePost(thread.id, { isPinned: !thread.isPinned }, thread.isPinned ? "Thread unpinned." : "Thread pinned.")}>
                      {thread.isPinned ? "Unpin" : "Pin"}
                    </button>
                    <button type="button" className="btn btn-secondary text-sm" disabled={adminBusyId === thread.id} onClick={() => void moderatePost(thread.id, { isLocked: !thread.isLocked }, thread.isLocked ? "Thread unlocked." : "Thread locked.")}>
                      {thread.isLocked ? "Unlock" : "Lock"}
                    </button>
                    <button type="button" className="btn btn-secondary text-sm" disabled={adminBusyId === thread.id} onClick={() => void moderatePost(thread.id, { status: thread.status === "active" ? "hidden" : "active" }, thread.status === "active" ? "Thread hidden." : "Thread restored.")}>
                      {thread.status === "active" ? "Hide" : "Restore"}
                    </button>
                  </>
                ) : null}
              </div>

              {reportingPostId === thread.id ? (
                <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="grid gap-3 md:grid-cols-[220px,1fr]">
                    <label className="space-y-1">
                      <span className="text-sm font-medium">Reason</span>
                      <select className="input" value={reportReason} onChange={(e) => setReportReason(e.target.value as ReportReason)}>
                        {MESSAGE_BOARD_REPORT_REASONS.map((reason) => (
                          <option key={reason} value={reason}>
                            {reason}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-sm font-medium">Details</span>
                      <textarea className="input min-h-24" value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} placeholder="Optional context for admin review" maxLength={1000} />
                    </label>
                  </div>
                  <div className="mt-3">
                    <button type="button" className="btn btn-primary text-sm" disabled={reporting} onClick={() => void submitReport(thread)}>
                      {reporting ? "Submitting..." : "Submit Report"}
                    </button>
                  </div>
                </div>
              ) : null}

              {replyingTo === thread.id ? (
                <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
                  <textarea className="input min-h-24" placeholder="Add your reply" value={replyDrafts[thread.id] ?? ""} onChange={(e) => setReplyDrafts((current) => ({ ...current, [thread.id]: e.target.value }))} maxLength={4000} />
                  <div className="mt-3">
                    <button type="button" className="btn btn-primary" onClick={() => submitReply(thread.id)} disabled={posting || !canPost}>
                      {posting ? "Posting..." : "Submit Reply"}
                    </button>
                  </div>
                </div>
              ) : null}

              {thread.replies.length > 0 ? (
                <div className="mt-4 space-y-3 border-t border-[var(--line)] pt-4">
                  {visibleReplies(thread).map((reply) => (
                    <div key={reply.id} className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
                      {editingPostId === reply.id ? (
                        <div className="space-y-3">
                          <textarea className="input min-h-24" value={editBody} onChange={(e) => setEditBody(e.target.value)} minLength={3} maxLength={4000} />
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className="btn btn-primary text-sm" onClick={() => void saveEdit(reply)}>Save Changes</button>
                            <button type="button" className="btn btn-secondary text-sm" onClick={() => setEditingPostId(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold">{reply.authorLabel}</p>
                              <p className="mt-1 text-xs text-[var(--muted)]">{formatDate(reply.createdAt)}{reply.editedAt ? ` · edited ${formatDate(reply.editedAt)}` : ""}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {canManageOwn(reply, thread) ? (
                                <>
                                  <button type="button" className="btn btn-secondary text-sm" onClick={() => beginEdit(reply)}>Edit</button>
                                  <button type="button" className="btn btn-secondary text-sm" onClick={() => void deleteOwnPost(reply)}>Delete</button>
                                </>
                              ) : null}
                              {currentUserId && currentUserId !== reply.userId ? (
                                <button type="button" className="btn btn-secondary text-sm" onClick={() => setReportingPostId((current) => current === reply.id ? null : reply.id)}>
                                  {reportingPostId === reply.id ? "Cancel Report" : "Report"}
                                </button>
                              ) : null}
                              {isAdmin ? (
                                <button type="button" className="btn btn-secondary text-sm" disabled={adminBusyId === reply.id} onClick={() => void moderatePost(reply.id, { status: reply.status === "active" ? "hidden" : "active" }, reply.status === "active" ? "Reply hidden." : "Reply restored.")}>
                                  {reply.status === "active" ? "Hide" : "Restore"}
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{reply.body}</p>
                          {reportingPostId === reply.id ? (
                            <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
                              <div className="grid gap-3 md:grid-cols-[220px,1fr]">
                                <label className="space-y-1">
                                  <span className="text-sm font-medium">Reason</span>
                                  <select className="input" value={reportReason} onChange={(e) => setReportReason(e.target.value as ReportReason)}>
                                    {MESSAGE_BOARD_REPORT_REASONS.map((reason) => (
                                      <option key={reason} value={reason}>
                                        {reason}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="space-y-1">
                                  <span className="text-sm font-medium">Details</span>
                                  <textarea className="input min-h-24" value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} placeholder="Optional context for admin review" maxLength={1000} />
                                </label>
                              </div>
                              <div className="mt-3">
                                <button type="button" className="btn btn-primary text-sm" disabled={reporting} onClick={() => void submitReport(reply)}>
                                  {reporting ? "Submitting..." : "Submit Report"}
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
