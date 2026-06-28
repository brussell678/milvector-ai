"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { LoadingBlock } from "@/components/tools/loading-block";
import { ToolAlert } from "@/components/tools/tool-alert";
import { ActionBar } from "@/components/tools/action-bar";

// ─── Types ────────────────────────────────────────────────────────────

type Output = {
  runId: string | null;
  plain_english_summary: string;
  role_mission_summary: string;
  role_level_guess: string;
  hard_requirements: string[];
  soft_requirements: string[];
  implied_expectations: string[];
  top_must_have_signals: string[];
  ats_keywords_priority: string[];
  company_context_signals: string[];
  fit_risks: string[];
  clarifying_questions: string[];
  interview_focus_areas: string[];
  likely_interview_questions: string[];
};

// ─── Sub-components ───────────────────────────────────────────────────

function OutputList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">{title}</p>
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

function MustHaveList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--accent)]">
        Top Must-Have Signals
      </p>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, idx) => (
          <li key={idx} className="flex gap-2 text-sm font-medium">
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

function KeywordChips({ keywords }: { keywords: string[] }) {
  if (!keywords.length) return null;
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

// ─── Page ─────────────────────────────────────────────────────────────

export default function JobDescriptionDecoderPage() {
  const [jobDescriptionText, setJobDescriptionText] = useState("");
  const [result, setResult] = useState<Output | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState(`${label} copied`);
    } catch {
      setCopyState(`Could not copy ${label.toLowerCase()}`);
    }
    setTimeout(() => setCopyState(""), 1500);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);
    setCopyState("");

    try {
      const res = await fetch("/api/tools/jd-decoder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescriptionText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Request failed");
        return;
      }
      setResult(data as Output);
    } catch {
      setError("Network error while decoding job description.");
    } finally {
      setLoading(false);
    }
  }

  const targeterHref = result?.runId
    ? `/app/tools/resume-targeter?jd=${result.runId}`
    : "/app/tools/resume-targeter";

  return (
    <main className="page-shell">

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker-pill">JD DECODER</p>
            <h1 className="page-title">
              Turn a posting into{" "}
              <span className="gradient-text">clear signals before you spend application time.</span>
            </h1>
            <p className="page-description">
              Analyze requirements, implied expectations, ATS keywords, fit risks, and interview focus areas from any job description — before you commit to applying.
            </p>
          </div>
          <aside className="page-hero-aside relative z-10">
            <p className="page-hero-aside-title">WHAT YOU GET</p>
            <ul className="page-hero-list">
              <li>Role-level and mission framing</li>
              <li>Hard, soft, and implied requirements</li>
              <li>Priority ATS keywords</li>
              <li>Interview prep and clarifying questions</li>
            </ul>
          </aside>
        </div>
        <div className="hero-trust-strip -mx-7 -mb-7 mt-6">
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {[
              "The Role",
              "What They Want",
              "ATS Keywords",
              "Your Prep",
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

      {/* ── Tool layout ────────────────────────────────────────────── */}
      <div className="tool-shell">

        {/* ── INPUT PANEL ────────────────────────────────────────── */}
        <div className="tool-input-panel">
          <section className="tool-section">
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <div>
                <p className="tool-kicker">INPUT</p>
                <p className="section-description mt-1">
                  Paste the complete job posting. The more text you include, the stronger the analysis.
                </p>
              </div>

              <label className="block space-y-1">
                <span className="text-sm font-medium">Full Job Description</span>
                <textarea
                  className="input min-h-72"
                  value={jobDescriptionText}
                  onChange={(e) => setJobDescriptionText(e.target.value)}
                  placeholder="Paste the complete job posting here — title, responsibilities, requirements, and any company context."
                  required
                />
              </label>

              <button
                className="btn btn-primary w-full sm:w-auto"
                type="submit"
                disabled={loading}
              >
                {loading ? "Analyzing…" : "Analyze Job Description"}
              </button>
            </form>
          </section>

          {/* Cross-tool CTA — shown after a result is saved */}
          {result && !loading && (
            <section className="tool-section">
              <div>
                <p className="tool-kicker">NEXT STEP</p>
                <p className="section-title mt-0.5">Ready to build the resume?</p>
                <p className="section-description">
                  Take this analysis directly into the Resume Targeter to generate a role-specific resume draft.
                </p>
              </div>
              <Link href={targeterHref} className="btn btn-primary w-full text-sm">
                Use in Resume Targeter →
              </Link>
            </section>
          )}
        </div>

        {/* ── OUTPUT PANEL ───────────────────────────────────────── */}
        <div className="tool-output-panel">

          {/* Loading */}
          {loading && (
            <LoadingBlock
              task="Decoding job description…"
              detail="Extracting requirements, signals, keywords, and interview prep. Usually takes 15–30 seconds."
            />
          )}

          {/* Error */}
          {!loading && error && (
            <ToolAlert variant="error" title="Analysis failed">
              <p className="text-sm">{error}</p>
            </ToolAlert>
          )}

          {/* Copy feedback */}
          {copyState && (
            <ToolAlert variant="info">
              <p className="text-sm">{copyState}</p>
            </ToolAlert>
          )}

          {/* ── Group 1: The Role ─────────────────────────────────── */}
          {!loading && result && (
            <div className="tool-output-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="tool-kicker">THE ROLE</p>
                  <p className="section-title mt-0.5">Role &amp; Company Context</p>
                </div>
                <span className="tool-badge tool-badge-success shrink-0 mt-1">
                  {result.role_level_guess}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Plain-English Summary
                </p>
                <p className="text-sm leading-relaxed">{result.plain_english_summary}</p>
              </div>

              <div className="flex flex-col gap-1">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Role Mission
                </p>
                <p className="text-sm leading-relaxed">{result.role_mission_summary}</p>
              </div>

              <OutputList
                title="Company Context Signals"
                items={result.company_context_signals}
              />

              <ActionBar>
                <button
                  className="btn btn-secondary text-sm"
                  type="button"
                  onClick={() => void copyText("Summary", result.plain_english_summary)}
                >
                  Copy Summary
                </button>
              </ActionBar>
            </div>
          )}

          {/* ── Group 2: What They Want ───────────────────────────── */}
          {!loading && result && (
            <div className="tool-output-card">
              <div>
                <p className="tool-kicker">WHAT THEY WANT</p>
                <p className="section-title mt-0.5">Requirements &amp; Expectations</p>
              </div>

              <MustHaveList items={result.top_must_have_signals} />
              <OutputList title="Hard Requirements" items={result.hard_requirements} />
              <OutputList title="Soft Requirements" items={result.soft_requirements} />
              <OutputList title="Implied Expectations" items={result.implied_expectations} />

              {result.fit_risks.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                    Fit Risks
                  </p>
                  {result.fit_risks.map((risk, idx) => (
                    <ToolAlert key={idx} variant="warn">
                      <p className="text-sm">{risk}</p>
                    </ToolAlert>
                  ))}
                </div>
              )}

              {result.ats_keywords_priority.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                    ATS Keywords — Priority Order
                  </p>
                  <KeywordChips keywords={result.ats_keywords_priority} />
                  <button
                    className="btn btn-secondary w-fit text-xs"
                    type="button"
                    onClick={() =>
                      void copyText(
                        "Priority keywords",
                        result.ats_keywords_priority.join(", ")
                      )
                    }
                  >
                    Copy Keywords
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Group 3: Your Prep ───────────────────────────────── */}
          {!loading && result && (
            <div className="tool-output-card">
              <div>
                <p className="tool-kicker">YOUR PREP</p>
                <p className="section-title mt-0.5">Interview &amp; Application Readiness</p>
              </div>

              <OutputList
                title="Interview Focus Areas"
                items={result.interview_focus_areas}
              />
              <OutputList
                title="Likely Interview Questions"
                items={result.likely_interview_questions}
              />
              <OutputList
                title="Clarifying Questions to Ask"
                items={result.clarifying_questions}
              />
            </div>
          )}

          {/* Empty state */}
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
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
              </svg>
              <p className="font-medium">Analysis will appear here</p>
              <p className="text-xs">
                Paste a job description on the left and run the analysis to see the decoded output.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
