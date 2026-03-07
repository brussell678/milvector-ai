import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

function nextStep(profileExists: boolean, hasMasterResume: boolean, hasTargetedResume: boolean) {
  if (!profileExists) return { href: "/app/profile", label: "Complete profile" };
  if (!hasMasterResume) return { href: "/app/tools/fitrep-bullets", label: "Build master resume" };
  if (!hasTargetedResume) return { href: "/app/tools/resume-targeter", label: "Create targeted resume" };
  return { href: "/app/library", label: "Review your library" };
}

export default async function DashboardPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [profileRes, artifactsRes, docsCountRes, toolRunsCountRes, toolSuccessCountRes, toolErrorCountRes] = await Promise.all([
    supabase.from("profiles").select("id").eq("id", user.id).maybeSingle(),
    supabase.from("resume_artifacts").select("artifact_type").eq("user_id", user.id),
    supabase.from("documents").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("tool_runs").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("tool_runs").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "success"),
    supabase.from("tool_runs").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "error"),
  ]);

  const artifactTypes = new Set((artifactsRes.data ?? []).map((row) => row.artifact_type));
  const hasMasterResume = artifactTypes.has("master_resume") || artifactTypes.has("master_bullets");
  const step = nextStep(!!profileRes.data, hasMasterResume, artifactTypes.has("targeted_resume"));
  const artifactRows = artifactsRes.data ?? [];
  const masterResumeCount = artifactRows.filter((x) => x.artifact_type === "master_resume").length;
  const targetedResumesCount = artifactRows.filter((x) => x.artifact_type === "targeted_resume").length;
  const documentsCount = docsCountRes.count ?? 0;
  const toolRunsCount = toolRunsCountRes.count ?? 0;
  const toolSuccessCount = toolSuccessCountRes.count ?? 0;
  const toolErrorCount = toolErrorCountRes.count ?? 0;

  return (
    <main className="space-y-4">
      <section className="panel p-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-2 text-[var(--muted)]">
          Follow the guided sequence to move from military record to targeted civilian resume.
        </p>
        <Link className="btn btn-primary mt-4 inline-flex" href={step.href}>
          Next Step: {step.label}
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article className="panel p-5">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Documents Uploaded</p>
          <p className="mt-2 text-3xl font-extrabold">{documentsCount}</p>
        </article>
        <article className="panel p-5">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Master Resumes</p>
          <p className="mt-2 text-3xl font-extrabold">{masterResumeCount}</p>
        </article>
        <article className="panel p-5">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Targeted Resumes</p>
          <p className="mt-2 text-3xl font-extrabold">{targetedResumesCount}</p>
        </article>
        <article className="panel p-5">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Tool Runs</p>
          <p className="mt-2 text-3xl font-extrabold">{toolRunsCount}</p>
        </article>
        <article className="panel p-5">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Tool Successes</p>
          <p className="mt-2 text-3xl font-extrabold text-[var(--accent)]">{toolSuccessCount}</p>
        </article>
        <article className="panel p-5">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Tool Errors</p>
          <p className="mt-2 text-3xl font-extrabold text-[#a33b3b]">{toolErrorCount}</p>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="panel p-5">
          <h2 className="font-bold">Core Workflow</h2>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-[var(--muted)]">
            <li>Complete profile</li>
            <li>Upload/extract military source documents</li>
            <li>Build master resume</li>
            <li>Paste job description</li>
            <li>Create targeted resume</li>
          </ol>
        </article>
        <article className="panel p-5">
          <h2 className="font-bold">Tools</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link className="btn btn-secondary text-sm" href="/app/tools/fitrep-bullets">Master Resume Builder</Link>
            <Link className="btn btn-secondary text-sm" href="/app/tools/mos-translator">MOS Translator</Link>
            <Link className="btn btn-secondary text-sm" href="/app/tools/jd-decoder">Job Description Decoder</Link>
            <Link className="btn btn-secondary text-sm" href="/app/tools/resume-targeter">Targeted Resume Builder</Link>
          </div>
        </article>
      </section>
    </main>
  );
}
