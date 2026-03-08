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
  doc_type: "MASTER_RESUME" | "RESUME_TEMPLATE";
  filename: string;
  created_at: string;
  text_extracted: boolean;
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
  if (!items || items.length === 0) return <p className="text-sm text-[var(--muted)]">None listed.</p>;
  return (
    <ul className="list-disc pl-5 text-sm space-y-1">
      {items.map((item, idx) => (
        <li key={`${item}-${idx}`}>{item}</li>
      ))}
    </ul>
  );
}

export default function ResumeTargeterPage() {
  const [masterResumeArtifactId, setMasterResumeArtifactId] = useState("");
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [masterResumeDocumentId, setMasterResumeDocumentId] = useState("");
  const [masterResumeDocs, setMasterResumeDocs] = useState<MasterResumeDocument[]>([]);
  const [resumeTemplateDocumentId, setResumeTemplateDocumentId] = useState("");
  const [templateDocs, setTemplateDocs] = useState<MasterResumeDocument[]>([]);
  const [pastedResumeText, setPastedResumeText] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescriptionText, setJobDescriptionText] = useState("");
  const [stage1, setStage1] = useState<Stage1Output | null>(null);
  const [stage2, setStage2] = useState<Stage2Output | null>(null);
  const [stage3, setStage3] = useState<Stage3Output | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
        if (artifactRes.ok) {
          const rows = (artifactData.artifacts ?? []) as Artifact[];
          setArtifacts(rows);
          if (rows.length > 0) setMasterResumeArtifactId((v) => v || rows[0].id);
        }
        if (docsRes.ok) {
          const docs = (docsData.documents ?? []) as MasterResumeDocument[];
          const masterDocs = docs.filter((d) => d.doc_type === "MASTER_RESUME");
          const tmplDocs = docs.filter((d) => d.doc_type === "RESUME_TEMPLATE");
          setMasterResumeDocs(masterDocs);
          setTemplateDocs(tmplDocs);
          if (masterDocs.length > 0) setMasterResumeDocumentId((v) => v || masterDocs[0].id);
          if (tmplDocs.length > 0) setResumeTemplateDocumentId((v) => v || tmplDocs[0].id);
        }
      } catch {
        // Keep manual path.
      }
    }
    void loadSources();
  }, []);

  const recommendedDecision = useMemo(() => stage2?.recommended_decision ?? null, [stage2]);

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
          masterResumeArtifactId: masterResumeArtifactId || undefined,
          masterResumeDocumentId: masterResumeDocumentId || undefined,
          resumeTemplateDocumentId: resumeTemplateDocumentId || undefined,
          pastedResumeText: pastedResumeText || undefined,
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
      if (decision === "B") setNotice("Adjust assumptions/inputs, then rerun analysis before generating.");
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
          masterResumeArtifactId: masterResumeArtifactId || undefined,
          masterResumeDocumentId: masterResumeDocumentId || undefined,
          resumeTemplateDocumentId: resumeTemplateDocumentId || undefined,
          pastedResumeText: pastedResumeText || undefined,
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
      setNotice("Targeted resume generated and saved to Library.");
    } catch {
      setError("Network error during targeted resume generation.");
    } finally {
      setLoading(false);
      setActiveTask(null);
    }
  }

  const checkpointClass =
    recommendedDecision === "C"
      ? "panel border-[#d69f9f] bg-[#fff1f1] p-4 text-sm text-red-700"
      : "panel p-4 text-sm";

  return (
    <main className="space-y-4">
      <section className="panel p-6">
        <h1 className="text-2xl font-bold">Targeted Resume Builder</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Step-driven workflow with deeper analysis and explicit go/no-go checkpoint.
        </p>
        <section className="mt-4 rounded-md border border-[var(--line)] bg-[var(--accent-soft)] p-4">
          <p className="text-sm font-semibold text-[var(--accent)]">Tool Notice</p>
          <p className="mt-1 text-sm text-[var(--foreground)]">
            This tool generates a targeted draft, not a final application resume. Review and edit wording, ensure each
            claim is accurate, and tailor details before submitting. Save your finalized version to Documents so it can
            be reused for future applications.
          </p>
        </section>
      </section>

      {loading && (
        <section className="panel border-[var(--accent)] p-4">
          <p className="text-sm font-semibold text-[var(--accent)]">{activeTask ?? "Running request..."}</p>
          <p className="text-xs text-[var(--muted)] mt-1">
            AI processing is in progress. Please wait and avoid clicking the run buttons again.
          </p>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="space-y-4">
          <section className="panel p-6 space-y-4">
            <h2 className="font-bold">Inputs</h2>
            <form className="grid gap-3 md:grid-cols-3" onSubmit={runStage1}>
              <input className="input md:col-span-2" placeholder="Job title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} required />
              <button className="btn btn-primary" type="submit" disabled={loading}>Run Step 1</button>
            </form>
            <label className="space-y-1 block">
              <span className="text-sm font-medium">Master Resume Artifact</span>
              <select className="input" value={masterResumeArtifactId} onChange={(e) => setMasterResumeArtifactId(e.target.value)}>
                <option value="">Select saved master resume artifact</option>
                {artifacts.map((artifact) => (
                  <option key={artifact.id} value={artifact.id}>
                    {artifact.title} ({new Date(artifact.created_at).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 block">
              <span className="text-sm font-medium">Uploaded Master Resume Document (optional)</span>
              <select className="input" value={masterResumeDocumentId} onChange={(e) => setMasterResumeDocumentId(e.target.value)}>
                <option value="">Select uploaded MASTER_RESUME document</option>
                {masterResumeDocs.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.filename} ({new Date(doc.created_at).toLocaleDateString()}) {doc.text_extracted ? "" : "- not extracted"}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 block">
              <span className="text-sm font-medium">Resume Template Document (optional)</span>
              <select className="input" value={resumeTemplateDocumentId} onChange={(e) => setResumeTemplateDocumentId(e.target.value)}>
                <option value="">Select uploaded RESUME_TEMPLATE document</option>
                {templateDocs.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.filename} ({new Date(doc.created_at).toLocaleDateString()}) {doc.text_extracted ? "" : "- not extracted"}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 block">
              <span className="text-sm font-medium">Pasted Master Resume (optional if source selected)</span>
              <textarea className="input min-h-32" value={pastedResumeText} onChange={(e) => setPastedResumeText(e.target.value)} />
            </label>
            <label className="space-y-1 block">
              <span className="text-sm font-medium">Company (optional)</span>
              <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} />
            </label>
            <label className="space-y-1 block">
              <span className="text-sm font-medium">Full Job Posting Text</span>
              <textarea className="input min-h-56" value={jobDescriptionText} onChange={(e) => setJobDescriptionText(e.target.value)} required />
            </label>
            <button className="btn btn-primary" type="button" onClick={runStage2} disabled={loading}>Run Step 2</button>

            <section className="panel p-4 space-y-3">
              <h3 className="font-bold">Step 3: Decision Checkpoint</h3>
              <select className="input" value={decision} onChange={(e) => setDecision(e.target.value as "A" | "B" | "C")}>
                <option value="A">A) Generate targeted, ATS-optimized resume</option>
                <option value="B">B) Adjust assumptions before generating</option>
                <option value="C">C) Stop / do not apply now</option>
              </select>
              <button className="btn btn-primary" type="button" onClick={runGenerate} disabled={loading}>
                {loading ? "Running..." : "Step 4: Generate Resume (A only)"}
              </button>
            </section>
          </section>
        </section>

        <section className="space-y-4 xl:sticky xl:top-20 self-start">
          {(error || notice) && (
            <section className="panel p-4">
              {error && <p className="text-sm text-red-700">{error}</p>}
              {notice && <p className="text-sm text-[var(--accent)]">{notice}</p>}
            </section>
          )}

          {stage2 && (
            <section className={checkpointClass}>
              <p>
                <span className="font-semibold">Checkpoint:</span>{" "}
                {recommendedDecision ?? stage2.decision_checkpoint}
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
            <section className="panel p-6 space-y-3">
              <h3 className="font-bold">Step 1 Output</h3>
              <p className="text-sm">{stage1.role_summary}</p>
              <p className="text-sm"><span className="font-semibold">Market outlook:</span> {stage1.market_outlook}</p>
              {stage1.compensation_signal && <p className="text-sm"><span className="font-semibold">Comp signal:</span> {stage1.compensation_signal}</p>}
              <p className="text-sm font-semibold">Hard skills</p>
              {renderList(stage1.typical_hard_skills)}
              <p className="text-sm font-semibold">Soft skills</p>
              {renderList(stage1.typical_soft_skills)}
              <p className="text-sm font-semibold">Employer pain points</p>
              {renderList(stage1.employer_pain_points)}
            </section>
          )}

          {stage2 && (
            <section className="panel p-6 space-y-3">
              <h3 className="font-bold">Step 2 Output</h3>
              <p className="text-sm"><span className="font-semibold">Company context:</span> {stage2.company_context_summary}</p>
              <p className="text-sm font-semibold">Top must-have signals</p>
              {renderList(stage2.top_must_have_signals)}
              <p className="text-sm font-semibold">ATS keyword priority</p>
              {renderList(stage2.ats_keywords_priority)}
              <p className="text-sm font-semibold">Alignment strengths</p>
              {renderList(stage2.alignment_strengths)}
              <p className="text-sm font-semibold">Hard gaps</p>
              {renderList(stage2.hard_gaps)}
              <p className="text-sm font-semibold">Soft gaps</p>
              {renderList(stage2.soft_gaps)}
              <p className="text-sm font-semibold">Advisory notes</p>
              {renderList(stage2.advisory_notes)}
            </section>
          )}

          {stage3 && (
            <section className="panel p-6 space-y-3">
              <p className="text-sm font-semibold text-[var(--accent)]">Artifact ID: {stage3.artifactId}</p>
              <h3 className="font-bold">Targeted Resume</h3>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-[#f5f8f6] p-3 text-sm">{stage3.targeted_resume}</pre>
              <p className="text-sm"><span className="font-semibold">Keywords added:</span> {stage3.keywords_added.join(", ")}</p>
              <p className="text-sm"><span className="font-semibold">Changes made:</span> {stage3.changes_made.join(", ")}</p>
              {stage3.targeting_critique && <p className="text-sm"><span className="font-semibold">Targeting critique:</span> {stage3.targeting_critique}</p>}
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
