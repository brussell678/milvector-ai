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
  doc_type: "FITREP" | "EVAL" | "VMET" | "JST" | "OTHER";
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
    if (mode === "master_resume" && useUploadedDocs) loadDocs();
  }, [mode, useUploadedDocs]);

  const sourceSummary = useMemo(() => {
    const extracted = docs.filter((d) => d.text_extracted);
    const hasVmet = extracted.some((d) => d.doc_type === "VMET");
    const hasJst = extracted.some((d) => d.doc_type === "JST");
    const fitrepCount = extracted.filter((d) => d.doc_type === "FITREP" || d.doc_type === "EVAL").length;
    return { hasVmet, hasJst, fitrepCount };
  }, [docs]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    setResult(null);

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
              vmetText,
              jstText,
              fitrepsText,
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
            ? `Master resume generated and saved to Library. ${warning}`
            : "Master resume generated and saved to Library + Documents."
        );
      } else {
        setNotice("Master bullets generated and saved to Library.");
      }
    } catch {
      setError("Network error while running FITREP pipeline.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="space-y-4">
      <section className="panel p-6">
        <h1 className="text-2xl font-bold">Master Resume Builder</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Build directly from uploaded documents, then export a Word draft for edits.
        </p>
        <section className="mt-4 rounded-md border border-[var(--line)] bg-[var(--accent-soft)] p-4">
          <p className="text-sm font-semibold text-[var(--accent)]">Tool Notice</p>
          <p className="mt-1 text-sm text-[var(--foreground)]">
            This tool generates a starting-point master resume, not a final version. Download the output and add detail,
            corrections, and context where needed. Your master resume becomes the base input for targeted resumes, so
            improving it now will improve every downstream result. The generated draft is auto-saved to Documents; after
            finalizing your edits, upload the revised version to Documents so your latest version is used by other tools.
          </p>
        </section>
      </section>

      <section className="panel p-6">
        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="space-y-1 block">
            <span className="text-sm font-medium">Mode</span>
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value as "bullets" | "master_resume")}>
              <option value="master_resume">Master Resume</option>
              <option value="bullets">Legacy Bullets Only</option>
            </select>
          </label>

          <label className="space-y-1 block">
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
                <section className="panel p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">Source Readiness</p>
                    <button className="btn btn-secondary text-sm" type="button" onClick={loadDocs} disabled={docsLoading}>
                      {docsLoading ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                  <ul className="mt-2 text-sm text-[var(--muted)] space-y-1">
                    <li>VMET extracted: {sourceSummary.hasVmet ? "Yes" : "No"}</li>
                    <li>JST extracted: {sourceSummary.hasJst ? "Yes" : "No"}</li>
                    <li>FITREP/EVAL extracted count: {sourceSummary.fitrepCount}</li>
                  </ul>
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    Upload and extract documents on the Documents page if any are missing.
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    There is no hard FITREP count cap. If your extracted text exceeds model limits, the system will include as many reports
                    as possible and prioritize the most recent.
                  </p>
                </section>
              ) : (
                <>
                  <label className="space-y-1 block">
                    <span className="text-sm font-medium">1) VMET Text</span>
                    <textarea
                      className="input min-h-40"
                      value={vmetText}
                      onChange={(e) => setVmetText(e.target.value)}
                      placeholder="Paste VMET (DD2586) text first"
                      required
                    />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-sm font-medium">2) JST Text</span>
                    <textarea
                      className="input min-h-40"
                      value={jstText}
                      onChange={(e) => setJstText(e.target.value)}
                      placeholder="Paste JST text second"
                      required
                    />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-sm font-medium">3) Observed FITREP Text (Chronological)</span>
                    <textarea
                      className="input min-h-56"
                      value={fitrepsText}
                      onChange={(e) => setFitrepsText(e.target.value)}
                      placeholder="Paste all observed FITREP text in chronological order"
                      required
                    />
                  </label>
                </>
              )}
            </>
          ) : (
            <label className="space-y-1 block">
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

          <button className="btn btn-primary" disabled={loading} type="submit">
            {loading ? "Running..." : mode === "master_resume" ? "Generate Master Resume" : "Generate Master Bullets"}
          </button>
        </form>
      </section>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {notice && <p className="text-sm text-[var(--accent)]">{notice}</p>}

      {result && "master_resume" in result && (
        <section className="panel p-6 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold text-[var(--accent)]">Artifact ID: {result.artifactId}</p>
            <a className="btn btn-secondary text-sm" href={`/api/resume-artifacts/${result.artifactId}/download?format=docx`}>
              Export Word (.docx)
            </a>
            <a className="btn btn-secondary text-sm" href={`/api/resume-artifacts/${result.artifactId}/download`}>
              Export Text (.txt)
            </a>
          </div>
          <h2 className="font-bold">Generated Master Resume</h2>
          {typeof result.fitrepDocsDetected === "number" && typeof result.fitrepDocsIncluded === "number" && (
            <p className="text-sm text-[var(--muted)]">
              FITREP/EVAL sources included: {result.fitrepDocsIncluded} of {result.fitrepDocsDetected}
              {result.fitrepDocsTruncated ? " (truncated by input budget)" : ""}
            </p>
          )}
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--foreground)]">
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
        <section className="panel p-6 space-y-3">
          <p className="text-sm font-semibold text-[var(--accent)]">Artifact ID: {result.artifactId}</p>
          <h2 className="text-lg font-bold">Bullets</h2>
          <ul className="list-disc pl-5 text-sm space-y-1">
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
    </main>
  );
}
