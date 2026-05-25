"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Artifact = {
  id: string;
  title: string;
  artifact_type: string;
  created_at: string;
};

type MasterResumeDocument = {
  id: string;
  doc_type: "MASTER_RESUME";
  filename: string;
  created_at: string;
  text_extracted: boolean;
};

type MasterResumeOption = {
  value: string;
  label: string;
  sourceType: "artifact" | "document";
  id: string;
};

type Stage1Output = {
  workflowStage: "title_research";
  role_summary: string;
  market_outlook: string;
  role_archetypes?: string[];
  seniority_signals?: string[];
  typical_kpis?: string[];
  tooling_stack?: string[];
  compensation_signal?: string;
  typical_hard_skills: string[];
  typical_soft_skills: string[];
  employer_pain_points: string[];
  risk_indicators: string[];
  next_prompt: string;
};

type Stage2Output = {
  workflowStage: "posting_analysis";
  hard_requirements: string[];
  soft_requirements: string[];
  implied_expectations: string[];
  ats_keywords_priority?: string[];
  top_must_have_signals?: string[];
  company_context_summary: string;
  alignment_strengths: string[];
  hard_gaps: string[];
  soft_gaps: string[];
  advisory_notes: string[];
  recommended_decision?: "A" | "B" | "C";
  decision_rationale?: string;
  decision_checkpoint: string;
};

type Stage3Output = {
  artifactId: string;
  documentId?: string;
  fileName?: string;
  workflowStage: "generate_resume";
  targeted_resume: string;
  keywords_added: string[];
  changes_made: string[];
  ats_alignment_notes: string[];
  targeting_critique?: string;
  suggested_improvements?: string[];
  next_prompt?: string;
};

function renderList(items?: string[]) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-[var(--muted)]">None listed.</p>;
  }

  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((item, idx) => (
        <li key={`${item}-${idx}`}>{item}</li>
      ))}
    </ul>
  );
}

export default function ResumeTargeterPage() {
  const [masterResumeSelection, setMasterResumeSelection] = useState("");
  const [masterResumeOptions, setMasterResumeOptions] = useState<MasterResumeOption[]>([]);
  const [pastedResumeText, setPastedResumeText] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescriptionText, setJobDescriptionText] = useState("");
  const [stage1, setStage1] = useState<Stage1Output | null>(null);
  const [stage2, setStage2] = useState<Stage2Output | null>(null);
  const [stage3, setStage3] = useState<Stage3Output | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTask, setActiveTask] = useState<string | null>(null);
  const [decision, setDecision] = useState<"A" | "B" | "C">("A");

  useEffect(() => {
    async function loadSources() {
      try {
        const [artifactRes, docsRes] = await Promise.all([
          fetch("/api/resume-artifacts?type=master_resume"),
          fetch("/api/documents"),
        ]);
        const artifactData = await artifactRes.json().catch(() => ({}));
        const docsData = await docsRes.json().catch(() => ({}));
        const nextOptions: MasterResumeOption[] = [];

        if (artifactRes.ok) {
          const rows = (artifactData.artifacts ?? []) as Artifact[];
          nextOptions.push(
            ...rows.map((artifact) => ({
              value: `artifact:${artifact.id}`,
              id: artifact.id,
              sourceType: "artifact" as const,
              label: `${artifact.title} (${new Date(artifact.created_at).toLocaleDateString()}) - Saved master resume`,
            }))
          );
        }

        if (docsRes.ok) {
          const docs = (docsData.documents ?? []) as MasterResumeDocument[];
          const masterDocs = docs.filter((d) => d.doc_type === "MASTER_RESUME");
          nextOptions.push(
            ...masterDocs.map((doc) => ({
              value: `document:${doc.id}`,
              id: doc.id,
              sourceType: "document" as const,
              label: `${doc.filename} (${new Date(doc.created_at).toLocaleDateString()})${doc.text_extracted ? "" : " - not extracted"} - Uploaded master resume`,
            }))
          );
        }

        setMasterResumeOptions(nextOptions);
        if (nextOptions.length > 0) {
          setMasterResumeSelection((current) => current || nextOptions[0].value);
        }
      } catch {
        // Keep manual path.
      }
    }

    void loadSources();
  }, []);

  const recommendedDecision = useMemo(() => stage2?.recommended_decision ?? null, [stage2]);
  const selectedMasterResume = useMemo(
    () => masterResumeOptions.find((option) => option.value === masterResumeSelection) ?? null,
    [masterResumeOptions, masterResumeSelection]
  );

  function buildSourcePayload() {
    return {
      masterResumeArtifactId: selectedMasterResume?.sourceType === "artifact" ? selectedMasterResume.id : undefined,
      masterResumeDocumentId: selectedMasterResume?.sourceType === "document" ? selectedMasterResume.id : undefined,
      pastedResumeText: pastedResumeText || undefined,
    };
  }

  async function runStage1(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setActiveTask("Running Step 1: Job Title Research...");
    setError(null);
    setNotice(null);
    setStage1(null);
    try {
      const res = await fetch("/api/tools/resume-targeter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowStage: "title_research",
          jobTitle,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Stage 1 failed");
        return;
      }
      setStage1(data as Stage1Output);
      setNotice("Step 1 complete. Proceed to job posting analysis.");
    } catch {
      setError("Network error during title research.");
    } finally {
      setLoading(false);
      setActiveTask(null);
    }
  }

  async function runStage2() {
    setLoading(true);
    setActiveTask("Running Step 2: Posting + Resume Alignment...");
    setError(null);
    setNotice(null);
    setStage2(null);
    try {
      const res = await fetch("/api/tools/resume-targeter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowStage: "posting_analysis",
          jobTitle,
          company: company || null,
          jobDescriptionText,
          ...buildSourcePayload(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Stage 2 failed");
        return;
      }
      const output = data as Stage2Output;
      setStage2(output);
      if (output.recommended_decision) {
        setDecision(output.recommended_decision);
      }
      if (output.recommended_decision === "C") {
        setNotice("Checkpoint recommends C (do not apply / stop). Resume generation is not recommended.");
      } else {
        setNotice("Step 2 complete. Choose A/B/C at checkpoint.");
      }
    } catch {
      setError("Network error during posting analysis.");
    } finally {
      setLoading(false);
      setActiveTask(null);
    }
  }

  async function runGenerate() {
    if (decision !== "A") {
      if (decision === "B") setNotice("Adjust assumptions or inputs, then rerun analysis before generating.");
      if (decision === "C") setNotice("Recommended: do not apply for this role right now.");
      return;
    }

    setLoading(true);
    setActiveTask("Running Step 4: Generating Targeted Resume...");
    setError(null);
    setNotice(null);
    setStage3(null);
    try {
      const res = await fetch("/api/tools/resume-targeter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowStage: "generate_resume",
          userConfirmedGenerate: true,
          jobTitle,
          company: company || null,
          jobDescriptionText,
          ...buildSourcePayload(),
          stage1Context: stage1 ?? undefined,
          stage2Context: stage2 ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Generation failed");
        return;
      }
      setStage3(data as Stage3Output);
      setNotice("Targeted resume generated, saved to Documents, and rendered as a Word document.");
    } catch {
      setError("Network error during targeted resume generation.");
    } finally {
      setLoading(false);
      setActiveTask(null);
    }
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState(`${label} copied`);
    } catch {
      setCopyState(`Could not copy ${label.toLowerCase()}`);
    }
    window.setTimeout(() => setCopyState(null), 1500);
  }

  const checkpointClass =
    recommendedDecision === "C"
      ? "section-card border-[#d69f9f] bg-[#fff1f1] text-sm text-red-700"
      : "section-card text-sm";

  return (
    <main className="page-shell">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">TARGETED RESUME</p>
            <h1 className="page-title">Build a job-targeted application with checkpoints before you commit.</h1>
            <p className="page-description">
              Move through title research, posting analysis, and a go or no-go checkpoint before generating a targeted resume draft.
            </p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">REQUIREMENTS</p>
            <ul className="page-hero-list">
              <li>Saved master resume</li>
              <li>Completed and saved profile</li>
              <li>Full job posting text</li>
            </ul>
          </aside>
        </div>
        <section className="mt-6 rounded-md border border-[var(--line)] bg-[var(--accent-soft)] p-4">
          <p className="text-sm font-semibold text-[var(--accent)]">Tool Notice</p>
          <p className="mt-1 text-sm text-[var(--foreground)]">
            This tool generates a targeted draft, not a final application resume. Review every claim, edit wording for the role,
            and confirm the output before submitting. Manage and download the finalized Word file from Documents.
          </p>
        </section>
      </section>

      {loading && (
        <section className="section-card border-[var(--accent)]">
          <p className="text-sm font-semibold text-[var(--accent)]">{activeTask ?? "Running request..."}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            AI processing is in progress. Please wait and avoid clicking the run buttons again.
          </p>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <section className="space-y-4">
          <section className="section-card space-y-4">
            <div>
              <p className="section-title">Inputs</p>
              <p className="section-description">
                Run the workflow in order so the final resume is informed by title research, posting analysis, and your checkpoint decision.
              </p>
            </div>

            <form className="grid gap-3 md:grid-cols-3" onSubmit={runStage1}>
              <input className="input md:col-span-2" placeholder="Specific job title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} required />
              <button className="btn btn-primary w-full" type="submit" disabled={loading}>
                Run Step 1
              </button>
            </form>

            <label className="block space-y-1">
              <span className="text-sm font-medium">Master Resume</span>
              <select className="input" value={masterResumeSelection} onChange={(e) => setMasterResumeSelection(e.target.value)}>
                <option value="">Select a master resume</option>
                {masterResumeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-sm font-medium">Pasted Master Resume (optional if source selected)</span>
              <textarea className="input min-h-32" value={pastedResumeText} onChange={(e) => setPastedResumeText(e.target.value)} />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-sm font-medium">Company (optional)</span>
                <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} />
              </label>
              <div className="subtle-panel flex flex-col justify-center p-4 text-sm text-[var(--muted)]">
                Include the company when possible so the output can account for context, tone, and likely priorities.
              </div>
            </div>

            <label className="block space-y-1">
              <span className="text-sm font-medium">Full Job Posting Text</span>
              <textarea className="input min-h-56" value={jobDescriptionText} onChange={(e) => setJobDescriptionText(e.target.value)} required />
            </label>

            <button className="btn btn-primary w-full sm:w-auto" type="button" onClick={runStage2} disabled={loading}>
              Run Step 2
            </button>

            <section className="subtle-panel space-y-3 p-4">
              <div>
                <p className="section-title">Step 3: Decision Checkpoint</p>
                <p className="section-description">
                  Use the checkpoint to decide whether to generate now, revise inputs, or stop before spending time on a poor-fit role.
                </p>
              </div>
              <select className="input" value={decision} onChange={(e) => setDecision(e.target.value as "A" | "B" | "C")}>
                <option value="A">A) Generate targeted, ATS-optimized resume</option>
                <option value="B">B) Adjust assumptions before generating</option>
                <option value="C">C) Stop / do not apply now</option>
              </select>
              <button className="btn btn-primary w-full sm:w-auto" type="button" onClick={runGenerate} disabled={loading}>
                {loading ? "Running..." : "Step 4: Generate Resume (A only)"}
              </button>
            </section>
          </section>
        </section>

        <section className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          {(error || notice || copyState) && (
            <section className="section-card">
              {error && <p className="text-sm text-red-700">{error}</p>}
              {notice && <p className="text-sm text-[var(--accent)]">{notice}</p>}
              {copyState && <p className="text-sm text-[var(--accent)]">{copyState}</p>}
            </section>
          )}

          {stage2 && (
            <section className={checkpointClass}>
              <p>
                <span className="font-semibold">Checkpoint:</span> {recommendedDecision ?? stage2.decision_checkpoint}
              </p>
              {stage2.decision_rationale && (
                <p className="mt-1">
                  <span className="font-semibold">Rationale:</span> {stage2.decision_rationale}
                </p>
              )}
              {recommendedDecision === "C" && (
                <p className="mt-2 font-semibold">Recommendation: Do not build a resume for this job right now.</p>
              )}
            </section>
          )}

          {stage1 && (
            <section className="section-card space-y-3">
              <div>
                <p className="section-title">Step 1 Output</p>
                <p className="section-description">Role framing, expected signals, and baseline market context.</p>
              </div>
              <p className="text-sm">{stage1.role_summary}</p>
              <p className="text-sm">
                <span className="font-semibold">Market outlook:</span> {stage1.market_outlook}
              </p>
              <p className="text-sm">
                <span className="font-semibold">Comp signal:</span> {stage1.compensation_signal ?? "Not provided."}
              </p>
              <div>
                <p className="text-sm font-semibold">Hard skills</p>
                {renderList(stage1.typical_hard_skills)}
              </div>
              <div>
                <p className="text-sm font-semibold">Soft skills</p>
                {renderList(stage1.typical_soft_skills)}
              </div>
            </section>
          )}

          {stage2 && (
            <section className="section-card space-y-3">
              <div>
                <p className="section-title">Step 2 Output</p>
                <p className="section-description">What the posting actually demands and where your base resume aligns or needs work.</p>
              </div>
              <div>
                <p className="text-sm font-semibold">Hard requirements</p>
                {renderList(stage2.hard_requirements)}
              </div>
              <div>
                <p className="text-sm font-semibold">Alignment strengths</p>
                {renderList(stage2.alignment_strengths)}
              </div>
              <div>
                <p className="text-sm font-semibold">Hard gaps</p>
                {renderList(stage2.hard_gaps)}
              </div>
            </section>
          )}

          {stage3 && (
            <section className="section-card space-y-3">
              <div>
                <p className="section-title">Step 4 Output</p>
                <p className="section-description">Preview the generated draft, then download the saved Word file from Documents.</p>
              </div>
              <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm leading-6">{stage3.targeted_resume}</pre>
              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap">
                <button className="btn btn-secondary text-sm" type="button" onClick={() => void copyText("Targeted resume", stage3.targeted_resume)}>
                  Copy Resume
                </button>
                <a className="btn btn-secondary text-sm" href={`/api/resume-artifacts/${stage3.artifactId}/download`}>
                  Export Text (.txt)
                </a>
                <a className="btn btn-secondary text-sm" href={`/api/resume-artifacts/${stage3.artifactId}/download?format=docx`}>
                  Export Word (.docx)
                </a>
                {stage3.documentId && (
                  <a className="btn btn-secondary text-sm" href={`/api/documents/${stage3.documentId}/download`}>
                    Download Saved Word (.docx)
                  </a>
                )}
              </div>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
