"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { ANNOUNCEMENT_WINDOW_DAYS, monthLabel, olderThan, onTheBar } from "@/lib/updates/announcement";

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
  created_at?: string | null;
};

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "new", label: "New" },
  { value: "improvement", label: "Improved" },
  { value: "fix", label: "Fixed" },
];

// A draft that has waited this long gets a tag, so it is easy to tell what is
// still current from what can be cleared.
const STALE_DRAFT_DAYS = 30;

type Tab = "drafts" | "posted" | "new";

const categoryLabel = (value: string) => CATEGORIES.find((c) => c.value === value)?.label ?? value;

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

const shortDate = (date: Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);

async function send(id: string, method: "PATCH" | "DELETE", change?: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch(`/api/admin/updates/${id}`, {
      method,
      headers: change ? { "Content-Type": "application/json" } : undefined,
      body: change ? JSON.stringify(change) : undefined,
    });
    if (res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return typeof data.error === "string" ? data.error : "That did not save. Try again.";
  } catch {
    return "Network error. Try again.";
  }
}

// A draft's full wording, which can be edited, and a two-step Publish because
// publishing reaches every member at once. Shown when its row is opened.
function DraftDetail({ update, onChanged }: { update: ExistingUpdate; onChanged: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [title, setTitle] = useState(update.title);
  const [body, setBody] = useState(update.body);
  const [category, setCategory] = useState(update.category);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(method: "PATCH" | "DELETE", change: Record<string, unknown> | undefined, message: string) {
    setBusy(true);
    setError("");
    const problem = await send(update.id, method, change);
    setBusy(false);
    if (problem) {
      setError(problem);
      return false;
    }
    onChanged(message);
    return true;
  }

  return (
    <div className="border-t border-[var(--line)] p-4">
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
            <button
              type="button"
              className="btn btn-primary text-sm"
              disabled={busy}
              onClick={async () => {
                if (await run("PATCH", { title, body, category }, "Draft saved. Members still see nothing until you publish it.")) setEditing(false);
              }}
            >
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
          <p className="whitespace-pre-line text-sm">{update.body}</p>
          {confirming ? (
            <div className="mt-4 flex flex-col gap-2">
              <p className="text-sm font-medium">Publish to every member now?</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary text-sm"
                  disabled={busy}
                  onClick={() => void run("PATCH", { published: true }, `Published "${update.title}". It is on the announcement bar and What's New now.`)}
                >
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
              <button type="button" className="btn btn-secondary text-sm" disabled={busy} onClick={() => void run("DELETE", undefined, `Deleted the draft "${update.title}".`)}>
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
    </div>
  );
}

// One line per draft: a checkbox for doing several at once, and the title,
// which opens the full wording and its buttons.
function DraftRow({
  update,
  now,
  selected,
  onSelect,
  onChanged,
}: {
  update: ExistingUpdate;
  now: Date;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onChanged: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const added = update.created_at || update.published_at;
  const stale = olderThan(added, STALE_DRAFT_DAYS, now);
  return (
    <li className="rounded-lg border border-[var(--line)] bg-[var(--surface)]" data-draft-row={update.id}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 p-3">
        <input type="checkbox" className="mt-1 h-4 w-4" checked={selected} onChange={(e) => onSelect(e.target.checked)} aria-label={`Select "${update.title}"`} />
        <button type="button" className="flex min-w-0 items-start justify-between gap-3 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{update.title}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted)]">
              <span>
                {categoryLabel(update.category)} · Added {formatDate(added)}
              </span>
              {stale ? <span className="tool-badge tool-badge-warn">Older than {STALE_DRAFT_DAYS} days</span> : null}
            </span>
          </span>
          <ChevronDown size={18} aria-hidden="true" className={`mt-0.5 shrink-0 text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open ? <DraftDetail update={update} onChanged={onChanged} /> : null}
    </li>
  );
}

// One line per posted update, with a two-step Delete because a posted update
// is live for members.
function PostedRow({ update, barUntil, onDeleted }: { update: ExistingUpdate; barUntil: Date | null; onDeleted: (message: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <li className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3" data-posted-row={update.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 grow basis-[220px]">
          <p className="text-sm font-semibold">{update.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted)]">
            <span>
              {formatDate(update.published_at)} · {categoryLabel(update.category)}
              {update.is_user_requested ? " · user-requested" : ""}
            </span>
            {barUntil ? <span className="tool-badge tool-badge-success">On the bar until {shortDate(barUntil)}</span> : null}
          </p>
        </div>
        {confirming ? (
          <span className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="text-xs font-medium">Delete? It leaves What&apos;s New for everyone.</span>
            <button
              type="button"
              className="btn btn-primary text-xs"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const problem = await send(update.id, "DELETE");
                setBusy(false);
                if (problem) setError(problem);
                else onDeleted(`Deleted "${update.title}".`);
              }}
            >
              {busy ? "Deleting…" : "Yes, delete"}
            </button>
            <button type="button" className="btn btn-secondary text-xs" disabled={busy} onClick={() => setConfirming(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" className="btn btn-secondary shrink-0 text-xs" onClick={() => setConfirming(true)}>
            Delete
          </button>
        )}
      </div>
      {error ? (
        <p className="alert-base alert-error mt-2" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function UpdatesManager({
  initialUpdates,
  feedbackOptions,
  now: nowIso,
}: {
  initialUpdates: ExistingUpdate[];
  feedbackOptions: FeedbackOption[];
  // When the page was rendered, so every date comparison agrees between the server and the browser.
  now: string;
}) {
  const router = useRouter();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const drafts = initialUpdates.filter((update) => !update.published);
  const posted = initialUpdates.filter((update) => update.published);
  const bar = onTheBar(posted, now);

  const [tab, setTab] = useState<Tab>(drafts.length > 0 ? "drafts" : "posted");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<"" | "publish" | "delete">("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [search, setSearch] = useState("");

  // Composer
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("improvement");
  const [userRequested, setUserRequested] = useState(false);
  const [linkedFeedbackId, setLinkedFeedbackId] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error" | ""; text: string }>({ kind: "", text: "" });
  const linkedOption = feedbackOptions.find((option) => option.id === linkedFeedbackId);

  const changed = (text: string) => {
    setMessage(text);
    router.refresh();
  };

  // Only drafts still on the page count as selected.
  const picked = drafts.filter((d) => selected.has(d.id));
  const allPicked = drafts.length > 0 && picked.length === drafts.length;

  async function runBulk(kind: "publish" | "delete") {
    setBulkBusy(true);
    // Oldest first, so the newest draft is published last and is the one on the announcement bar.
    const order = kind === "publish" ? [...picked].reverse() : picked;
    const failed: string[] = [];
    for (const d of order) {
      const problem = await send(d.id, kind === "publish" ? "PATCH" : "DELETE", kind === "publish" ? { published: true } : undefined);
      if (problem) failed.push(`"${d.title}": ${problem}`);
    }
    setBulkBusy(false);
    setBulk("");
    setSelected(new Set());
    const done = order.length - failed.length;
    const verb = kind === "publish" ? "Published" : "Deleted";
    changed(
      failed.length
        ? `${verb} ${done} of ${order.length}. Not done: ${failed.join("; ")}`
        : `${verb} ${done} ${done === 1 ? "update" : "updates"}.${kind === "publish" ? " The newest is on the announcement bar; all are on What's New." : ""}`,
    );
  }

  // Posted updates by month, newest month first, narrowed by the search box.
  const query = search.trim().toLowerCase();
  const byMonth = new Map<string, ExistingUpdate[]>();
  for (const u of query ? posted.filter((p) => `${p.title} ${p.body}`.toLowerCase().includes(query)) : posted) {
    const key = monthLabel(u.published_at);
    byMonth.set(key, [...(byMonth.get(key) ?? []), u]);
  }
  const groups = [...byMonth.entries()];

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
        text:
          linkedFeedbackId && linkedOption?.hasEmail
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

  const tabs: { id: Tab; label: string }[] = [
    { id: "drafts", label: `Drafts (${drafts.length})` },
    { id: "posted", label: `Posted (${posted.length})` },
    { id: "new", label: "Write new" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--panel)] p-1" role="tablist" aria-label="What's New sections">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => {
              setTab(item.id);
              setMessage("");
            }}
            className={`grow basis-0 whitespace-nowrap rounded-lg px-2 py-2 text-center text-sm font-semibold transition-colors [overflow-wrap:normal] sm:px-3 ${
              tab === item.id ? "bg-[var(--accent)] text-white shadow-[var(--shadow-sm)]" : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {message ? (
        <p className="alert-base alert-success" aria-live="polite">
          {message}
        </p>
      ) : null}

      {/* ── Drafts ─────────────────────────────────────────────── */}
      {tab === "drafts" && (
        <section className="flex flex-col gap-3" role="tabpanel" aria-label="Drafts">
          <p className="text-sm text-[var(--muted)]">
            Members see nothing until you publish. The newest published update shows on the announcement bar for {ANNOUNCEMENT_WINDOW_DAYS} days, and
            every update stays on What&apos;s New. Open a draft to read, edit, or publish it.
          </p>
          {drafts.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No drafts waiting.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] p-2">
                <label className="flex items-center gap-2 px-1 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={allPicked}
                    onChange={(e) => setSelected(e.target.checked ? new Set(drafts.map((d) => d.id)) : new Set())}
                  />
                  <span>{picked.length ? `${picked.length} selected` : "Select all"}</span>
                </label>
                {bulk ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {bulk === "publish"
                        ? `Publish ${picked.length} to every member now? Only the newest shows on the announcement bar.`
                        : `Delete ${picked.length} ${picked.length === 1 ? "draft" : "drafts"}?`}
                    </span>
                    <button type="button" className="btn btn-primary text-sm" disabled={bulkBusy} onClick={() => void runBulk(bulk)}>
                      {bulkBusy ? "Working…" : bulk === "publish" ? "Yes, publish" : "Yes, delete"}
                    </button>
                    <button type="button" className="btn btn-secondary text-sm" disabled={bulkBusy} onClick={() => setBulk("")}>
                      Not yet
                    </button>
                  </span>
                ) : (
                  <span className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-primary text-sm" disabled={!picked.length} onClick={() => setBulk("publish")}>
                      Publish selected
                    </button>
                    <button type="button" className="btn btn-secondary text-sm" disabled={!picked.length} onClick={() => setBulk("delete")}>
                      Delete selected
                    </button>
                  </span>
                )}
              </div>
              <ul className="flex flex-col gap-2">
                {drafts.map((update) => (
                  <DraftRow
                    key={update.id}
                    update={update}
                    now={now}
                    selected={selected.has(update.id)}
                    onSelect={(on) => {
                      const next = new Set(selected);
                      if (on) next.add(update.id);
                      else next.delete(update.id);
                      setSelected(next);
                    }}
                    onChanged={changed}
                  />
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* ── Posted ─────────────────────────────────────────────── */}
      {tab === "posted" && (
        <section className="flex flex-col gap-3" role="tabpanel" aria-label="Posted">
          <p className="text-sm text-[var(--muted)]">
            {bar
              ? `"${posted.find((u) => u.id === bar.id)?.title}" is on the announcement bar until ${shortDate(bar.until)}, unless you publish a newer one.`
              : `The announcement bar is empty: nothing was published in the last ${ANNOUNCEMENT_WINDOW_DAYS} days.`}
          </p>
          <input className="input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search posted updates" aria-label="Search posted updates" />
          {groups.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">{search.trim() ? "No posted update matches that." : "Nothing posted yet."}</p>
          ) : (
            groups.map(([month, updates], index) => (
              <details key={month} open={index === 0 || !!search.trim()} className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
                  {month} <span className="font-normal text-[var(--muted)]">({updates.length})</span>
                </summary>
                <ul className="flex flex-col gap-2 px-3 pb-3">
                  {updates.map((update) => (
                    <PostedRow key={update.id} update={update} barUntil={bar?.id === update.id ? bar.until : null} onDeleted={changed} />
                  ))}
                </ul>
              </details>
            ))
          )}
        </section>
      )}

      {/* ── Write new ──────────────────────────────────────────── */}
      {tab === "new" && (
        <form className="flex max-w-2xl flex-col gap-4" onSubmit={onSubmit} role="tabpanel" aria-label="Write new">
          <p className="text-sm text-[var(--muted)]">
            Most updates arrive as drafts from WHATSNEW.md. Write one here to post it right away, or to link a support case and email its reporter.
          </p>
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
      )}
    </div>
  );
}
