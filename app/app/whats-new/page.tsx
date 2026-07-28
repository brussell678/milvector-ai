import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

type UpdateRow = {
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

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }).format(new Date(iso));
}

export default async function WhatsNewPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("product_updates")
    .select("id,title,body,category,is_user_requested,published_at")
    .eq("published", true)
    .order("published_at", { ascending: false })
    .limit(100);

  const updates = (data ?? []) as UpdateRow[];
  const latest = updates[0];

  return (
    <main className="page-shell">
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker-pill">WHAT&apos;S NEW</p>
            <h1 className="page-title">
              Built in the open,{" "}
              <span className="gradient-text">shaped by your feedback.</span>
            </h1>
            <p className="page-description">
              Every change we ship to MilVector, dated and in plain terms. A lot of it comes straight from what
              users tell us — if something would help your transition, say so and it may end up here.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/app/feedback" className="btn btn-primary text-sm">
                Send an idea or issue
              </Link>
              <Link href="/app/tools" className="btn btn-hero-ghost text-sm">
                Back to tools
              </Link>
            </div>
            {latest && (
              <p className="mt-4 text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
                Last update: {formatDate(latest.published_at)}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="tool-section">
        {updates.length === 0 ? (
          <div className="tool-empty">
            <p className="font-medium">No updates posted yet</p>
            <p className="text-sm">Check back soon — or send us an idea to help shape what comes next.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {updates.map((update) => (
              <article key={update.id} className="subtle-panel flex flex-col gap-2 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tool-badge tool-badge-success" style={{ fontSize: "0.62rem" }}>
                    {CATEGORY_LABEL[update.category] ?? "Update"}
                  </span>
                  {update.is_user_requested && (
                    <span className="rounded-full border border-[var(--accent)] px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-[var(--accent)]">
                      Requested by a user
                    </span>
                  )}
                  <span className="ml-auto text-xs text-[var(--muted)]">{formatDate(update.published_at)}</span>
                </div>
                <h2 className="text-base font-bold leading-tight">{update.title}</h2>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--muted)]">{update.body}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
