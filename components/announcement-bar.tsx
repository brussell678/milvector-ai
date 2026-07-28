"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export type AnnouncementUpdate = {
  id: string;
  title: string;
  category: "new" | "improvement" | "fix" | string;
  is_user_requested: boolean;
  published_at: string;
};

const DISMISS_KEY = "milvector_update_dismissed";

const CATEGORY_LABEL: Record<string, string> = {
  new: "New",
  improvement: "Improved",
  fix: "Fixed",
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}

export function AnnouncementBar({ update }: { update: AnnouncementUpdate | null }) {
  // Start hidden so the server/client markup matches; reveal after the
  // dismissal check runs on the client.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!update) return;
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed !== update.id) setVisible(true);
  }, [update]);

  if (!update || !visible) return null;

  const categoryLabel = CATEGORY_LABEL[update.category] ?? "Update";

  function dismiss() {
    if (update) localStorage.setItem(DISMISS_KEY, update.id);
    setVisible(false);
  }

  return (
    <div className="mb-4 rounded-xl border border-[color-mix(in_oklab,var(--accent)_45%,var(--line)_55%)] bg-[color-mix(in_oklab,var(--accent-soft)_55%,var(--panel)_45%)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="tool-badge tool-badge-success shrink-0" style={{ fontSize: "0.62rem" }}>
          {categoryLabel}
        </span>
        {update.is_user_requested && (
          <span
            className="shrink-0 rounded-full border border-[var(--accent)] px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-[var(--accent)]"
            title="This shipped because a user asked for it."
          >
            Requested by a user
          </span>
        )}
        <p className="min-w-0 flex-1 text-sm font-semibold leading-snug">{update.title}</p>
        <span className="shrink-0 text-xs text-[var(--muted)]">{formatDate(update.published_at)}</span>
        <div className="flex shrink-0 items-center gap-3">
          <Link href="/app/whats-new" className="text-xs font-semibold text-[var(--accent)] hover:underline">
            What&apos;s New →
          </Link>
          <Link
            href="/app/feedback"
            className="text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:underline"
          >
            Have an idea?
          </Link>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss update"
            className="text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
