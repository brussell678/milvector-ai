"use client";

import { FormEvent, useEffect, useState } from "react";

type BoardPost = {
  id: string;
  parentPostId: string | null;
  title: string | null;
  body: string;
  authorLabel: string;
  createdAt: string;
  score: number;
  userVote: number;
};

type TopLevelPost = BoardPost & {
  replies: BoardPost[];
};

type StatusState = {
  kind: "success" | "error" | "info";
  message: string;
} | null;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function buildThreads(posts: BoardPost[]): TopLevelPost[] {
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
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })
    .map((post) => ({
      ...post,
      replies: (repliesByParent.get(post.id) ?? []).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    }));
}

async function requestJson(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false as const,
        error: data.error ?? "Request failed.",
        data: null,
      };
    }

    return {
      ok: true as const,
      data,
    };
  } catch {
    return {
      ok: false as const,
      error: "Network request failed. Please try again.",
      data: null,
    };
  }
}

async function fetchBoard() {
  const result = await requestJson("/api/message-board", { cache: "no-store" });

  if (!result.ok) {
    return {
      ok: false as const,
      error: result.error,
      posts: [] as BoardPost[],
    };
  }

  return {
    ok: true as const,
    posts: (result.data.posts ?? []) as BoardPost[],
  };
}

export function MessageBoard() {
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusState>(null);
  const [posting, setPosting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [votingPostId, setVotingPostId] = useState<string | null>(null);

  async function loadBoard() {
    setLoading(true);
    const result = await fetchBoard();

    if (!result.ok) {
      setStatus({ kind: "error", message: result.error });
      setLoading(false);
      return;
    }

    setPosts(result.posts);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;

    async function loadInitialBoard() {
      const result = await fetchBoard();
      if (!active) return;

      if (!result.ok) {
        setStatus({ kind: "error", message: result.error });
        setLoading(false);
        return;
      }

      setPosts(result.posts);
      setLoading(false);
    }

    void loadInitialBoard();

    return () => {
      active = false;
    };
  }, []);

  const topLevelPosts = buildThreads(posts);

  async function submitPost(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPosting(true);
    setStatus({ kind: "info", message: "Posting your message..." });

    try {
      const form = new FormData(e.currentTarget);
      const payload = {
        title: form.get("title")?.toString() ?? "",
        body: form.get("body")?.toString() ?? "",
      };

      const result = await requestJson("/api/message-board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
    const body = replyDrafts[postId]?.trim() ?? "";
    if (!body) {
      setStatus({ kind: "error", message: "Reply text cannot be empty." });
      return;
    }

    setPosting(true);
    setStatus({ kind: "info", message: "Posting your message..." });

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

  return (
    <div className="space-y-4">
      <section className="panel p-6">
        <h2 className="text-lg font-bold">How the Board Works</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Use this board to share questions, ideas, and issues with the MilVector community.
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Upvotes increase a post&apos;s importance and help move it higher on the board. Downvotes lower its priority, so the most useful and relevant discussions stay near the top.
        </p>
      </section>

      <form className="panel grid gap-3 p-6" onSubmit={submitPost}>
        <div>
          <h2 className="text-lg font-bold">Start a Discussion</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Share a question, suggestion, or field note. Posts with the strongest support rise to the top.
          </p>
        </div>
        <input
          name="title"
          className="input"
          placeholder="Post title"
          required
          minLength={3}
          maxLength={140}
          disabled={posting}
        />
        <textarea
          name="body"
          className="input min-h-32"
          placeholder="What should the community know or weigh in on?"
          required
          minLength={3}
          maxLength={4000}
          disabled={posting}
        />
        <div>
          <button className="btn btn-primary" type="submit" disabled={posting}>
            {posting ? "Posting..." : "Post to Board"}
          </button>
        </div>
      </form>

      {status && (
        <div
          className={`alert-base ${
            status.kind === "error"
              ? "alert-error"
              : status.kind === "info"
                ? "alert-info"
                : "alert-success"
          }`}
          aria-live="polite"
        >
          {status.message}
        </div>
      )}

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
                  <h3 className="text-lg font-bold">{post.title}</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {post.authorLabel} - {formatDate(post.createdAt)}
                  </p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{post.body}</p>
                </div>

                <div className="flex min-w-32 items-center gap-2 md:flex-col md:items-stretch">
                  <button
                    type="button"
                    className={`btn ${post.userVote === 1 ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => castVote(post.id, 1)}
                    disabled={votingPostId === post.id}
                  >
                    Upvote
                  </button>
                  <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-center text-sm font-semibold">
                    Score {post.score}
                  </div>
                  <button
                    type="button"
                    className={`btn ${post.userVote === -1 ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => castVote(post.id, -1)}
                    disabled={votingPostId === post.id}
                  >
                    Downvote
                  </button>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setReplyingTo((current) => (current === post.id ? null : post.id))}
                >
                  {replyingTo === post.id ? "Cancel Reply" : `Reply${post.replies.length ? ` (${post.replies.length})` : ""}`}
                </button>
              </div>

              {replyingTo === post.id && (
                <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
                  <textarea
                    className="input min-h-24"
                    placeholder="Add your reply"
                    value={replyDrafts[post.id] ?? ""}
                    onChange={(e) => setReplyDrafts((current) => ({ ...current, [post.id]: e.target.value }))}
                    maxLength={4000}
                  />
                  <div className="mt-3">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => submitReply(post.id)}
                      disabled={posting}
                    >
                      {posting ? "Posting..." : "Submit Reply"}
                    </button>
                  </div>
                </div>
              )}

              {post.replies.length > 0 && (
                <div className="mt-4 space-y-3 border-t border-[var(--line)] pt-4">
                  {post.replies.map((reply) => (
                    <div key={reply.id} className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
                      <p className="text-sm font-semibold">{reply.authorLabel}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">{formatDate(reply.createdAt)}</p>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{reply.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
