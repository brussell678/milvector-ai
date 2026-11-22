import type { ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

// The What's New feed, shared by the public page (/whats-new) and the member
// page (/app/whats-new). Published rows are readable by anyone (0027 policy
// product_updates_read_published), so the public page needs no sign-in.

export type UpdateRow = {
  id: string;
  title: string;
  body: string;
  category: "new" | "improvement" | "fix" | string;
  is_user_requested: boolean;
  published_at: string;
};

const CATEGORY_LABEL: Record<string, string> = {
  new: "New",
  improvement: "Improved",
  fix: "Fixed",
};

export function formatUpdateDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }).format(new Date(iso));
}

export async function loadPublishedUpdates(supabase: SupabaseClient): Promise<UpdateRow[]> {
  const { data } = await supabase
    .from("product_updates")
    .select("id,title,body,category,is_user_requested,published_at")
    .eq("published", true)
    .order("published_at", { ascending: false })
    .limit(100);
  return (data ?? []) as UpdateRow[];
}

/** insert: shown after the entry at insertAfter (0-based), for a call to action partway down. */
export function WhatsNewFeed({ updates, insert, insertAfter = 2 }: { updates: UpdateRow[]; insert?: ReactNode; insertAfter?: number }) {
  if (updates.length === 0) {
    return (
      <div className="tool-empty">
        <p className="font-medium">No updates posted yet</p>
        <p className="text-sm">Check back soon, or send an idea to help shape what comes next.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {updates.map((update, i) => (
        <div key={update.id} className="contents">
          <article className="subtle-panel flex flex-col gap-2 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="tool-badge tool-badge-success" style={{ fontSize: "0.62rem" }}>
                {CATEGORY_LABEL[update.category] ?? "Update"}
              </span>
              {update.is_user_requested && (
                <span className="rounded-full border border-[var(--accent)] px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-[var(--accent)]">
                  Requested by a user
                </span>
              )}
              <span className="ml-auto text-xs text-[var(--muted)]">{formatUpdateDate(update.published_at)}</span>
            </div>
            <h2 className="text-base font-bold leading-tight">{update.title}</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--muted)]">{update.body}</p>
          </article>
          {insert && i === insertAfter && updates.length > insertAfter + 1 ? insert : null}
        </div>
      ))}
    </div>
  );
}
