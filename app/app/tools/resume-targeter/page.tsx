"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LoadingBlock } from "@/components/tools/loading-block";
import { Term } from "@/components/ui/term";
import { ToolAlert } from "@/components/tools/tool-alert";
import { ActionBar } from "@/components/tools/action-bar";

// ─── Types ────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────

type StageState = "pending" | "active" | "complete";

function OutputList({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
        {title}
      </p>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, idx) => (
          <li key={`${title}-${idx}`} className="flex gap-2 text-sm">
            <span
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
              aria-hidden="true"
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function KeywordChips({ keywords }: { keywords?: string[] }) {
  if (!keywords?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {keywords.map((kw) => (
        <span
          key={kw}
          className="rounded-full border border-[color-mix(in_oklab,var(--accent)_35%,var(--line)_65%)] bg-[color-mix(in_oklab,var(--accent-soft)_60%,var(--surface)_40%)] px-2.5 py-0.5 text-xs font-medium text-[var(--accent)]"
        >
          {kw}
        </span>
      ))}
    </div>
  );
}

// ─── Decision config ──────────────────────────────────────────────────

const DECISIONS = [
  {
    value: "A" as const,
    label: "Go",
    sub: "Generate targeted, ATS-optimized resume",
    activeClass:
      "border-[color-mix(in_oklab,var(--accent)_60%,transparent)] bg-[var(--accent-soft)]",
  },
  {
    value: "B" as const,
    label: "Revise",
    sub: "Adjust assumptions or inputs before generating",
    activeClass: "border-amber-400/50 bg-amber-400/5",
  },
  {
    value: "C" as const,
    label: "Stop",
    sub: "Do not apply for this role right now",
    activeClass: "border-red-400/50 bg-red-400/5",
  },
];

// ─── Inner page (uses useSearchParams) ────────────────────────────────

function ResumeTargeterContent() {
  const searchParams = useSearchParams();

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

  // ── URL param pre-fill ─────────────────────────────────────────────
  useEffect(() => {
    const titleParam = searchParams.get("title");
    if (titleParam) setJobTitle(decodeURIComponent(titleParam));

    const jdParam = searchParams.get("jd");
    if (jdParam) {
      fetch(`/api/tool-runs/${jdParam}`)
        .then((r) => r.json())
        .then((data: { output_json?: Record<string, unknown> }) => {
          const text = data.output_json?._jdText;
          if (typeof text === "string" && text) {
            setJobDescriptionText(text);
          }
        })
        .catch(() => {});
    }
  }, [searchParams]);

  // ── Source loading ─────────────────────────────────────────────────
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
              label: `${artifact.title} (${new Date(artifact.created_at).toLocaleDateString()}) — Saved master resume`,
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
              label: `${doc.filename} (${new Date(doc.created_at).toLocaleDateString()})${doc.text_extracted ? "" : " — not ready yet"} — Uploaded master resume`,
            }))
          );
        }
        setMasterResumeOptions(nextOptions);
        if (nextOptions.length > 0) {
          setMasterResumeSelection((current) => current || nextOptions[0].value);
        }
      } catch {
        // silent — manual paste path still works
      }
    }
    void loadSources();
  }, []);

  // ── Derived ────────────────────────────────────────────────────────
  const recommendedDecision = stage2?.recommended_decision ?? null;

  const selectedMasterResume = useMemo(
    () => masterResumeOptions.find((o) => o.value === masterResumeSelection) ?? null,
    [masterResumeOptions, masterResumeSelection]
  );

  const stageBarStages = useMemo(
    () =>
      [
        { label: "Title Research", state: (stage1 ? "complete" : "active") as StageState },
        {
          label: "Posting Analysis",
          state: (stage2 ? "complete" : stage1 ? "active" : "pending") as StageState,
        },
        {
          label: "Checkpoint",
          state: (stage3 ? "complete" : stage2 ? "active" : "pending") as StageState,
        },
        {
          label: "Generate",
          state: (stage3 ? "complete" : "pending") as StageState,
        },
      ],
    [stage1, stage2, stage3]
  );

  // ── Handlers ──────────────────────────────────────────────────────
  function buildSourcePayload() {
    return {
      masterResumeArtifactId:
        selectedMasterResume?.sourceType === "artifact" ? selectedMasterResume.id : undefined,
      masterResumeDocumentId:
        selectedMasterResume?.sourceType === "document" ? selectedMasterResume.id : undefined,
      pastedResumeText: pastedResumeText || undefined,
    };
  }

  async function runStage1(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setActiveTask("Running Step 1: Title Research…");
    setError(null);
    setNotice(null);
    setStage1(null);
    try {
      const res = await fetch("/api/tools/resume-targeter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowStage: "title_research", jobTitle }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Step 1 failed");
        return;
      }
      setStage1(data as Stage1Output);
      setNotice(
        "Step 1 complete — role research done. Review it below, then fill in the posting and run Step 2."
      );
    } catch {
      setError("That didn't go through. Check your connection and try again — your inputs are still here.");
    } finally {
      setLoading(false);
      setActiveTask(null);
    }
  }

  async function runStage2() {
    setLoading(true);
    setActiveTask("Running Step 2: Posting Analysis…");
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
        setError(data.error ?? "Step 2 failed");
        return;
      }
      const output = data as Stage2Output;
      setStage2(output);
      if (output.recommended_decision) setDecision(output.recommended_decision);
      setNotice(
        output.recommended_decision === "C"
          ? "Analysis recommends Stop (C). Review the gaps on the right, then choose your path."
          : "Step 2 complete — review the analysis on the right, then choose A / B / C below."
      );
    } catch {
      setError("That didn't go through. Check your connection and rerun Step 2 — your inputs are still here.");
    } finally {
      setLoading(false);
      setActiveTask(null);
    }
  }

  async function runGenerate() {
    if (decision === "B") {
      setNotice("Revise your inputs or assumptions, then rerun Step 2 before generating.");
      return;
    }
    if (decision === "C") {
      setNotice("Stop selected — resume generation is not recommended for this role right now.");
      return;
    }
    setLoading(true);
    setActiveTask("Running Step 4: Generating Targeted Resume…");
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
      setNotice("Targeted resume generated. Review every claim before submitting.");
    } catch {
      setError("That didn't go through. Check your connection and try again — your decision and inputs are still here.");
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

  // ─── JSX ──────────────────────────────────────────────────────────

  return (
    <main className="page-shell">

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker-pill">TARGETED RESUME BUILDER</p>
            <h1 className="page-title">
              Build a resume aimed at one real job{" "}
              <span className="gradient-text">— with a go / no-go check first.</span>
            </h1>
            <p className="page-description">
              Research the job title, see how your resume stacks up against the posting, decide
              go or no-go, then build the targeted resume — in that order, every time.
            </p>
          </div>
          <aside className="page-hero-aside relative z-10">
            <p className="page-hero-aside-title">YOU&apos;LL NEED</p>
            <ul className="page-hero-list">
              <li>The job title you&apos;re going after</li>
              <li>Your master resume (saved or pasted)</li>
              <li>The full job posting, copied</li>
              <li>A saved profile, so your contact info lands on the resume</li>
            </ul>
          </aside>
        </div>
        <div className="hero-trust-strip -mx-7 -mb-7 mt-6">
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {[
              "Title Research",
              "Gap Analysis",
              "Go / No-Go Checkpoint",
              "ATS-Optimized Draft",
            ].map((label) => (
              <div key={label} className="hero-trust-item">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "#39a67f" }}
                  aria-hidden="true"
                />
                <span
                  className="text-sm font-medium"
                  style={{ color: "rgba(255,255,255,0.65)" }}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stage bar ─────────────────────────────────────────────── */}
      <div className="tool-stage-bar" role="list" aria-label="Workflow stages">
        {stageBarStages.map((stage, idx) => (
          <div
            key={stage.label}
            className="tool-stage-step"
            data-state={stage.state}
            role="listitem"
            aria-current={stage.state === "active" ? "step" : undefined}
          >
            <span className="tool-stage-num" aria-hidden>
              {stage.state === "complete" ? "✓" : idx + 1}
            </span>
            <span className="hidden sm:inline">{stage.label}</span>
          </div>
        ))}
      </div>

      {/* ── Tool layout ────────────────────────────────────────────── */}
      <div className="tool-shell">

        {/* ── INPUT PANEL ────────────────────────────────────────── */}
        <div className="tool-input-panel">

          {/* Step 1: Title Research */}
          <section className="tool-section">
            <div>
              <p className="tool-kicker">STEP 1</p>
              <p className="section-title mt-0.5">Job Title Research</p>
              <p className="section-description">
                Enter the exact title from the posting. The AI profiles the role before you paste
                the full JD.
              </p>
            </div>

            <form className="flex gap-2" onSubmit={runStage1}>
              <input
                className="input flex-1"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Operations Manager, Sr. Program Analyst"
                required
              />
              <button className="btn btn-primary shrink-0" type="submit" disabled={loading}>
                Run Step 1
              </button>
            </form>

            {/* Inline Stage 1 output — collapsible */}
            {stage1 && !loading && (
              <details className="rounded-xl border border-[var(--line)] bg-[var(--surface)]">
                <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium">
                  <span className="flex items-center gap-2">
                    <span
                      className="tool-badge tool-badge-success"
                      style={{ fontSize: "0.65rem" }}
                    >
                      DONE
                    </span>
                    Title Research — {jobTitle}
                  </span>
                  <span className="text-[var(--muted)]" aria-hidden="true">
                    ▾
                  </span>
                </summary>
                <div className="flex flex-col gap-3 border-t border-[var(--line)] px-4 py-4">
                  <p className="text-sm leading-relaxed">{stage1.role_summary}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                        Market Outlook
                      </p>
                      <p className="text-sm">{stage1.market_outlook}</p>
                    </div>
                    {stage1.compensation_signal && (
                      <div>
                        <p className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                          Comp Signal
                        </p>
                        <p className="text-sm">{stage1.compensation_signal}</p>
                      </div>
                    )}
                  </div>
                  <OutputList title="Expected Hard Skills" items={stage1.typical_hard_skills} />
                  <OutputList title="Expected Soft Skills" items={stage1.typical_soft_skills} />
                  <OutputList title="Employer Pain Points" items={stage1.employer_pain_points} />
                </div>
              </details>
            )}
          </section>

          {/* Step 2: Posting Analysis */}
          <section className="tool-section">
            <div>
              <p className="tool-kicker">STEP 2</p>
              <p className="section-title mt-0.5">Posting Analysis</p>
              <p className="section-description">
                Align your master resume against the specific posting. Run Step 1 first for better
                analysis.
              </p>
            </div>

            <label className="block space-y-1">
              <span className="text-sm font-medium">Master Resume</span>
              <select
                className="input"
                value={masterResumeSelection}
                onChange={(e) => setMasterResumeSelection(e.target.value)}
              >
                <option value="">Select a master resume</option>
                {masterResumeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-sm font-medium">
                Pasted Resume{" "}
                <span className="font-normal text-[var(--muted)]">
                  (optional if source selected)
                </span>
              </span>
              <textarea
                className="input min-h-28"
                value={pastedResumeText}
                onChange={(e) => setPastedResumeText(e.target.value)}
                placeholder="Paste your master resume text here if not using a saved source…"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm font-medium">
                Company{" "}
                <span className="font-normal text-[var(--muted)]">(optional but recommended)</span>
              </span>
              <input
                className="input"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Lockheed Martin, Deloitte, CACI"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm font-medium">Full Job Posting Text</span>
              <textarea
                className="input min-h-52"
                value={jobDescriptionText}
                onChange={(e) => setJobDescriptionText(e.target.value)}
                placeholder="Paste the complete job posting — responsibilities, requirements, and any company context…"
              />
            </label>

            <button
              className="btn btn-primary w-full sm:w-auto"
              type="button"
              onClick={runStage2}
              disabled={loading}
            >
              Run Step 2
            </button>
          </section>

          {/* Step 3: Decision Checkpoint — only after Stage 2 */}
          {stage2 && (
            <section className="tool-section">
              <div>
                <p className="tool-kicker">STEP 3 — CHECKPOINT</p>
                <p className="section-title mt-0.5">Your Decision</p>
                <p className="section-description">
                  Review the analysis on the right, then choose your path.
                  {recommendedDecision && (
                    <span className="ml-1 font-medium text-[var(--foreground)]">
                      AI recommends:{" "}
                      <span
                        className={`font-bold ${
                          recommendedDecision === "A"
                            ? "text-[var(--accent)]"
                            : recommendedDecision === "B"
                            ? "text-amber-500"
                            : "text-red-500"
                        }`}
                      >
                        {recommendedDecision}
                      </span>
                      .
                    </span>
                  )}
                </p>
              </div>

              {/* 3-button decision cards */}
              <div className="grid gap-2 sm:grid-cols-3">
                {DECISIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDecision(d.value)}
                    className={`flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors ${
                      decision === d.value
                        ? d.activeClass
                        : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--accent)]/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-base">{d.value}</span>
                      {recommendedDecision === d.value && (
                        <span
                          className="tool-badge tool-badge-success shrink-0"
                          style={{ fontSize: "0.6rem" }}
                        >
                          REC
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold leading-tight">{d.label}</p>
                    <p className="text-xs text-[var(--muted)] leading-snug">{d.sub}</p>
                  </button>
                ))}
              </div>

              <button
                className={`btn w-full sm:w-auto ${
                  decision === "A" ? "btn-primary" : "btn-secondary"
                }`}
                type="button"
                onClick={runGenerate}
                disabled={loading}
              >
                {decision === "A"
                  ? "Step 4: Generate Targeted Resume →"
                  : decision === "B"
                  ? "Revise First — Then Rerun Step 2"
                  : "Stop — Do Not Generate"}
              </button>

              {decision !== "A" && (
                <ToolAlert
                  variant={decision === "B" ? "warn" : "stop"}
                  title={decision === "B" ? "Revise before generating" : "Stop recommended"}
                >
                  <p className="text-sm">
                    {decision === "B"
                      ? "Update your inputs or assumptions and rerun Step 2 before generating."
                      : "This role is not recommended based on the current analysis. Select A to override."}
                  </p>
                </ToolAlert>
              )}
            </section>
          )}
        </div>

        {/* ── OUTPUT PANEL ───────────────────────────────────────── */}
        <div className="tool-output-panel">

          {/* Loading */}
          {loading && (
            <LoadingBlock
              task={activeTask ?? "Processing…"}
              detail={
                activeTask?.includes("1")
                  ? "Profiling the role for market signals, skills, and KPIs. Usually 10–20 seconds."
                  : activeTask?.includes("2")
                  ? "Aligning your resume against the posting. Usually 20–35 seconds."
                  : "Generating your targeted draft. Usually 30–60 seconds."
              }
            />
          )}

          {/* Error */}
          {!loading && error && (
            <ToolAlert variant="error" title="Something went wrong">
              <p className="text-sm">{error}</p>
            </ToolAlert>
          )}

          {/* Notice */}
          {!loading && notice && (
            <ToolAlert variant="info">
              <p className="text-sm">{notice}</p>
            </ToolAlert>
          )}

          {/* Copy feedback */}
          {!loading && copyState && (
            <ToolAlert variant="info">
              <p className="text-sm">{copyState}</p>
            </ToolAlert>
          )}

          {/* ── Stage 2 analysis ─────────────────────────────────── */}
          {!loading && stage2 && (
            <div className="tool-output-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="tool-kicker">STEP 2 — ANALYSIS</p>
                  <p className="section-title mt-0.5">Posting Analysis</p>
                </div>
                {recommendedDecision && (
                  <span
                    className={`tool-badge shrink-0 mt-1 ${
                      recommendedDecision === "A"
                        ? "tool-badge-success"
                        : recommendedDecision === "B"
                        ? "tool-badge-warn"
                        : "tool-badge-error"
                    }`}
                  >
                    Rec: {recommendedDecision}
                  </span>
                )}
              </div>

              {/* Decision rationale */}
              {stage2.decision_rationale && (
                <ToolAlert
                  variant={
                    recommendedDecision === "C"
                      ? "stop"
                      : recommendedDecision === "B"
                      ? "warn"
                      : "info"
                  }
                  title="AI Recommendation"
                >
                  <p className="text-sm">{stage2.decision_rationale}</p>
                </ToolAlert>
              )}

              <OutputList title="Alignment Strengths" items={stage2.alignment_strengths} />

              {stage2.hard_gaps?.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                    Hard Gaps
                  </p>
                  {stage2.hard_gaps.map((gap, idx) => (
                    <ToolAlert key={idx} variant="warn">
                      <p className="text-sm">{gap}</p>
                    </ToolAlert>
                  ))}
                </div>
              )}

              <OutputList title="Hard Requirements" items={stage2.hard_requirements} />
              <OutputList title="Soft Requirements" items={stage2.soft_requirements} />
              <OutputList title="Implied Expectations" items={stage2.implied_expectations} />

              {stage2.advisory_notes?.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                    Advisory Notes
                  </p>
                  {stage2.advisory_notes.map((note, idx) => (
                    <ToolAlert key={idx} variant="info">
                      <p className="text-sm">{note}</p>
                    </ToolAlert>
                  ))}
                </div>
              )}

              {stage2.ats_keywords_priority && stage2.ats_keywords_priority.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                    <Term k="ats">ATS</Term> <Term k="keywords">Keywords</Term> — Priority
                  </p>
                  <KeywordChips keywords={stage2.ats_keywords_priority} />
                </div>
              )}
            </div>
          )}

          {/* ── Stage 3 resume ───────────────────────────────────── */}
          {!loading && stage3 && (
            <div className="tool-output-card">
              <div>
                <p className="tool-kicker">STEP 4 — OUTPUT</p>
                <p className="section-title mt-0.5">Targeted Resume Draft</p>
                <p className="section-description">
                  AI-generated draft. Review every claim and edit wording before submitting.
                </p>
              </div>

              <pre className="tool-resume-preview">{stage3.targeted_resume}</pre>

              {/* Keywords added */}
              {stage3.keywords_added?.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                    Keywords Added
                  </p>
                  <KeywordChips keywords={stage3.keywords_added} />
                </div>
              )}

              {/* Changes made — collapsible */}
              {stage3.changes_made?.length > 0 && (
                <details className="rounded-xl border border-[var(--line)]">
                  <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 text-sm font-medium">
                    <span>Changes Made</span>
                    <span
                      className="tool-badge tool-badge-success"
                      style={{ fontSize: "0.65rem" }}
                    >
                      {stage3.changes_made.length}
                    </span>
                  </summary>
                  <ul className="flex flex-col gap-1.5 border-t border-[var(--line)] px-4 py-4">
                    {stage3.changes_made.map((change, idx) => (
                      <li key={idx} className="flex gap-2 text-sm">
                        <span
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
                          aria-hidden="true"
                        />
                        {change}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {/* ATS alignment notes — collapsible */}
              {stage3.ats_alignment_notes?.length > 0 && (
                <details className="rounded-xl border border-[var(--line)]">
                  <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
                    <Term k="ats">ATS</Term> Alignment Notes
                  </summary>
                  <ul className="flex flex-col gap-1.5 border-t border-[var(--line)] px-4 py-4">
                    {stage3.ats_alignment_notes.map((note, idx) => (
                      <li key={idx} className="flex gap-2 text-sm">
                        <span
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
                          aria-hidden="true"
                        />
                        {note}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <ActionBar>
                <button
                  className="btn btn-secondary text-sm"
                  type="button"
                  onClick={() => void copyText("Resume", stage3.targeted_resume)}
                >
                  Copy Resume
                </button>
                <a
                  className="btn btn-secondary text-sm"
                  href={`/api/resume-artifacts/${stage3.artifactId}/download`}
                >
                  Export Text (.txt)
                </a>
                <a
                  className="btn btn-secondary text-sm"
                  href={`/api/resume-artifacts/${stage3.artifactId}/download?format=docx`}
                >
                  Export Word (.docx)
                </a>
                {stage3.documentId && (
                  <a
                    className="btn btn-secondary text-sm"
                    href={`/api/documents/${stage3.documentId}/download`}
                  >
                    Download Saved (.docx)
                  </a>
                )}
              </ActionBar>
            </div>
          )}

          {/* Empty state */}
          {!loading && !stage2 && !stage3 && !error && !notice && (
            <div className="tool-empty">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-[var(--line)]"
                aria-hidden="true"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <p className="font-medium">Analysis will appear here</p>
              <p className="text-sm">
                Run Step 1 with a job title, then Step 2 once you have the full posting. You&apos;ll get a read like this before anything gets built:
              </p>
              <div className="tool-example">
                <p className="tool-example-kicker">Example</p>
                <p className="mt-2 text-sm font-bold text-[var(--foreground)]">Fit check: Project Coordinator</p>
                <ul className="mt-1.5 space-y-1 text-xs text-[var(--muted)]">
                  <li>• Strong: team leadership, scheduling, working under pressure</li>
                  <li>• Gap: no civilian project software on the resume yet</li>
                  <li>• Call: Go — highlight your maintenance planning as project work</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ─── Page export — Suspense boundary for useSearchParams ──────────────

export default function ResumeTargeterPage() {
  return (
    <Suspense fallback={<div className="page-shell" />}>
      <ResumeTargeterContent />
    </Suspense>
  );
}
