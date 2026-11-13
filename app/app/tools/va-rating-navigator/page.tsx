"use client";

import { FormEvent, useMemo, useState } from "react";
import { LoadingBlock } from "@/components/tools/loading-block";
import { ToolAlert } from "@/components/tools/tool-alert";
import { combineRatings } from "@/lib/va/combined";

// ─── Types ────────────────────────────────────────────────────────────

type Candidate = { code: string; title: string; why: string; ratings: number[] };
type Dbq = { title: string; url: string };
type Identified = { input: string; plainLanguage: string; candidates: Candidate[]; dbq: Dbq[]; note: string };

type Analysis = {
  condition: string;
  crisisNote: string;
  codes: { code: string; title: string; section: string; why: string }[];
  breakdown: { code: string; rating: number; criteria: string; evidence: string; examiner: string }[];
  checklist: { form: string; items: { item: string; status: string }[] };
  criteriaLanguage: { lower: string[]; middle: string[]; higher: string[] };
  gaps: { described: string[]; missing: string[]; weak: string[]; strengthen: string[] };
  likelyRange: { low: number | null; high: number | null; why: string; up: string; down: string; confidence: string };
  secondary: { condition: string; relationship: string; note: string }[];
  examPrep: string[];
  allowedRatings: number[];
};

type Row = Identified & {
  code: string;
  details: string;
  analysis: Analysis | null;
  loading: boolean;
  error: string | null;
  rating: string; // chosen rating for the combined estimate, "" = leave out
  bilateral: boolean;
};

type Source = { asOf: string; url: string };

// ─── Helpers ──────────────────────────────────────────────────────────

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">{title}</p>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, idx) => (
          <li key={idx} className="flex gap-2 text-sm">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

const STATUS_LABEL: Record<string, { label: string; badge: string }> = {
  covered: { label: "You covered this", badge: "tool-badge-success" },
  unclear: { label: "Unclear", badge: "tool-badge-warn" },
  missing: { label: "Not mentioned", badge: "tool-badge-error" },
};

function AnalysisView({ a }: { a: Analysis }) {
  const range =
    a.likelyRange.low === null || a.likelyRange.high === null
      ? "Not enough to estimate"
      : a.likelyRange.low === a.likelyRange.high
      ? `${a.likelyRange.low} percent`
      : `${a.likelyRange.low} to ${a.likelyRange.high} percent`;

  return (
    <div className="mt-4 flex flex-col gap-5 border-t border-[var(--line)] pt-4">
      {a.crisisNote ? (
        <ToolAlert variant="stop" title="You are not alone">
          <p className="text-sm font-medium">{a.crisisNote}</p>
        </ToolAlert>
      ) : null}

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">1. Likely diagnostic code</p>
        {a.codes.map((c) => (
          <p key={c.code} className="text-sm">
            <span className="font-semibold">
              DC {c.code}, {c.title}
            </span>{" "}
            <span className="text-[var(--muted)]">(38 CFR {c.section})</span>
            {c.why ? <span className="block text-[var(--muted)]">{c.why}</span> : null}
          </p>
        ))}
      </div>

      {a.breakdown.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">2. Rating criteria</p>
          <div className="grid gap-2">
            {a.breakdown.map((row, idx) => (
              <div key={idx} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
                <p className="text-sm font-bold">{row.rating} percent</p>
                <p className="mt-1 text-sm">{row.criteria}</p>
                {row.evidence ? (
                  <p className="mt-1.5 text-sm text-[var(--muted)]">
                    <span className="font-semibold">Evidence that supports it:</span> {row.evidence}
                  </p>
                ) : null}
                {row.examiner ? (
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    <span className="font-semibold">What the examiner looks for:</span> {row.examiner}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {a.checklist.items.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
            3. Exam form checklist{a.checklist.form ? `: ${a.checklist.form}` : ""}
          </p>
          <ul className="grid gap-1.5">
            {a.checklist.items.map((item, idx) => {
              const status = STATUS_LABEL[item.status] ?? STATUS_LABEL.unclear;
              return (
                <li key={idx} className="flex items-start justify-between gap-3 text-sm">
                  <span>{item.item}</span>
                  <span className={`tool-badge ${status.badge} shrink-0`} style={{ fontSize: "0.62rem" }}>
                    {status.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="grid gap-4">
        <p className="-mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">4. What the criteria turn on</p>
        <p className="text-xs text-[var(--muted)]">
          These are the regulation&apos;s own distinctions between rating levels. They tell you what to describe accurately, not
          what to say.
        </p>
        <Bullets title="Lower ratings" items={a.criteriaLanguage.lower} />
        <Bullets title="Middle ratings" items={a.criteriaLanguage.middle} />
        <Bullets title="Higher ratings" items={a.criteriaLanguage.higher} />
      </div>

      <div className="grid gap-4">
        <p className="-mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">5. Evidence gaps</p>
        <Bullets title="What you already described" items={a.gaps.described} />
        <Bullets title="What appears to be missing" items={a.gaps.missing} />
        <Bullets title="Weak points" items={a.gaps.weak} />
        <Bullets title="What would strengthen the record" items={a.gaps.strengthen} />
      </div>

      <div className="rounded-xl border border-[var(--accent)] bg-[var(--panel)] p-4">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">6. Likely rating range (estimate)</p>
        <p className="mt-1 text-lg font-bold">{range}</p>
        <p className="text-xs text-[var(--muted)]">Confidence: {a.likelyRange.confidence}. Based only on what you entered.</p>
        {a.likelyRange.why ? <p className="mt-2 text-sm">{a.likelyRange.why}</p> : null}
        {a.likelyRange.up ? (
          <p className="mt-1.5 text-sm text-[var(--muted)]">
            <span className="font-semibold">Could move it up:</span> {a.likelyRange.up}
          </p>
        ) : null}
        {a.likelyRange.down ? (
          <p className="mt-1 text-sm text-[var(--muted)]">
            <span className="font-semibold">Could move it down:</span> {a.likelyRange.down}
          </p>
        ) : null}
      </div>

      {a.secondary.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">7. Possible secondary conditions</p>
          <ul className="grid gap-1.5">
            {a.secondary.map((s, idx) => (
              <li key={idx} className="text-sm">
                <span className="font-semibold">{s.condition}</span>{" "}
                <span className="text-[var(--muted)]">
                  ({s.relationship}){s.note ? `: ${s.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Bullets title="Preparing for the exam" items={a.examPrep} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function VaRatingNavigatorPage() {
  const [conditionsText, setConditionsText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [source, setSource] = useState<Source | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (index: number, change: Partial<Row>) => setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...change } : row)));

  async function identify(e: FormEvent) {
    e.preventDefault();
    const conditions = conditionsText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length >= 2)
      .slice(0, 15);
    if (conditions.length === 0) {
      setError("List at least one condition, one per line.");
      return;
    }
    setIdentifying(true);
    setError(null);
    setRows([]);
    try {
      const res = await fetch("/api/tools/va-rating-navigator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "identify", conditions }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Something went wrong on our end. Try again in a few seconds.");
        return;
      }
      setSource(data.source as Source);
      setRows(
        (data.conditions as Identified[]).map((c) => ({
          ...c,
          code: c.candidates[0]?.code ?? "",
          details: "",
          analysis: null,
          loading: false,
          error: null,
          rating: "",
          bilateral: false,
        }))
      );
    } catch {
      setError("That didn't go through. Check your connection and try again.");
    } finally {
      setIdentifying(false);
    }
  }

  async function analyze(index: number) {
    const row = rows[index];
    if (!row?.code) return;
    patch(index, { loading: true, error: null });
    try {
      const res = await fetch("/api/tools/va-rating-navigator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "analyze",
          condition: row.input,
          codes: [row.code],
          dbqTitles: row.dbq.map((d) => d.title),
          details: row.details || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        patch(index, { loading: false, error: typeof data.error === "string" ? data.error : "This one did not finish. Try again." });
        return;
      }
      const analysis = data.analysis as Analysis;
      patch(index, {
        loading: false,
        analysis,
        // Start the combined estimate from the low end of the range: the conservative read.
        rating: analysis.likelyRange.low !== null ? String(analysis.likelyRange.low) : "",
      });
    } catch {
      patch(index, { loading: false, error: "That didn't go through. Check your connection and try again." });
    }
  }

  const combined = useMemo(() => {
    const rated = rows.filter((row) => row.rating !== "").map((row) => ({ rating: Number(row.rating), bilateral: row.bilateral }));
    return rated.length > 0 ? combineRatings(rated) : null;
  }, [rows]);

  return (
    <main className="page-shell">
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker-pill">VA RATING NAVIGATOR</p>
            <h1 className="page-title">
              Understand how VA would rate <span className="gradient-text">each condition you claim.</span>
            </h1>
            <p className="page-description">
              See the rating criteria from the actual regulation, what the exam documents, where your evidence is thin, and an
              honest estimate of where you may land.
            </p>
          </div>
          <aside className="page-hero-aside relative z-10">
            <p className="page-hero-aside-title">HOW THIS STAYS HONEST</p>
            <ul className="page-hero-list">
              <li>Criteria come from 38 CFR Part 4, not from memory</li>
              <li>Every estimate is a range, never a promise</li>
              <li>Built to help you describe your condition accurately, not to coach an answer</li>
              <li>MilVector does not save your symptom details</li>
            </ul>
          </aside>
        </div>
      </section>

      <div className="tool-shell">
        {/* ── INPUT ─────────────────────────────────────────────── */}
        <div className="tool-input-panel">
          <section className="tool-section">
            <form className="flex flex-col gap-4" onSubmit={identify}>
              <div>
                <p className="tool-kicker">STEP 1: YOUR CONDITIONS</p>
                <p className="section-description mt-1">One per line, in your own words. Up to 15.</p>
              </div>
              <textarea
                className="input min-h-40"
                value={conditionsText}
                onChange={(e) => setConditionsText(e.target.value)}
                placeholder={"Lower back pain\nTinnitus\nRight knee\nSleep apnea\nMigraines"}
              />
              <button className="btn btn-primary w-full sm:w-auto" type="submit" disabled={identifying}>
                {identifying ? "Matching…" : "Find the Rating Codes"}
              </button>
            </form>
          </section>

          {combined && (
            <section className="tool-section">
              <p className="tool-kicker">COMBINED RATING ESTIMATE</p>
              <p className="text-3xl font-extrabold">{combined.combinedRating}%</p>
              <p className="text-sm text-[var(--muted)]">
                VA does not add ratings together. Each one applies to what is left after the one before it. Exact combined value:{" "}
                {combined.combinedValue}.
              </p>
              <ol className="list-decimal space-y-0.5 pl-5 text-xs text-[var(--muted)]">
                {combined.steps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
              <p className="text-xs text-[var(--muted)]">
                Approximate. It uses the rating you picked for each condition below, and VA decides the real ones.
              </p>
            </section>
          )}

          <section className="tool-section">
            <p className="tool-kicker">READ THIS</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
              <li>Educational only. MilVector is not an accredited claims agent, attorney, or medical provider and does not file or prepare claims.</li>
              <li>For free help filing, work with an accredited Veterans Service Officer (VFW, DAV, American Legion, or your county office).</li>
              <li>Describe your symptoms honestly and consistently. Exaggerating a claim is fraud and can cost you your benefits.</li>
              {source ? (
                <li>
                  Rating criteria are from{" "}
                  <a className="underline" href={source.url} target="_blank" rel="noreferrer">
                    38 CFR Part 4
                  </a>{" "}
                  as of {source.asOf}. VA has proposed changes to mental health, sleep apnea, and tinnitus ratings that are not final.
                  Confirm current criteria before relying on this.
                </li>
              ) : null}
            </ul>
          </section>
        </div>

        {/* ── OUTPUT ────────────────────────────────────────────── */}
        <div className="tool-output-panel">
          {identifying && <LoadingBlock task="Matching your conditions to the rating schedule…" detail="Usually 15 to 30 seconds." />}

          {!identifying && error && (
            <ToolAlert variant="error" title="Could not finish">
              <p className="text-sm">{error}</p>
            </ToolAlert>
          )}

          {!identifying &&
            rows.map((row, index) => {
              const candidate = row.candidates.find((c) => c.code === row.code);
              const ratingOptions = row.analysis?.allowedRatings.length ? row.analysis.allowedRatings : candidate?.ratings ?? [];
              return (
                <div key={`${row.input}-${index}`} className="tool-output-card">
                  <div>
                    <p className="tool-kicker">CONDITION {index + 1}</p>
                    <p className="section-title mt-0.5">{row.input}</p>
                    {row.plainLanguage ? <p className="section-description">{row.plainLanguage}</p> : null}
                  </div>

                  {row.candidates.length === 0 ? (
                    <ToolAlert variant="warn" title="No matching code found">
                      <p className="text-sm">
                        {row.note || "Nothing in the rating schedule clearly matches this wording."} Try the medical name of the
                        condition, or ask a Veterans Service Officer how it would be rated.
                      </p>
                    </ToolAlert>
                  ) : (
                    <>
                      <label className="block space-y-1">
                        <span className="text-sm font-medium">Rating code</span>
                        <select className="input" value={row.code} onChange={(e) => patch(index, { code: e.target.value, analysis: null, rating: "" })}>
                          {row.candidates.map((c) => (
                            <option key={c.code} value={c.code}>
                              DC {c.code}: {c.title}
                            </option>
                          ))}
                        </select>
                        {candidate?.why ? <span className="block text-xs text-[var(--muted)]">{candidate.why}</span> : null}
                        {row.note ? <span className="block text-xs text-[var(--muted)]">{row.note}</span> : null}
                      </label>

                      {row.dbq.length > 0 && (
                        <p className="text-sm text-[var(--muted)]">
                          Exam form:{" "}
                          {row.dbq.map((d, i) => (
                            <span key={d.url}>
                              {i > 0 ? ", " : ""}
                              <a className="underline" href={d.url} target="_blank" rel="noreferrer">
                                {d.title}
                              </a>
                            </span>
                          ))}
                        </p>
                      )}

                      <label className="block space-y-1">
                        <span className="text-sm font-medium">
                          Step 2: Describe it <span className="font-normal text-[var(--muted)]">(optional, but it makes the estimate real)</span>
                        </span>
                        <textarea
                          className="input min-h-28"
                          value={row.details}
                          onChange={(e) => patch(index, { details: e.target.value })}
                          placeholder="How often it happens, how bad it gets, how long it lasts, what you can't do because of it, treatment and medication, tests or imaging you've had, and how it affects work and daily life."
                        />
                        <span className="block text-xs text-[var(--muted)]">
                          Sent to our AI provider to write this analysis. MilVector does not save it. Leave out names, SSNs, and dates of birth.
                        </span>
                      </label>

                      <div className="flex flex-wrap items-center gap-3">
                        <button className="btn btn-primary text-sm" type="button" disabled={row.loading} onClick={() => void analyze(index)}>
                          {row.loading ? "Analyzing…" : row.analysis ? "Analyze Again" : "Analyze This Condition"}
                        </button>
                        {ratingOptions.length > 0 && (
                          <>
                            <label className="flex items-center gap-2 text-sm">
                              <span className="text-[var(--muted)]">Use in combined estimate:</span>
                              <select className="input !w-auto !py-1.5" value={row.rating} onChange={(e) => patch(index, { rating: e.target.value })}>
                                <option value="">Leave out</option>
                                {ratingOptions.map((r) => (
                                  <option key={r} value={r}>
                                    {r}%
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label
                              className="flex items-center gap-1.5 text-sm text-[var(--muted)]"
                              title="Check this for conditions affecting both arms, both legs, or paired muscles on both sides."
                            >
                              <input type="checkbox" checked={row.bilateral} onChange={(e) => patch(index, { bilateral: e.target.checked })} />
                              Both sides (bilateral)
                            </label>
                          </>
                        )}
                      </div>

                      {row.loading && <LoadingBlock task={`Reading the criteria for DC ${row.code}…`} detail="Usually 20 to 40 seconds." />}
                      {row.error && (
                        <ToolAlert variant="error" title="Analysis failed">
                          <p className="text-sm">{row.error}</p>
                        </ToolAlert>
                      )}
                      {row.analysis && !row.loading && <AnalysisView a={row.analysis} />}
                    </>
                  )}
                </div>
              );
            })}

          {!identifying && rows.length === 0 && !error && (
            <div className="tool-empty">
              <p className="font-medium">Your conditions will appear here</p>
              <p className="text-sm">
                List what you plan to claim on the left. For each one you will get the rating code, the criteria for every rating
                level, an exam checklist, your evidence gaps, and an estimated range.
              </p>
              <div className="tool-example">
                <p className="tool-example-kicker">Example</p>
                <p className="mt-2 text-sm font-bold text-[var(--foreground)]">Migraines: DC 8100</p>
                <p className="mt-1 text-sm">
                  30 percent requires characteristic prostrating attacks averaging once a month over the last several months.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
