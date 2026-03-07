import { supabaseServer } from "@/lib/supabase/server";

export default async function MetricsPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [masterCountRes, targetedCountRes, toolRunSuccessRes, toolRunErrorRes, firstSuccessRes, firstTargetedRes] =
    await Promise.all([
      supabase
        .from("resume_artifacts")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("artifact_type", ["master_resume", "master_bullets"]),
      supabase
        .from("resume_artifacts")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("artifact_type", "targeted_resume"),
      supabase
        .from("tool_runs")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "success"),
      supabase
        .from("tool_runs")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "error"),
      supabase
        .from("tool_runs")
        .select("created_at")
        .eq("user_id", user.id)
        .eq("status", "success")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("resume_artifacts")
        .select("created_at")
        .eq("user_id", user.id)
        .eq("artifact_type", "targeted_resume")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

  const accountCreatedAt = user.created_at ? new Date(user.created_at).getTime() : null;
  const firstValueCandidates = [firstSuccessRes.data?.created_at, firstTargetedRes.data?.created_at]
    .filter(Boolean)
    .map((value) => new Date(value as string).getTime());
  const firstValueAtMs = firstValueCandidates.length ? Math.min(...firstValueCandidates) : null;
  const timeToFirstValueMinutes =
    accountCreatedAt && firstValueAtMs ? Math.round((firstValueAtMs - accountCreatedAt) / 60000) : null;
  const under10 = typeof timeToFirstValueMinutes === "number" ? timeToFirstValueMinutes <= 10 : null;

  return (
    <main className="space-y-4">
      <section className="panel p-6">
        <h1 className="text-2xl font-bold">Metrics</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          PRD KPI progress for your account.
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article className="panel p-5">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Generated Master Resume</p>
          <p className="mt-2 text-2xl font-extrabold">{(masterCountRes.count ?? 0) > 0 ? "Yes" : "No"}</p>
        </article>
        <article className="panel p-5">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Generated Targeted Resume</p>
          <p className="mt-2 text-2xl font-extrabold">{(targetedCountRes.count ?? 0) > 0 ? "Yes" : "No"}</p>
        </article>
        <article className="panel p-5">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Time To First Value</p>
          <p className="mt-2 text-2xl font-extrabold">
            {typeof timeToFirstValueMinutes === "number" ? `${timeToFirstValueMinutes} min` : "N/A"}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Under 10 min target: {under10 === null ? "N/A" : under10 ? "Yes" : "No"}
          </p>
        </article>
        <article className="panel p-5">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Master Resume Count</p>
          <p className="mt-2 text-2xl font-extrabold">{masterCountRes.count ?? 0}</p>
        </article>
        <article className="panel p-5">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Targeted Resume Count</p>
          <p className="mt-2 text-2xl font-extrabold">{targetedCountRes.count ?? 0}</p>
        </article>
        <article className="panel p-5">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Tool Runs (Success / Error)</p>
          <p className="mt-2 text-2xl font-extrabold">
            {toolRunSuccessRes.count ?? 0} / {toolRunErrorRes.count ?? 0}
          </p>
        </article>
      </section>
    </main>
  );
}
