"use client";

import { FormEvent, useState } from "react";

type Output = {
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

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length ? (
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          {items.map((item, idx) => (
            <li key={`${title}-${idx}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-[var(--muted)]">None listed.</p>
      )}
    </section>
  );
}

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
      setTimeout(() => setCopyState(""), 1500);
    } catch {
      setCopyState(`Could not copy ${label.toLowerCase()}`);
      setTimeout(() => setCopyState(""), 1500);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);

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

  return (
    <main className="space-y-4">
      <section className="panel p-6">
        <h1 className="text-2xl font-bold">Job Description Decoder</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Deep role analysis with requirements, signals, and interview focus areas.
        </p>
      </section>
      <section className="panel p-6">
        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="space-y-1 block">
            <span className="text-sm font-medium">Job Description</span>
            <textarea
              className="input min-h-56"
              value={jobDescriptionText}
              onChange={(e) => setJobDescriptionText(e.target.value)}
              required
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Analyzing..." : "Analyze Job Description"}
          </button>
        </form>
      </section>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {copyState && <p className="text-sm text-[var(--accent)]">{copyState}</p>}
      {result && (
        <section className="panel p-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary text-sm" type="button" onClick={() => copyText("Summary", result.plain_english_summary)}>
              Copy Summary
            </button>
            <button className="btn btn-secondary text-sm" type="button" onClick={() => copyText("Priority Keywords", result.ats_keywords_priority.join(", "))}>
              Copy Priority Keywords
            </button>
          </div>

          <p className="text-sm"><span className="font-semibold">Role level:</span> {result.role_level_guess}</p>
          <p className="text-sm"><span className="font-semibold">Plain-English summary:</span> {result.plain_english_summary}</p>
          <p className="text-sm"><span className="font-semibold">Role mission summary:</span> {result.role_mission_summary}</p>

          <ListBlock title="Top Must-Have Signals" items={result.top_must_have_signals ?? []} />
          <ListBlock title="Hard Requirements" items={result.hard_requirements ?? []} />
          <ListBlock title="Soft Requirements" items={result.soft_requirements ?? []} />
          <ListBlock title="Implied Expectations" items={result.implied_expectations ?? []} />
          <ListBlock title="ATS Keywords (Priority Order)" items={result.ats_keywords_priority ?? []} />
          <ListBlock title="Company Context Signals" items={result.company_context_signals ?? []} />
          <ListBlock title="Fit Risks" items={result.fit_risks ?? []} />
          <ListBlock title="Clarifying Questions" items={result.clarifying_questions ?? []} />
          <ListBlock title="Interview Focus Areas" items={result.interview_focus_areas ?? []} />
          <ListBlock title="Likely Interview Questions" items={result.likely_interview_questions ?? []} />
        </section>
      )}
    </main>
  );
}
