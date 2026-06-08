"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type BulletsOutput = {
  artifactId: string;
  bullets: { category: string; bullet: string; metrics_used: string[] }[];
  suggested_job_titles: string[];
  core_keywords: string[];
};

type MasterResumeOutput = {
  artifactId: string;
  autosavedDocumentId?: string | null;
  autosaveWarning?: string | null;
  mode: "master_resume";
  master_resume: string;
  fitrepDocsDetected?: number;
  fitrepDocsIncluded?: number;
  fitrepDocsTruncated?: boolean;
  validation_questions: string[];
  career_timeline: { role_title: string; organization: string; date_range: string }[];
};

type DocRow = {
  id: string;
  doc_type: "FITREP" | "EVAL" | "VMET" | "JST" | "MASTER_RESUME" | "RESUME_TEMPLATE" | "TARGETED_RESUME" | "LINKEDIN_PROFILE" | "OTHER";
  text_extracted: boolean;
  created_at: string;
  filename: string;
};

export default function FitrepBulletsPage() {
  const [mode, setMode] = useState<"bullets" | "master_resume">("master_resume");
  const [useUploadedDocs, setUseUploadedDocs] = useState(true);
  const [pastedText, setPastedText] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [vmetText, setVmetText] = useState("");
  const [jstText, setJstText] = useState("");
  const [fitrepsText, setFitrepsText] = useState("");
  const [result, setResult] = useState<BulletsOutput | MasterResumeOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  async function loadDocs() {
    setDocsLoading(true);
    try {
      const res = await fetch("/api/documents", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setDocs(data.documents ?? []);
    } finally {
      setDocsLoading(false);
    }
  }

  useEffect(() => {
    if (mode === "master_resume" && useUploadedDocs) void loadDocs();
  }, [mode, useUploadedDocs]);

  const sourceSummary = useMemo(() => {
    const extracted = docs.filter((d) => d.text_extracted);
    const hasVmet = extracted.some((d) => d.doc_type === "VMET");
    const hasJst = extracted.some((d) => d.doc_type === "JST");
    const linkedinCount = extracted.filter((d) => d.doc_type === "LINKEDIN_PROFILE").length;
    const fitrepCount = extracted.filter((d) => d.doc_type === "FITREP" || d.doc_type === "EVAL").length;
    return { hasVmet, hasJst, linkedinCount, fitrepCount };
  }, [docs]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    setResult(null);

    const optionalText = (value: string) => {
      const trimmed = value.trim();
      return trimmed ? trimmed : undefined;
    };

    const payload =
      mode === "master_resume"
        ? useUploadedDocs
          ? {
              mode,
              targetRole: targetRole || null,
            }
          : {
              mode,
              targetRole: targetRole || null,
              vmetText: optionalText(vmetText),
              jstText: optionalText(jstText),
              fitrepsText: optionalText(fitrepsText),
            }
        : {
            mode,
            targetRole: targetRole || null,
            pastedText,
          };

    try {
      const res = await fetch("/api/tools/fitrep-bullets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Request failed");
        return;
      }
      setResult(data as BulletsOutput | MasterResumeOutput);
      if (mode === "master_resume") {
        const warning = typeof data.autosaveWarning === "string" ? data.autosaveWarning : null;
        setNotice(
          warning
            ? `Master resume generated and saved to Documents. ${warning}`
            : "Master resume generated and saved to Documents."
        );
      } else {
        setNotice("Master bullets generated and saved to your account.");
      }
    } catch {
      setError("Network error while running FITREP pipeline.");
    } finally {
      setLoading(false);
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

  return (
    <main className="page-shell">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">MASTER RESUME</p>
            <h1 className="page-title">Build the career foundation every downstream tool depends on.</h1>
            <p className="page-description">
              Pull from available service records, FITREPs, EVALs, LinkedIn drafts, and source documents to generate the master resume that powers targeting, interview prep, and future application work.
            </p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">BEST INPUTS</p>
            <ul className="page-hero-list">
              <li>Extracted FITREPs and EVALs</li>
              <li>JST, VMET, and LinkedIn profile documents</li>
              <li>Updated target role if you have one</li>
            </ul>
          </aside>
        </div>
        <section className="mt-6 rounded-md border border-[var(--line)] bg-[var(--accent-soft)] p-4">
          <p className="text-sm font-semibold text-[var(--accent)]">Start With Source Documents</p>
          <p className="mt-1 text-sm text-[var(--foreground)]">
            Upload and extract available source records in Documents before generating a master resume. FITREPs/EVALs are the strongest accomplishment source; VMET, JST, and LinkedIn profile documents improve context when available.
          </p>
          <a className="btn btn-secondary mt-3 w-full text-sm sm:w-auto" href="/app/documents">
            Open Documents
          </a>
          <p className="mt-3 text-sm text-[var(--foreground)]">
            This tool generates a starting-point master resume, not a final version. Improve it now and save the refined copy in Documents so every downstream tool starts from a stronger source.
          </p>
        </section>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
        <section className="space-y-4">
          <section className="section-card p-6">
            <form className="space-y-4" onSubmit={onSubmit}>
              <div>
                <p className="section-title">Inputs</p>
                <p className="section-description">
                  Use uploaded documents when possible. VMET, JST, LinkedIn profile documents, FITREPs, and EVALs all help, but the tool can run from whichever source records are available.
                </p>
              </div>

              <label className="block space-y-1">
                <span className="text-sm font-medium">Mode</span>
                <select className="input" value={mode} onChange={(e) => setMode(e.target.value as "bullets" | "master_resume")}>
                  <option value="master_resume">Master Resume</option>
                  <option value="bullets">Legacy Bullets Only</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-sm font-medium">Target Role (optional)</span>
                <input className="input" value={targetRole} onChange={(e) => setTargetRole(e.target.value)} />
              </label>

              {mode === "master_resume" ? (
                <>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={useUploadedDocs}
                      onChange={(e) => setUseUploadedDocs(e.target.checked)}
                    />
                    Build from uploaded documents (recommended)
                  </label>

                  {useUploadedDocs ? (
                    <section className="subtle-panel p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold">Source Readiness</p>
                        <button className="btn btn-secondary text-sm" type="button" onClick={loadDocs} disabled={docsLoading}>
                          {docsLoading ? "Refreshing..." : "Refresh"}
                        </button>
                      </div>
                      <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
                        <li>VMET extracted: {sourceSummary.hasVmet ? "Yes" : "No"}</li>
                        <li>JST extracted: {sourceSummary.hasJst ? "Yes" : "No"}</li>
                        <li>LinkedIn profile documents extracted: {sourceSummary.linkedinCount}</li>
                        <li>FITREP/EVAL extracted count: {sourceSummary.fitrepCount}</li>
                      </ul>
                      <p className="mt-2 text-xs text-[var(--muted)]">
                        Upload and extract additional records on the Documents page when you have them. Missing sources become validation questions instead of blocking generation.
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        If extracted text exceeds model limits, the system will prioritize the most recent source material.
                      </p>
                    </section>
                  ) : (
                    <div className="space-y-3">
                      <label className="block space-y-1">
                        <span className="text-sm font-medium">1) VMET Text (optional)</span>
                        <textarea
                          className="input min-h-40"
                          value={vmetText}
                          onChange={(e) => setVmetText(e.target.value)}
                          placeholder="Paste VMET (DD2586) text first"
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-sm font-medium">2) JST Text (optional)</span>
                        <textarea
                          className="input min-h-40"
                          value={jstText}
                          onChange={(e) => setJstText(e.target.value)}
                          placeholder="Paste JST text second"
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-sm font-medium">3) Observed FITREP/EVAL Text (recommended)</span>
                        <textarea
                          className="input min-h-56"
                          value={fitrepsText}
                          onChange={(e) => setFitrepsText(e.target.value)}
                          placeholder="Paste all observed FITREP text in chronological order"
                        />
                      </label>
                      <p className="text-xs text-[var(--muted)]">
                        Provide at least one substantive source. FITREPs/EVALs produce the strongest accomplishment evidence; VMET, JST, and LinkedIn profile documents add context when available.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <label className="block space-y-1">
                  <span className="text-sm font-medium">FITREP/EVAL Text</span>
                  <textarea
                    className="input min-h-56"
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Paste extracted text here"
                    required
                  />
                </label>
              )}

              <button className="btn btn-primary w-full sm:w-auto" disabled={loading} type="submit">
                {loading ? "Running..." : mode === "master_resume" ? "Generate Master Resume" : "Generate Master Bullets"}
              </button>
            </form>
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

          {result && "master_resume" in result && (
            <section className="section-card space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <p className="text-sm font-semibold text-[var(--accent)]">Artifact ID: {result.artifactId}</p>
                <button className="btn btn-secondary text-sm" type="button" onClick={() => void copyText("Master resume", result.master_resume)}>
                  Copy Resume
                </button>
                <a className="btn btn-secondary text-sm" href={`/api/resume-artifacts/${result.artifactId}/download?format=docx`}>
                  Export Word (.docx)
                </a>
                <a className="btn btn-secondary text-sm" href={`/api/resume-artifacts/${result.artifactId}/download`}>
                  Export Text (.txt)
                </a>
              </div>
              <div>
                <p className="section-title">Generated Master Resume</p>
                <p className="section-description">Review this draft, refine it, and keep your best version current in Documents.</p>
              </div>
              {typeof result.fitrepDocsDetected === "number" && typeof result.fitrepDocsIncluded === "number" && (
                <p className="text-sm text-[var(--muted)]">
                  FITREP/EVAL sources included: {result.fitrepDocsIncluded} of {result.fitrepDocsDetected}
                  {result.fitrepDocsTruncated ? " (truncated by input budget)" : ""}
                </p>
              )}
              <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm leading-6 text-[var(--foreground)]">
                {result.master_resume}
              </pre>
              {result.validation_questions?.length > 0 && (
                <div>
                  <h3 className="font-semibold">Validation Questions</h3>
                  <ul className="mt-2 list-disc pl-5 text-sm">
                    {result.validation_questions.map((q, idx) => (
                      <li key={`${q}-${idx}`}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {result && "bullets" in result && (
            <section className="section-card space-y-3">
              <p className="text-sm font-semibold text-[var(--accent)]">Artifact ID: {result.artifactId}</p>
              <div>
                <p className="section-title">Generated Bullets</p>
                <p className="section-description">Use these as a starting point, then refine tone and evidence before reuse.</p>
              </div>
              <button
                className="btn btn-secondary text-sm"
                type="button"
                onClick={() => void copyText("Bullets", result.bullets.map((b) => b.bullet).join("\n"))}
              >
                Copy Bullets
              </button>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {result.bullets.map((b, idx) => (
                  <li key={`${b.category}-${idx}`}>{b.bullet}</li>
                ))}
              </ul>
              <p className="text-sm">
                <span className="font-semibold">Suggested roles:</span> {result.suggested_job_titles.join(", ")}
              </p>
              <p className="text-sm">
                <span className="font-semibold">Keywords:</span> {result.core_keywords.join(", ")}
              </p>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
