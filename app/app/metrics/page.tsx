import { supabaseServer } from "@/lib/supabase/server";

export default async function MetricsPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [documentsRes, profileRes, artifactsRes, toolSuccessRes, toolErrorRes, toolRunsRes, feedbackRes, notificationsRes] = await Promise.all([
    supabase.from("documents").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("profiles").select("created_at,updated_at,eas_date,separation_date").eq("id", user.id).maybeSingle(),
    supabase.from("resume_artifacts").select("artifact_type,created_at").eq("user_id", user.id),
    supabase.from("tool_runs").select("created_at", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "success"),
    supabase.from("tool_runs").select("created_at", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "error"),
    supabase.from("tool_runs").select("created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("feedback").select("status", { count: "exact" }).eq("user_id", user.id).in("status", ["new", "reviewing"]),
    supabase.from("message_board_notifications").select("*", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
  ]);

  const documentsCount = documentsRes.count ?? 0;
  const artifactRows = artifactsRes.data ?? [];
  const masterResumeCount = artifactRows.filter((row) => row.artifact_type === "master_resume").length;
  const targetedResumeCount = artifactRows.filter((row) => row.artifact_type === "targeted_resume").length;
  const toolSuccessCount = toolSuccessRes.count ?? 0;
  const toolErrorCount = toolErrorRes.count ?? 0;
  const totalRuns = toolSuccessCount + toolErrorCount;
  const successRate = totalRuns > 0 ? Math.round((toolSuccessCount / totalRuns) * 100) : null;
  const unreadNotifications = notificationsRes.count ?? 0;
  const openSupportCases = feedbackRes.count ?? 0;
  const recentToolRuns = toolRunsRes.data ?? [];
  const latestActivity = recentToolRuns[0]?.created_at ?? profileRes.data?.updated_at ?? profileRes.data?.created_at ?? null;

  const firstArtifactAt =
    artifactRows
      .map((row) => row.created_at)
      .filter(Boolean)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;

  const accountCreatedAt = user.created_at ? new Date(user.created_at).getTime() : null;
  const firstValueAt = firstArtifactAt ? new Date(firstArtifactAt).getTime() : null;
  const timeToFirstValueMinutes =
    accountCreatedAt && firstValueAt ? Math.max(0, Math.round((firstValueAt - accountCreatedAt) / 60000)) : null;

  return (
    <main className="page-shell">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">INSIGHTS</p>
            <h1 className="page-title">See how your MilVector workspace is progressing, not just what is stored.</h1>
            <p className="page-description">
              Use this page to understand workflow momentum, output volume, support load, and how reliably your integrated tools are performing over time.
            </p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">AT A GLANCE</p>
            <ul className="page-hero-list">
              <li>{successRate === null ? "No tool-run data yet" : `${successRate}% workflow success rate`}</li>
              <li>{openSupportCases} open support case{openSupportCases === 1 ? "" : "s"}</li>
              <li>{unreadNotifications} unread community notification{unreadNotifications === 1 ? "" : "s"}</li>
              <li>{latestActivity ? `Latest activity ${new Date(latestActivity).toLocaleDateString()}` : "No recent activity yet"}</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="stat-card">
          <p className="stat-label">Documents Saved</p>
          <p className="stat-value">{documentsCount}</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Master Resumes</p>
          <p className="stat-value">{masterResumeCount}</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Targeted Resumes</p>
          <p className="stat-value">{targetedResumeCount}</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Tool Success Rate</p>
          <p className="stat-value">{successRate === null ? "N/A" : `${successRate}%`}</p>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr,0.95fr]">
        <section className="section-card">
          <h2 className="section-title">Workflow Signals</h2>
          <p className="section-description">A more useful read on momentum than simple totals alone.</p>
          <div className="mt-4 grid gap-3">
            <article className="subtle-panel p-4">
              <p className="stat-label">Time To First Saved Output</p>
              <p className="mt-3 text-2xl font-extrabold">{timeToFirstValueMinutes === null ? "Not yet recorded" : `${timeToFirstValueMinutes} min`}</p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                {timeToFirstValueMinutes === null
                  ? "Create and save your first output to establish a baseline."
                  : timeToFirstValueMinutes <= 10
                    ? "You reached saved value quickly."
                    : "There may be room to simplify the path to first usable output."}
              </p>
            </article>
            <article className="subtle-panel p-4">
              <p className="stat-label">Support Load</p>
              <p className="mt-3 text-2xl font-extrabold">{openSupportCases}</p>
              <p className="mt-2 text-sm text-[var(--muted)]">Open support cases are tracked directly in your workspace so issues do not disappear after submission.</p>
            </article>
            <article className="subtle-panel p-4">
              <p className="stat-label">Tool Reliability</p>
              <p className="mt-3 text-2xl font-extrabold">{toolErrorCount}</p>
              <p className="mt-2 text-sm text-[var(--muted)]">Errors to review across integrated tools. A low number here helps the platform feel dependable.</p>
            </article>
          </div>
        </section>

        <section className="section-card">
          <h2 className="section-title">Recent Tool Activity</h2>
          <p className="section-description">The most recent integrated workflow runs tied to your account.</p>
          <div className="mt-4 space-y-3">
            {recentToolRuns.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No recent integrated tool activity yet.</p>
            ) : (
              recentToolRuns.map((run, index) => (
                <article key={`${run.created_at}-${index}`} className="subtle-panel p-4">
                  <p className="text-sm font-semibold">Workflow activity recorded</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{new Date(run.created_at).toLocaleString()}</p>
                </article>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
