"use client";

import { FormEvent, useEffect, useState } from "react";

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
  score: number;
  userVote: number;
};

type StatusState = { kind: "success" | "error" | "info"; message: string } | null;

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
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })
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
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusState>(null);
  const [posting, setPosting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [votingPostId, setVotingPostId] = useState<string | null>(null);
  const [adminBusyId, setAdminBusyId] = useState<string | null>(null);
  const [canPost, setCanPost] = useState(false);
  const [requiresSavedProfile, setRequiresSavedProfile] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

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
    setIsAdmin(Boolean(result.data.isAdmin));
    setLoading(false);
  }

  useEffect(() => {
    void loadBoard();
  }, []);

  const topLevelPosts = buildThreads(posts);

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
        }),
      });
      if (!result.ok) {
        setStatus({ kind: "error", message: result.error ?? "Unable to create post." });
        return;
      }
      e.currentTarget.reset();
      setStatus({ kind: "success", message: "Your message has been posted." });
      await loadBoard();
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
      setStatus({ kind: "success", message: "Your reply has been posted." });
      await loadBoard();
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

  function statusBadge(post: BoardPost) {
    const labels = [];
    if (post.isPinned) labels.push("Pinned");
    if (post.isLocked) labels.push("Locked");
    if (post.status !== "active") labels.push(post.status === "hidden" ? "Hidden" : "Removed");
    return labels;
  }

  return (
    <div className="space-y-4">
      <section className="panel p-6">
        <h2 className="text-lg font-bold">How the Board Works</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Use this board to share questions, ideas, and issues with the MilVector community.
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Upvotes increase a post&apos;s importance and help move it higher on the board. Pinned threads stay at the top, and locked threads remain readable but closed to new replies.
        </p>
        {requiresSavedProfile && !canPost ? (
          <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
            Save your MilVector profile before posting or replying so the board stays grounded in real platform members.
          </div>
        ) : null}
      </section>

      <form className="panel grid gap-3 p-6" onSubmit={submitPost}>
        <div>
          <h2 className="text-lg font-bold">Start a Discussion</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Share a question, suggestion, or field note. Posts with the strongest support rise to the top.
          </p>
        </div>
        <input name="title" className="input" placeholder="Post title" required minLength={3} maxLength={140} disabled={posting || !canPost} />
        <textarea name="body" className="input min-h-32" placeholder="What should the community know or weigh in on?" required minLength={3} maxLength={4000} disabled={posting || !canPost} />
        <div>
          <button className="btn btn-primary" type="submit" disabled={posting || !canPost}>
            {posting ? "Posting..." : canPost ? "Post to Board" : "Save Profile To Post"}
          </button>
        </div>
      </form>

      {status ? <div className={`alert-base ${status.kind === "error" ? "alert-error" : status.kind === "info" ? "alert-info" : "alert-success"}`} aria-live="polite">{status.message}</div> : null}

      <section className="space-y-4">
        {loading ? (
          <div className="panel p-6 text-sm text-[var(--muted)]">Loading board...</div>
        ) : topLevelPosts.length === 0 ? (
          <div className="panel p-6 text-sm text-[var(--muted)]">No posts yet. Start the first discussion.</div>
        ) : (
          topLevelPosts.map((post) => (
            <article key={post.id} className="panel p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold">{post.title}</h3>
                    {statusBadge(post).map((label) => (
                      <span key={`${post.id}-${label}`} className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                        {label}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {post.authorLabel} - {formatDate(post.createdAt)}{post.editedAt ? ` - edited ${formatDate(post.editedAt)}` : ""}
                  </p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{post.body}</p>
                </div>

                <div className="flex min-w-32 items-center gap-2 md:flex-col md:items-stretch">
                  <button type="button" className={`btn ${post.userVote === 1 ? "btn-primary" : "btn-secondary"}`} onClick={() => castVote(post.id, 1)} disabled={votingPostId === post.id || post.status !== "active"}>
                    Upvote
                  </button>
                  <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-center text-sm font-semibold">Score {post.score}</div>
                  <button type="button" className={`btn ${post.userVote === -1 ? "btn-primary" : "btn-secondary"}`} onClick={() => castVote(post.id, -1)} disabled={votingPostId === post.id || post.status !== "active"}>
                    Downvote
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!canPost || post.isLocked || post.status !== "active"}
                  onClick={() => setReplyingTo((current) => (current === post.id ? null : post.id))}
                >
                  {replyingTo === post.id ? "Cancel Reply" : `Reply${post.replies.length ? ` (${post.replies.length})` : ""}`}
                </button>
                {isAdmin ? (
                  <>
                    <button type="button" className="btn btn-secondary text-sm" disabled={adminBusyId === post.id} onClick={() => void moderatePost(post.id, { isPinned: !post.isPinned }, post.isPinned ? "Thread unpinned." : "Thread pinned.")}>
                      {post.isPinned ? "Unpin" : "Pin"}
                    </button>
                    <button type="button" className="btn btn-secondary text-sm" disabled={adminBusyId === post.id} onClick={() => void moderatePost(post.id, { isLocked: !post.isLocked }, post.isLocked ? "Thread unlocked." : "Thread locked.")}>
                      {post.isLocked ? "Unlock" : "Lock"}
                    </button>
                    <button type="button" className="btn btn-secondary text-sm" disabled={adminBusyId === post.id} onClick={() => void moderatePost(post.id, { status: post.status === "active" ? "hidden" : "active" }, post.status === "active" ? "Thread hidden." : "Thread restored.")}>
                      {post.status === "active" ? "Hide" : "Restore"}
                    </button>
                    <button type="button" className="btn btn-secondary text-sm" disabled={adminBusyId === post.id || post.status === "removed"} onClick={() => void moderatePost(post.id, { status: "removed" }, "Thread removed from the public board.")}>
                      Remove
                    </button>
                  </>
                ) : null}
              </div>

              {replyingTo === post.id ? (
                <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
                  <textarea className="input min-h-24" placeholder="Add your reply" value={replyDrafts[post.id] ?? ""} onChange={(e) => setReplyDrafts((current) => ({ ...current, [post.id]: e.target.value }))} maxLength={4000} />
                  <div className="mt-3">
                    <button type="button" className="btn btn-primary" onClick={() => submitReply(post.id)} disabled={posting || !canPost}>
                      {posting ? "Posting..." : "Submit Reply"}
                    </button>
                  </div>
                </div>
              ) : null}

              {post.replies.length > 0 ? (
                <div className="mt-4 space-y-3 border-t border-[var(--line)] pt-4">
                  {post.replies.map((reply) => (
                    <div key={reply.id} className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{reply.authorLabel}</p>
                          <p className="mt-1 text-xs text-[var(--muted)]">{formatDate(reply.createdAt)}{reply.editedAt ? ` - edited ${formatDate(reply.editedAt)}` : ""}</p>
                        </div>
                        {isAdmin ? (
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className="btn btn-secondary text-sm" disabled={adminBusyId === reply.id} onClick={() => void moderatePost(reply.id, { status: reply.status === "active" ? "hidden" : "active" }, reply.status === "active" ? "Reply hidden." : "Reply restored.")}>
                              {reply.status === "active" ? "Hide" : "Restore"}
                            </button>
                            <button type="button" className="btn btn-secondary text-sm" disabled={adminBusyId === reply.id || reply.status === "removed"} onClick={() => void moderatePost(reply.id, { status: "removed" }, "Reply removed from the public board.")}>
                              Remove
                            </button>
                          </div>
                        ) : null}
                      </div>
                      {statusBadge(reply).length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {statusBadge(reply).map((label) => (
                            <span key={`${reply.id}-${label}`} className="rounded-full bg-[var(--background)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                              {label}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{reply.body}</p>
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
