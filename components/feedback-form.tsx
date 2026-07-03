"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { UploadWarning } from "@/components/upload-warning";

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
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value)
  );
}

const TYPE_CONFIG = {
  general: { label: "General", icon: "💬" },
  bug: { label: "Bug Report", icon: "🐛" },
  suggestion: { label: "Suggestion", icon: "💡" },
  tool_request: { label: "Tool Request", icon: "🔧" },
} as const;

const STATUS_LABELS: Record<FeedbackRow["status"], string> = {
  new: "New",
  reviewing: "In Review",
  resolved: "Resolved",
  archived: "Archived",
};

const LAST_VIEWED_KEY = "milvector_support_last_viewed";

function TicketCard({ item, isNew }: { item: FeedbackRow; isNew: boolean }) {
  const type = TYPE_CONFIG[item.feedback_type] ?? { label: item.feedback_type, icon: "📝" };
  const isOpen = item.status === "new" || item.status === "reviewing";
  const hasResponse = !!item.admin_response;

  // Determine if the admin response is unread (newer than last-viewed timestamp)
  const [responseIsUnread, setResponseIsUnread] = useState(false);
  useEffect(() => {
    if (!hasResponse || !item.admin_response_updated_at) return;
    const lastViewed = localStorage.getItem(LAST_VIEWED_KEY);
    if (!lastViewed) { setResponseIsUnread(true); return; }
    setResponseIsUnread(new Date(item.admin_response_updated_at) > new Date(lastViewed));
  }, [hasResponse, item.admin_response_updated_at]);

  return (
    <article
      className="rounded-lg border bg-[var(--panel)] p-4 transition-colors"
      style={{
        borderColor: isOpen
          ? "color-mix(in oklab, var(--warn) 30%, var(--line) 70%)"
          : "var(--line)",
        borderLeft: isOpen ? "3px solid color-mix(in oklab, var(--warn) 60%, transparent 40%)" : undefined,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-base" aria-hidden="true">{type.icon}</span>
          <div>
            <p className="text-sm font-semibold">{type.label}</p>
            <p className="text-xs text-[var(--muted)]">{formatDate(item.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isNew && (
            <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold text-white">
              NEW
            </span>
          )}
          <span className="ticket-badge" data-status={item.status}>
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "currentColor" }}
              aria-hidden="true"
            />
            {STATUS_LABELS[item.status]}
          </span>
        </div>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--muted)]">{item.message}</p>
      {item.suggested_tool ? (
        <p className="mt-2 text-xs text-[var(--muted)]">
          Suggested tool: <span className="font-medium text-[var(--foreground)]">{item.suggested_tool}</span>
        </p>
      ) : null}

      {hasResponse ? (
        <div className={`ticket-reply mt-4 ${responseIsUnread ? "ticket-reply-new" : ""}`}>
          <div className="mb-2 flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
              MilVector Team
            </p>
            {responseIsUnread && (
              <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold text-white">
                NEW
              </span>
            )}
          </div>
          <p className="whitespace-pre-wrap text-sm text-[var(--foreground)]">{item.admin_response}</p>
          {item.admin_response_updated_at ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              {formatDate(item.admin_response_updated_at)}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-xs text-[var(--muted)]">
          Awaiting response &mdash; the MilVector team typically replies within 48 hours.
        </p>
      )}
    </article>
  );
}

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
  const [submitStatus, setSubmitStatus] = useState<string>("");
  const [submitKind, setSubmitKind] = useState<"success" | "error" | "">("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<FeedbackRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const viewedAtRef = useRef<string | null>(null);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/feedback", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setLoadingHistory(false); return; }
      setHistory((data.feedback ?? []) as FeedbackRow[]);
    } catch {
      // keep page usable if history fails
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    void loadHistory();
    // Record the current timestamp so new responses can be detected as "unread"
    const now = new Date().toISOString();
    viewedAtRef.current = now;
    // Update last-viewed after a short delay so items loaded right now show as unread
    const timer = setTimeout(() => localStorage.setItem(LAST_VIEWED_KEY, now), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    async function loadProfileDefaults() {
      try {
        const res = await fetch("/api/profile", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.profile) return;
        const profile = data.profile as Partial<FeedbackProfile>;
        setForm((c) => ({
          ...c,
          name: c.name || profile.full_name || "",
          email: c.email || profile.professional_email || "",
          branch: c.branch || profile.branch || "",
          mos: c.mos || profile.mos || "",
        }));
      } catch {
        // leave form usable even if profile fails
      }
    }
    void loadProfileDefaults();
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formElement = e.currentTarget;
    setSaving(true);
    setSubmitStatus("");
    setSubmitKind("");

    try {
      const formData = new FormData(formElement);
      const res = await fetch("/api/feedback", { method: "POST", body: formData });
      const rawText = await res.text();
      let data: { error?: unknown } = {};
      if (rawText) { try { data = JSON.parse(rawText) as { error?: unknown }; } catch { data = { error: rawText }; } }

      if (!res.ok) {
        setSubmitStatus(typeof data.error === "string" ? data.error : "Feedback submission failed.");
        setSubmitKind("error");
        return;
      }

      setSubmitStatus("Support case submitted. You'll receive a confirmation at your email, and the MilVector team will follow up within 48 hours.");
      setSubmitKind("success");
      formElement.reset();
      setForm((c) => ({ ...c, feedback_type: "general", suggested_tool: "", message: "" }));
      await loadHistory();
    } catch (error) {
      setSubmitStatus(error instanceof Error && error.message ? error.message : "Feedback submission failed.");
      setSubmitKind("error");
    } finally {
      setSaving(false);
    }
  }

  const openCases = history.filter((h) => h.status === "new" || h.status === "reviewing");
  const closedCases = history.filter((h) => h.status === "resolved" || h.status === "archived");

  return (
    <div className="space-y-6">

      {/* ── Submission Form ───────────────────────────────────────── */}
      <section className="section-card">
        <div className="mb-4">
          <h2 className="text-lg font-bold">Open a Support Case</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Submit a bug, suggestion, or platform question. Your case stays visible below so you can
            track status and review any follow-up in one place.
          </p>
        </div>

        <form className="grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
          <input
            name="name"
            className="input"
            placeholder="Name (optional)"
            value={form.name}
            onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
          />
          <input
            name="email"
            type="email"
            className="input"
            placeholder="Email for follow-up (optional)"
            value={form.email}
            onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
          />
          <input
            name="branch"
            className="input"
            placeholder="Branch"
            value={form.branch}
            onChange={(e) => setForm((c) => ({ ...c, branch: e.target.value }))}
          />
          <input
            name="mos"
            className="input"
            placeholder="MOS / Rate"
            value={form.mos}
            onChange={(e) => setForm((c) => ({ ...c, mos: e.target.value }))}
          />

          {/* Type selector */}
          <div className="md:col-span-2">
            <p className="mb-2 text-sm font-medium">Case Type</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.entries(TYPE_CONFIG) as [string, { label: string; icon: string }][]).map(([value, cfg]) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 transition-colors"
                  style={{
                    borderColor: form.feedback_type === value
                      ? "var(--accent)"
                      : "var(--line)",
                    background: form.feedback_type === value
                      ? "var(--accent-soft)"
                      : "var(--surface)",
                  }}
                >
                  <input
                    type="radio"
                    name="feedback_type"
                    value={value}
                    className="sr-only"
                    checked={form.feedback_type === value}
                    onChange={() => setForm((c) => ({ ...c, feedback_type: value }))}
                  />
                  <span aria-hidden="true">{cfg.icon}</span>
                  <span className="text-sm font-medium">{cfg.label}</span>
                </label>
              ))}
            </div>
          </div>

          {form.feedback_type === "tool_request" && (
            <input
              name="suggested_tool"
              className="input md:col-span-2"
              placeholder="What tool would you like to see?"
              value={form.suggested_tool}
              onChange={(e) => setForm((c) => ({ ...c, suggested_tool: e.target.value }))}
            />
          )}

          <textarea
            name="message"
            className="input min-h-28 md:col-span-2"
            placeholder="Describe what you were trying to do, what happened instead, and what outcome would have helped most."
            required
            minLength={10}
            value={form.message}
            onChange={(e) => setForm((c) => ({ ...c, message: e.target.value }))}
          />

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium">Screenshot or attachment (optional)</span>
            <input
              name="attachment"
              type="file"
              className="input"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt,.md,image/png,image/jpeg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
            />
            <p className="text-xs text-[var(--muted)]">
              Screenshots and supporting files make issues easier to reproduce.
            </p>
          </label>

          <div className="md:col-span-2">
            <UploadWarning />
          </div>

          <div className="md:col-span-2">
            <button className="btn btn-primary w-full sm:w-auto" type="submit" disabled={saving}>
              {saving ? "Submitting..." : "Submit Support Case"}
            </button>
          </div>

          {submitStatus ? (
            <div
              className={`md:col-span-2 rounded-md border p-3 text-sm ${
                submitKind === "error"
                  ? "border-red-400/30 bg-red-400/5 text-red-400"
                  : "border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)]"
              }`}
            >
              {submitStatus}
            </div>
          ) : null}
        </form>
      </section>

      {/* ── Case History ──────────────────────────────────────────── */}
      <section className="section-card">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Your Support Cases</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Track open cases and review MilVector follow-up responses here.
            </p>
          </div>
          <button
            className="btn btn-secondary text-sm"
            type="button"
            onClick={() => void loadHistory()}
            disabled={loadingHistory}
          >
            {loadingHistory ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {loadingHistory && (
          <p className="text-sm text-[var(--muted)]">Loading your support cases...</p>
        )}

        {!loadingHistory && history.length === 0 && (
          <div className="rounded-lg border border-dashed border-[var(--line)] p-8 text-center">
            <p className="text-sm font-medium text-[var(--muted)]">No support cases yet</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              When you open a case it appears here. The MilVector team typically responds within 48 hours.
            </p>
          </div>
        )}

        {!loadingHistory && openCases.length > 0 && (
          <div className="space-y-3">
            <p className="tool-kicker">Open Cases</p>
            {openCases.map((item) => (
              <TicketCard key={item.id} item={item} isNew={false} />
            ))}
          </div>
        )}

        {!loadingHistory && closedCases.length > 0 && (
          <details className={openCases.length > 0 ? "mt-4" : ""}>
            <summary className="cursor-pointer list-none">
              <span className="flex items-center gap-2 text-sm font-medium text-[var(--muted)]">
                <span className="tool-kicker">Closed Cases</span>
                <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-xs">
                  {closedCases.length}
                </span>
              </span>
            </summary>
            <div className="mt-3 space-y-3">
              {closedCases.map((item) => (
                <TicketCard key={item.id} item={item} isNew={false} />
              ))}
            </div>
          </details>
        )}
      </section>
    </div>
  );
}
