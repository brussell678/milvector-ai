"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { LoadingBlock } from "@/components/tools/loading-block";
import { ToolAlert } from "@/components/tools/tool-alert";
import { ActionBar } from "@/components/tools/action-bar";
import { Term } from "@/components/ui/term";
import { MasterResumePicker } from "@/components/tools/master-resume-picker";
import { JobLinkField, postingSummary, readPostingFromLink, type LoadedPosting } from "@/components/tools/job-link-field";
import { FitMapView } from "@/components/tools/fit-map-view";
import type { FitResult } from "@/lib/resume/fit-check";

// ─── Types ────────────────────────────────────────────────────────────

type Output = {
  runId: string | null;
  job_title?: string;
  plain_english_summary: string;
  role_mission_summary: string;
  role_level_guess: string;
  role_level_confidence?: string;
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
  // The same fit check the Targeted Resume Builder runs, or why there is none.
  fit?: FitResult | null;
  fitNote?: string | null;
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
  const [link, setLink] = useState("");
  // The posting read from the link, so a new link clears it but typed text stays.
  const [fromLink, setFromLink] = useState<LoadedPosting | null>(null);
  const [readingLink, setReadingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [result, setResult] = useState<Output | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<string>("");
  const [loading, setLoading] = useState(false);

  function changeLink(value: string) {
    setLink(value);
    setLinkError(null);
    if (fromLink && jobDescriptionText === fromLink.text) setJobDescriptionText("");
    setFromLink(null);
  }

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
    setResult(null);
    setError(null);
    setLinkError(null);
    setCopyState("");

    // A link and an empty box: read the posting first, then decode it.
    let postingText = jobDescriptionText;
    if (!postingText.trim() && link.trim()) {
      setReadingLink(true);
      const read = await readPostingFromLink(link);
      setReadingLink(false);
      if (!read.ok) {
        setLinkError(read.error);
        return;
      }
      postingText = read.posting.text;
      setJobDescriptionText(postingText);
      setFromLink(read.posting);
    }

    setLoading(true);
    try {
      const res = await fetch("/api/tools/jd-decoder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescriptionText: postingText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong on our end. Your posting text is still here. Try again in a few seconds.");
        return;
      }
      setResult(data as Output);
    } catch {
      setError("That didn't go through. Check your connection and try again. Your posting text is still here.");
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
            <p className="page-kicker-pill">JOB DESCRIPTION DECODER</p>
            <h1 className="page-title">
              Know what a job posting{" "}
              <span className="gradient-text">really wants before you apply.</span>
            </h1>
            <p className="page-description">
              Paste any job posting and see what they actually require, what they quietly expect, which keywords matter, and what to watch out for, all before you spend time applying.
            </p>
          </div>
          <aside className="page-hero-aside relative z-10">
            <p className="page-hero-aside-title">WHAT YOU GET</p>
            <ul className="page-hero-list">
              <li>What the job actually is, in plain terms</li>
              <li>Must-haves vs. nice-to-haves vs. unwritten expectations</li>
              <li>The keywords that get resumes past screening software</li>
              <li>Interview prep and questions worth asking them</li>
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
                  Paste a link to the job posting, or the complete posting itself. The more of the posting we have, the stronger the analysis.
                </p>
              </div>

              <MasterResumePicker purpose="Your fit compares the posting with this resume, the same way the Targeted Resume Builder does. Without one, you still get the posting analysis." />

              <JobLinkField value={link} onChange={changeLink} disabled={loading || readingLink} note={fromLink ? postingSummary(fromLink) : null} error={linkError} />

              <label className="block space-y-1">
                <span className="text-sm font-medium">Full Job Description{link.trim() ? " (or leave empty to use the link)" : ""}</span>
                <textarea
                  className="input min-h-72"
                  value={jobDescriptionText}
                  onChange={(e) => setJobDescriptionText(e.target.value)}
                  placeholder="Paste the complete job posting here: title, responsibilities, requirements, and any company context."
                  required={!link.trim()}
                />
              </label>

              <button
                className="btn btn-primary w-full sm:w-auto"
                type="submit"
                disabled={loading || readingLink}
              >
                {readingLink ? "Reading the posting..." : loading ? "Analyzing…" : "Analyze Job Description"}
              </button>
            </form>
          </section>

          {/* Cross-tool CTA, shown after a result is saved */}
          {result && !loading && (
            <section className="tool-section">
              <div>
                <p className="tool-kicker">NEXT STEP</p>
                <p className="section-title mt-0.5">Ready to build the resume?</p>
                <p className="section-description">
                  {result.fit
                    ? "Carry this straight into the Targeted Resume Builder. The posting and your fit come with you, so it goes straight to building."
                    : "Carry this straight into the Targeted Resume Builder. The posting comes with you."}
                </p>
              </div>
              <Link href={targeterHref} className="btn btn-primary w-full text-sm">
                Build a targeted resume →
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
              detail="Reading the posting for requirements, keywords, and interview prep, and checking it against your master resume. Usually 15 to 30 seconds, or up to a minute when it checks your fit."
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

          {/* ── Group 0: Your Fit (the builder's fit check) ─────────── */}
          {!loading && result?.fit && (
            <FitMapView
              fit={result.fit}
              kicker="YOUR FIT"
              gapHint="Have you done this? Add it to your master in Word, upload it to My Files, choose it as your master, and run this again. If not, be ready to speak to it."
            />
          )}
          {!loading && result && !result.fit && (
            <ToolAlert variant="info" title={result.fitNote === "no_master" ? "See how you fit" : "Your fit was not checked"}>
              <p className="text-sm">
                {result.fitNote === "no_master" ? (
                  <>
                    Choose your master resume above, or{" "}
                    <Link href="/app/tools/fitrep-bullets" className="font-semibold underline">
                      build one from your records
                    </Link>
                    , then run this again to see each requirement matched to your own experience.
                  </>
                ) : (
                  result.fitNote ?? "Your fit could not be checked this time. Run this again to see it."
                )}
              </p>
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
                  {result.role_level_confidence ? ` · ${result.role_level_confidence} confidence` : ""}
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
                    <Term k="ats">ATS</Term> <Term k="keywords">Keywords</Term> by Priority
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
              <p className="text-sm">
                Paste a job posting on the left and run it. Here&apos;s the kind of read you&apos;ll get:
              </p>
              <div className="tool-example">
                <p className="tool-example-kicker">Example</p>
                <p className="mt-2 text-sm font-bold text-[var(--foreground)]">Logistics Coordinator: what they really want</p>
                <ul className="mt-1.5 space-y-1 text-xs text-[var(--muted)]">
                  <li>• Must-have: 3+ years coordinating shipments or supply</li>
                  <li>• Unwritten: comfortable being the one everyone calls when plans change</li>
                  <li>• Watch out: &quot;fast-paced environment&quot; here means frequent overtime</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
