"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inactiveLabel, RETENTION, type RetentionStatus } from "@/lib/admin/retention";

// The admin's member roster (migration 0046): every member, longest since
// last use first, tagged by where they stand on the retention timeline, with
// the two actions the admin approves by hand for now: clear transition records,
// and delete the account.

export type MemberView = {
  id: string;
  email: string | null;
  name: string | null;
  branch: string | null;
  rank: string | null;
  joinedAt: string;
  lastActive: string;
  daysInactive: number;
  retirementDate: string | null;
  cards: number;
  liveCards: number;
  documents: number;
  resumes: number;
  linkedin: number;
  invites: number;
  timelineDone: number;
  toolRuns: number;
  fileBytes: number;
  dataBytes: number;
  hasRecords: boolean;
  status: RetentionStatus;
  clearOn: string;
  noticeSentAt: string | null;
  finalSentAt: string | null;
  recordsClearedAt: string | null;
  // An email is due now (the daily job sends it).
  noticeDue: boolean;
};

const TAGS: Record<RetentionStatus, { label: string; className: string; order: number }> = {
  ready: { label: "Ready to clear", className: "tool-badge-error", order: 0 },
  final: { label: "Final notice", className: "tool-badge-orange", order: 1 },
  notice: { label: "Notice sent", className: "tool-badge-warn", order: 2 },
  notice_due: { label: "Notice due", className: "tool-badge-warn", order: 3 },
  quiet: { label: "Quiet", className: "tool-badge-neutral", order: 4 },
  active: { label: "Active", className: "tool-badge-success", order: 5 },
  nothing: { label: "No records", className: "tool-badge-neutral", order: 6 },
  cleared: { label: "Cleared", className: "tool-badge-neutral", order: 7 },
};

const day = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value));

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timelineLine(m: MemberView): string {
  switch (m.status) {
    case "active":
    case "quiet":
      return `Earliest clear date ${day(m.clearOn)}; the first notice goes out 60 days before.`;
    case "notice_due":
      return `First notice due now, naming ${day(m.clearOn)}. The daily job sends it, or use Send due notices now.`;
    case "notice":
      return m.noticeDue
        ? `Notice sent ${day(m.noticeSentAt!)}. Final notice due now, naming ${day(m.clearOn)}.`
        : `Notice sent ${day(m.noticeSentAt!)}; clears ${day(m.clearOn)}. The final notice goes 14 days before.`;
    case "final":
      return `Final notice sent ${day(m.finalSentAt!)}; ready to clear ${day(m.clearOn)}.`;
    case "ready":
      return `Both notices sent (${day(m.noticeSentAt!)} and ${day(m.finalSentAt!)}); ready since ${day(m.clearOn)}.`;
    case "cleared":
      return `Records cleared ${day(m.recordsClearedAt!)}. Nothing new since.`;
    case "nothing":
      return "Nothing to clear: no uploads, resumes, invitation, Timeline progress, or tool history.";
  }
}

function recordsLine(m: MemberView): string {
  const parts = [
    m.documents && `${m.documents} ${m.documents === 1 ? "file" : "files"}`,
    m.resumes && `${m.resumes} ${m.resumes === 1 ? "resume" : "resumes"}`,
    m.invites && `${m.invites} ${m.invites === 1 ? "invitation" : "invitations"}`,
    m.linkedin && "LinkedIn drafts",
    m.timelineDone && `${m.timelineDone} Timeline ${m.timelineDone === 1 ? "task" : "tasks"}`,
    m.toolRuns && `${m.toolRuns} tool ${m.toolRuns === 1 ? "run" : "runs"}`,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "None";
}

async function post(url: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method: "POST", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { error: "Network error. Try again." } };
  }
}

function MemberRow({ m, onDone }: { m: MemberView; onDone: (message: string) => void }) {
  const [mode, setMode] = useState<"" | "clear" | "delete">("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const who = m.name || m.email || "this member";
  const tag = TAGS[m.status];

  async function run(kind: "clear" | "delete") {
    setBusy(true);
    setError("");
    const { ok, data } = await post(`/api/admin/members/${m.id}/${kind}`, kind === "delete" ? { confirm: typed.trim() } : undefined);
    setBusy(false);
    if (!ok) {
      setError(typeof data.error === "string" ? data.error : "That did not work. Try again.");
      return;
    }
    setMode("");
    onDone(
      kind === "clear"
        ? `Cleared ${who}'s transition records.${data.emailed ? " They were emailed what was cleared and what stays." : " No email went out (email is not set up, or there is no address)."}`
        : `Deleted ${who}'s account.`,
    );
  }

  return (
    <li className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4" data-member={m.id} data-status={m.status}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 grow basis-[220px]">
          <p className="font-semibold">{m.name || m.email || "No name"}</p>
          <p className="text-sm text-[var(--muted)] [overflow-wrap:anywhere]">
            {m.email}
            {m.branch || m.rank ? ` · ${[m.branch, m.rank].filter(Boolean).join(" ")}` : ""}
          </p>
        </div>
        <span className={`tool-badge ${tag.className} shrink-0`}>{tag.label}</span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <dt className="text-xs text-[var(--muted)]">Last used</dt>
          <dd className="font-medium">{inactiveLabel(m.daysInactive)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--muted)]">Joined</dt>
          <dd>{day(m.joinedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--muted)]">Retirement</dt>
          <dd>{m.retirementDate ? day(m.retirementDate) : "Not set"}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--muted)]">Business cards</dt>
          <dd>{m.cards ? `${m.cards} (${m.liveCards} live)` : "None"}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--muted)]">Storage</dt>
          <dd>
            {size(m.fileBytes)} files, {size(m.dataBytes)} data
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-3 lg:col-span-1">
          <dt className="text-xs text-[var(--muted)]">Records</dt>
          <dd>{recordsLine(m)}</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-[var(--muted)]">{timelineLine(m)}</p>

      {mode === "clear" ? (
        <div className="mt-3 space-y-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 text-sm">
          <p className="font-medium">
            Clear {who}&apos;s transition records?{" "}
            {m.status === "ready" ? "They had both notices." : <span className="tool-text-error">They have not had both notices. Clear only if they asked you to.</span>}
          </p>
          <p className="text-[var(--muted)]">
            Clears their uploads and My Files, resumes, saved chats and tool history, Timeline progress, LinkedIn drafts, and invitation. Keeps their account,
            business cards, and Community posts. They get an email saying so.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary text-sm" disabled={busy} onClick={() => void run("clear")}>
              {busy ? "Clearing…" : "Yes, clear"}
            </button>
            <button type="button" className="btn btn-secondary text-sm" disabled={busy} onClick={() => setMode("")}>
              Not yet
            </button>
          </div>
        </div>
      ) : mode === "delete" ? (
        <div className="mt-3 space-y-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 text-sm">
          <p className="font-medium">
            Delete {who}&apos;s whole account, including business cards and Community posts no one replied to? This cannot be undone.
          </p>
          <label className="block space-y-1">
            <span className="text-[var(--muted)]">Type DELETE to confirm</span>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary text-sm" disabled={busy || typed.trim() !== "DELETE"} onClick={() => void run("delete")}>
              {busy ? "Deleting…" : "Delete account"}
            </button>
            <button
              type="button"
              className="btn btn-secondary text-sm"
              disabled={busy}
              onClick={() => {
                setMode("");
                setTyped("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {m.hasRecords ? (
            <button type="button" className={`btn text-sm ${m.status === "ready" ? "btn-primary" : "btn-secondary"}`} onClick={() => setMode("clear")}>
              Clear transition records
            </button>
          ) : null}
          <button type="button" className="btn btn-secondary text-sm" onClick={() => setMode("delete")}>
            Delete account
          </button>
        </div>
      )}
      {error ? (
        <p className="alert-base alert-error mt-3" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function MemberRoster({ members, emailReady, cronReady }: { members: MemberView[]; emailReady: boolean; cronReady: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<RetentionStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const counts = new Map<RetentionStatus, number>();
  for (const m of members) counts.set(m.status, (counts.get(m.status) ?? 0) + 1);
  const statuses = (Object.keys(TAGS) as RetentionStatus[]).filter((s) => counts.get(s)).sort((a, b) => TAGS[a].order - TAGS[b].order);
  const due = members.filter((m) => m.noticeDue).length;
  const q = search.trim().toLowerCase();
  const shown = members.filter((m) => (filter === "all" || m.status === filter) && (!q || `${m.name ?? ""} ${m.email ?? ""}`.toLowerCase().includes(q)));

  const done = (text: string) => {
    setMessage(text);
    router.refresh();
  };

  async function sendNow() {
    setSending(true);
    const { ok, data } = await post("/api/admin/members/send-notices");
    setSending(false);
    if (!ok || !data.ok) {
      setMessage(typeof data.error === "string" ? data.error : "The notices did not go out. Try again.");
      return;
    }
    const notSent = Array.isArray(data.notSent) ? (data.notSent as string[]) : [];
    done(`Sent ${data.sent} of ${data.due} due ${data.due === 1 ? "notice" : "notices"}.${notSent.length ? ` Not sent: ${notSent.join("; ")}` : ""}`);
  }

  return (
    <div className="flex flex-col gap-4">
      {!emailReady ? (
        <p className="alert-base alert-error" role="status">
          Email is not set up (RESEND_API_KEY and RESEND_FROM_EMAIL), so no notice can go out, and no one can reach Ready to clear.
        </p>
      ) : null}
      {!cronReady ? (
        <p className="alert-base alert-info" role="status">
          The daily notice job needs a CRON_SECRET setting in Vercel. Until then, use Send due notices now.
        </p>
      ) : null}

      <details className="rounded-lg border border-[var(--line)] p-3 text-sm">
        <summary className="cursor-pointer font-semibold">How the timeline works</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--muted)]">
          <li>Counted from a member&apos;s last use of MilVector. Under {RETENTION.quietMonths} months: Active. After that: Quiet.</li>
          <li>
            Records may be cleared {RETENTION.clearMonths} months after last use, and never earlier than {RETENTION.monthsAfterRetirement} months after the
            retirement date in their profile.
          </li>
          <li>The first email goes {RETENTION.noticeDays} days before, the final one {RETENTION.finalDays} days before. Either always gives the full time from the day it is sent.</li>
          <li>Ready to clear only after both emails. For now you approve each clear. Using MilVector again starts the clock over.</li>
          <li>Clearing keeps the account, business cards, and Community posts.</li>
        </ul>
      </details>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={`btn text-sm ${filter === "all" ? "btn-primary" : "btn-secondary"}`} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
          All ({members.length})
        </button>
        {statuses.map((s) => (
          <button key={s} type="button" className={`btn text-sm ${filter === s ? "btn-primary" : "btn-secondary"}`} aria-pressed={filter === s} onClick={() => setFilter(s)}>
            {TAGS[s].label} ({counts.get(s)})
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input className="input grow basis-[220px]" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email" aria-label="Search members" />
        <button type="button" className="btn btn-secondary shrink-0 text-sm" disabled={sending || due === 0} onClick={() => void sendNow()}>
          {sending ? "Sending…" : `Send due notices now (${due})`}
        </button>
      </div>

      {message ? (
        <p className="alert-base alert-success" aria-live="polite">
          {message}
        </p>
      ) : null}

      {shown.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{members.length ? "No member matches that." : "No members yet."}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((m) => (
            <MemberRow key={m.id} m={m} onDone={done} />
          ))}
        </ul>
      )}
    </div>
  );
}
