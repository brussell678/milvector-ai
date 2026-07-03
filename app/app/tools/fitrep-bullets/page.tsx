"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LoadingBlock } from "@/components/tools/loading-block";
import { ToolAlert } from "@/components/tools/tool-alert";
import { ActionBar } from "@/components/tools/action-bar";

// ─── Types ────────────────────────────────────────────────────────────

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
  doc_type:
    | "FITREP"
    | "EVAL"
    | "VMET"
    | "JST"
    | "MASTER_RESUME"
    | "RESUME_TEMPLATE"
    | "TARGETED_RESUME"
    | "LINKEDIN_PROFILE"
    | "OTHER";
  text_extracted: boolean;
  created_at: string;
  filename: string;
};

// ─── Page ─────────────────────────────────────────────────────────────

function FitrepBulletsContent() {

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

  // Pre-fill ?role= param — linked from MOS Translator
  const searchParams = useSearchParams();
  useEffect(() => {
    const roleParam = searchParams.get("role");
    if (roleParam) setTargetRole(decodeURIComponent(roleParam));
    // intentionally empty deps: only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sourceSummary = useMemo(() => {
    const extracted = docs.filter((d) => d.text_extracted);
    const hasVmet = extracted.some((d) => d.doc_type === "VMET");
    const hasJst = extracted.some((d) => d.doc_type === "JST");
    const linkedinCount = extracted.filter((d) => d.doc_type === "LINKEDIN_PROFILE").length;
    const fitrepCount = extracted.filter((d) => d.doc_type === "FITREP" || d.doc_type === "EVAL").length;
    return { hasVmet, hasJst, linkedinCount, fitrepCount };
  }, [docs]);

  const sourceRows = useMemo(
    () => [
      {
        label: "FITREP / EVAL",
        ready: sourceSummary.fitrepCount > 0,
        detail: sourceSummary.fitrepCount > 0 ? `${sourceSummary.fitrepCount} ready` : "Not found",
      },
      {
        label: "VMET",
        ready: sourceSummary.hasVmet,
        detail: sourceSummary.hasVmet ? "Ready" : "Not found",
      },
      {
        label: "JST",
        ready: sourceSummary.hasJst,
        detail: sourceSummary.hasJst ? "Ready" : "Not found",
      },
      {
        label: "LinkedIn Profile",
        ready: sourceSummary.linkedinCount > 0,
        detail: sourceSummary.linkedinCount > 0 ? `${sourceSummary.linkedinCount} ready` : "Not found",
      },
    ],
    [sourceSummary]
  );

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
          ? { mode, targetRole: targetRole || null }
          : {
              mode,
              targetRole: targetRole || null,
              vmetText: optionalText(vmetText),
              jstText: optionalText(jstText),
              fitrepsText: optionalText(fitrepsText),
            }
        : { mode, targetRole: targetRole || null, pastedText };

    try {
      const res = await fetch("/api/tools/fitrep-bullets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong on our end. Your inputs are still here — try again in a few seconds.");
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
      setError("That didn't go through. Check your connection and try again — your inputs are still here.");
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

  const noDocsYet = mode === "master_resume" && useUploadedDocs && !docsLoading && docs.length === 0;

  return (
    <main className="page-shell">

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker-pill">MASTER RESUME BUILDER</p>
            <h1 className="page-title">
              Build the master resume{" "}
              <span className="gradient-text">every other tool builds on.</span>
            </h1>
            <p className="page-description">
              Turns your FITREPs, EVALs, JST, and VMET into one master resume. The targeted resume, LinkedIn, and interview tools all pull from it.
            </p>
          </div>
          <aside className="page-hero-aside relative z-10">
            <p className="page-hero-aside-title">WORKS BEST WITH</p>
            <ul className="page-hero-list">
              <li>Your uploaded FITREPs and EVALs</li>
              <li>JST, VMET, and LinkedIn profile documents</li>
              <li>A target role, if you already have one in mind</li>
            </ul>
          </aside>
        </div>
        <div className="hero-trust-strip -mx-7 -mb-7 mt-6">
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {["FITREPs / EVALs", "JST · VMET", "LinkedIn profile docs", "Auto-saved to Library"].map(
              (label) => (
                <div key={label} className="hero-trust-item">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: "#39a67f" }}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.65)" }}>
                    {label}
                  </span>
                </div>
              )
            )}
          </div>
        </div>
      </section>

      {/* ── Tool layout ────────────────────────────────────────────── */}
      <div className="tool-shell">

        {/* ── INPUT PANEL ────────────────────────────────────────── */}
        <div className="tool-input-panel">

          {noDocsYet && (
            <ToolAlert variant="info" title="Upload your records first">
              <p className="text-sm">
                Add your FITREPs, EVALs, JST, or VMET on the{" "}
                <a href="/app/documents" className="font-semibold underline">
                  Documents
                </a>{" "}
                page before running this. The more records you add, the stronger your master resume.
              </p>
            </ToolAlert>
          )}

          <section className="tool-section">
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <div>
                <p className="tool-kicker">INPUTS</p>
                <p className="section-description mt-1">
                  Use uploaded documents when possible — the tool runs from whichever source records are available.
                </p>
              </div>

              {/* Mode */}
              <label className="block space-y-1">
                <span className="text-sm font-medium">Mode</span>
                <select
                  className="input"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as "bullets" | "master_resume")}
                >
                  <option value="master_resume">Master Resume</option>
                  <option value="bullets">Legacy Bullets Only</option>
                </select>
              </label>

              {/* Target role */}
              <label className="block space-y-1">
                <span className="text-sm font-medium">
                  Target Role{" "}
                  <span className="font-normal text-[var(--muted)]">(optional)</span>
                </span>
                <input
                  className="input"
                  placeholder="e.g. Program Manager, Operations Director"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                />
              </label>

              {mode === "master_resume" ? (
                <>
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={useUploadedDocs}
                      onChange={(e) => setUseUploadedDocs(e.target.checked)}
                    />
                    Build from uploaded documents{" "}
                    <span className="font-semibold text-[var(--accent)]">(recommended)</span>
                  </label>

                  {useUploadedDocs ? (
                    /* ── Source readiness panel ─────────────────── */
                    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="tool-kicker">YOUR RECORDS</p>
                        <button
                          className="btn btn-secondary !min-h-8 !py-1 text-xs"
                          type="button"
                          onClick={loadDocs}
                          disabled={docsLoading}
                        >
                          {docsLoading ? "Refreshing…" : "Refresh"}
                        </button>
                      </div>
                      <div className="mt-3 grid gap-2.5">
                        {sourceRows.map((row) => (
                          <div
                            key={row.label}
                            className="flex items-center justify-between gap-2 text-sm"
                          >
                            <span className="text-[var(--foreground)]">{row.label}</span>
                            <span
                              className={`flex items-center gap-1.5 font-medium ${
                                row.ready ? "text-[var(--accent)]" : "text-[var(--muted)]"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                  row.ready ? "bg-[var(--accent)]" : "bg-[var(--muted)]"
                                }`}
                                aria-hidden="true"
                              />
                              {row.detail}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-xs text-[var(--muted)]">
                        Missing records are fine — the tool will ask you follow-up questions to fill the gaps. If you upload a lot, it uses your most recent material first.
                      </p>
                      <a className="btn btn-secondary mt-3 w-full text-xs" href="/app/documents">
                        Manage Documents
                      </a>
                    </div>
                  ) : (
                    /* ── Manual paste inputs ────────────────────── */
                    <div className="flex flex-col gap-3">
                      <label className="block space-y-1">
                        <span className="text-sm font-medium">
                          1) VMET Text{" "}
                          <span className="font-normal text-[var(--muted)]">(optional)</span>
                        </span>
                        <textarea
                          className="input min-h-40"
                          value={vmetText}
                          onChange={(e) => setVmetText(e.target.value)}
                          placeholder="Paste VMET (DD2586) text first"
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-sm font-medium">
                          2) JST Text{" "}
                          <span className="font-normal text-[var(--muted)]">(optional)</span>
                        </span>
                        <textarea
                          className="input min-h-40"
                          value={jstText}
                          onChange={(e) => setJstText(e.target.value)}
                          placeholder="Paste JST text second"
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-sm font-medium">
                          3) FITREP / EVAL Text{" "}
                          <span className="text-xs font-semibold text-[var(--accent)]">(recommended)</span>
                        </span>
                        <textarea
                          className="input min-h-56"
                          value={fitrepsText}
                          onChange={(e) => setFitrepsText(e.target.value)}
                          placeholder="Paste all observed FITREP text in chronological order"
                        />
                      </label>
                      <p className="text-xs text-[var(--muted)]">
                        Provide at least one substantive source. FITREPs/EVALs produce the strongest accomplishment evidence.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <label className="block space-y-1">
                  <span className="text-sm font-medium">FITREP / EVAL Text</span>
                  <textarea
                    className="input min-h-56"
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Paste the text from your FITREPs or EVALs here"
                    required
                  />
                </label>
              )}

              <button className="btn btn-primary w-full sm:w-auto" disabled={loading} type="submit">
                {loading
                  ? "Running…"
                  : mode === "master_resume"
                  ? "Generate Master Resume"
                  : "Generate Master Bullets"}
              </button>
            </form>
          </section>
        </div>

        {/* ── OUTPUT PANEL ───────────────────────────────────────── */}
        <div className="tool-output-panel">

          {/* Loading */}
          {loading && (
            <LoadingBlock
              task={
                mode === "master_resume" ? "Generating master resume…" : "Generating master bullets…"
              }
              detail="Analyzing source records and translating military experience. This typically takes 30–60 seconds."
            />
          )}

          {/* Error */}
          {!loading && error && (
            <ToolAlert variant="error" title="Generation failed">
              <p className="text-sm">{error}</p>
            </ToolAlert>
          )}

          {/* Success notice */}
          {!loading && !error && notice && (
            <ToolAlert variant="info">
              <p className="text-sm">{notice}</p>
            </ToolAlert>
          )}

          {/* Copy feedback */}
          {copyState && (
            <ToolAlert variant="info">
              <p className="text-sm">{copyState}</p>
            </ToolAlert>
          )}

          {/* ── Master resume output ─────────────────────────────── */}
          {!loading && result && "master_resume" in result && (
            <div className="tool-output-card">
              <div>
                <p className="tool-kicker">OUTPUT</p>
                <p className="section-title mt-0.5">Generated Master Resume</p>
                <p className="section-description">
                  Review this draft, refine it, and save your best version in Documents so every downstream tool starts from a stronger source.
                </p>
              </div>

              {typeof result.fitrepDocsDetected === "number" &&
                typeof result.fitrepDocsIncluded === "number" && (
                  <p className="text-xs text-[var(--muted)]">
                    FITREP/EVAL sources: {result.fitrepDocsIncluded} of {result.fitrepDocsDetected}{" "}
                    included
                    {result.fitrepDocsTruncated ? " — truncated by input budget" : ""}
                  </p>
                )}

              <pre className="tool-resume-preview">{result.master_resume}</pre>

              {result.validation_questions?.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="tool-kicker">GAPS TO FILL</p>
                  {result.validation_questions.map((q, idx) => (
                    <ToolAlert key={`${q}-${idx}`} variant="warn">
                      <p className="text-sm">{q}</p>
                    </ToolAlert>
                  ))}
                </div>
              )}

              <ActionBar>
                <button
                  className="btn btn-primary text-sm"
                  type="button"
                  onClick={() => void copyText("Master resume", result.master_resume)}
                >
                  Copy Resume
                </button>
                <a
                  className="btn btn-secondary text-sm"
                  href={`/api/resume-artifacts/${result.artifactId}/download?format=docx`}
                >
                  Export Word
                </a>
                <a
                  className="btn btn-secondary text-sm"
                  href={`/api/resume-artifacts/${result.artifactId}/download`}
                >
                  Export Text
                </a>
              </ActionBar>
            </div>
          )}

          {/* ── Bullets output ───────────────────────────────────── */}
          {!loading && result && "bullets" in result && (
            <div className="tool-output-card">
              <div>
                <p className="tool-kicker">OUTPUT</p>
                <p className="section-title mt-0.5">Generated Bullets</p>
                <p className="section-description">
                  Use these as a starting point, then refine tone and evidence before reuse.
                </p>
              </div>

              <ul className="flex flex-col gap-1.5 text-sm">
                {result.bullets.map((b, idx) => (
                  <li key={`${b.category}-${idx}`} className="flex gap-2">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
                      aria-hidden="true"
                    />
                    {b.bullet}
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-1 text-sm">
                <p>
                  <span className="font-semibold">Suggested roles:</span>{" "}
                  {result.suggested_job_titles.join(", ")}
                </p>
                <p>
                  <span className="font-semibold">Keywords:</span>{" "}
                  {result.core_keywords.join(", ")}
                </p>
              </div>

              <ActionBar>
                <button
                  className="btn btn-primary text-sm"
                  type="button"
                  onClick={() =>
                    void copyText("Bullets", result.bullets.map((b) => b.bullet).join("\n"))
                  }
                >
                  Copy Bullets
                </button>
              </ActionBar>
            </div>
          )}

          {/* ── Empty state ──────────────────────────────────────── */}
          {!loading && !result && !error && (
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
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M7 8h10M7 12h10M7 16h6" />
              </svg>
              <p className="font-medium">Output will appear here</p>
              <p className="text-sm">Fill in your inputs on the left and run it. Your record turns into lines like this:</p>
              <div className="tool-example">
                <p className="tool-example-kicker">Example</p>
                <p className="mt-2 text-xs text-[var(--muted)] line-through decoration-[var(--line)]">
                  Led 24 Marines maintaining a 100 vehicle fleet with 96% readiness.
                </p>
                <p className="mt-1.5 text-sm font-medium text-[var(--foreground)]">
                  Managed a 24-person operations team responsible for a 100-vehicle fleet, sustaining 96% operational readiness.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function FitrepBulletsPage() {
  return (
    <Suspense fallback={<div className="page-shell" />}>
      <FitrepBulletsContent />
    </Suspense>
  );
}
