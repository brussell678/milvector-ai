"use client";

import { FormEvent, useMemo, useState } from "react";
import { LoadingBlock } from "@/components/tools/loading-block";
import { ToolAlert } from "@/components/tools/tool-alert";
import { combineRatings } from "@/lib/va/combined";
import { withBilateralFlags, type Limb, type Side } from "@/lib/va/bilateral";

// Kept in step with lib/validators/advisors.ts
const BATCH = 20;
const MAX_CONDITIONS = 60;

// ─── Types ────────────────────────────────────────────────────────────

type Candidate = { code: string; title: string; why: string; ratings: number[]; limb: Limb | null };
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
  rating: string; // rating used in the combined estimate, "" = leave out
  side: Side;
};

type Source = { asOf: string; url: string };

// ─── Helpers ──────────────────────────────────────────────────────────

const SIDE_OPTIONS: Record<"upper" | "lower", { value: Side; label: string }[]> = {
  upper: [
    { value: "left-upper", label: "Left arm or hand" },
    { value: "right-upper", label: "Right arm or hand" },
    { value: "both-upper", label: "Both arms" },
  ],
  lower: [
    { value: "left-lower", label: "Left leg or foot" },
    { value: "right-lower", label: "Right leg or foot" },
    { value: "both-lower", label: "Both legs" },
  ],
};

function sideOptions(limb: Limb | null) {
  if (!limb) return [];
  return limb === "either" ? [...SIDE_OPTIONS.upper, ...SIDE_OPTIONS.lower] : SIDE_OPTIONS[limb];
}

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

function Fold({ title, children, open }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="rounded-lg border border-[var(--line)] bg-[var(--surface)]" open={open}>
      <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold">{title}</summary>
      <div className="grid gap-3 border-t border-[var(--line)] p-3">{children}</div>
    </details>
  );
}

const STATUS_LABEL: Record<string, { label: string; badge: string }> = {
  covered: { label: "You covered this", badge: "tool-badge-success" },
  unclear: { label: "Unclear", badge: "tool-badge-warn" },
  missing: { label: "Not mentioned", badge: "tool-badge-error" },
};

function rangeText(a: Analysis) {
  const { low, high } = a.likelyRange;
  if (low === null || high === null) return "No estimate";
  return low === high ? `${low}%` : `${low} to ${high}%`;
}

// The estimate first, then each section folded so one condition never becomes a wall of text.
function AnalysisView({ a }: { a: Analysis }) {
  const hasGaps = a.gaps.described.length + a.gaps.missing.length + a.gaps.weak.length + a.gaps.strengthen.length > 0;
  const hasLanguage = a.criteriaLanguage.lower.length + a.criteriaLanguage.middle.length + a.criteriaLanguage.higher.length > 0;

  return (
    <div className="grid gap-2">
      {a.crisisNote ? (
        <ToolAlert variant="stop" title="You are not alone">
          <p className="text-sm font-medium">{a.crisisNote}</p>
        </ToolAlert>
      ) : null}

      <div className="rounded-xl border border-[var(--accent)] bg-[var(--panel)] p-4">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Likely rating range (estimate)</p>
        <p className="mt-1 text-lg font-bold">{rangeText(a)}</p>
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

      {a.breakdown.length > 0 && (
        <Fold title="Rating criteria, level by level">
          {a.breakdown.map((row, idx) => (
            <div key={idx}>
              <p className="text-sm font-bold">{row.rating} percent</p>
              <p className="mt-0.5 text-sm">{row.criteria}</p>
              {row.evidence ? (
                <p className="mt-1 text-sm text-[var(--muted)]">
                  <span className="font-semibold">Evidence that supports it:</span> {row.evidence}
                </p>
              ) : null}
              {row.examiner ? (
                <p className="mt-0.5 text-sm text-[var(--muted)]">
                  <span className="font-semibold">What the examiner looks for:</span> {row.examiner}
                </p>
              ) : null}
            </div>
          ))}
        </Fold>
      )}

      {hasGaps && (
        <Fold title="Your evidence gaps">
          <Bullets title="What you already described" items={a.gaps.described} />
          <Bullets title="What appears to be missing" items={a.gaps.missing} />
          <Bullets title="Weak points" items={a.gaps.weak} />
          <Bullets title="What would strengthen the record" items={a.gaps.strengthen} />
        </Fold>
      )}

      {a.checklist.items.length > 0 && (
        <Fold title={`Exam form checklist${a.checklist.form ? `: ${a.checklist.form}` : ""}`}>
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
        </Fold>
      )}

      {hasLanguage && (
        <Fold title="What the criteria turn on">
          <p className="text-xs text-[var(--muted)]">
            The regulation&apos;s own distinctions between rating levels. They tell you what to describe accurately, not what to
            say.
          </p>
          <Bullets title="Lower ratings" items={a.criteriaLanguage.lower} />
          <Bullets title="Middle ratings" items={a.criteriaLanguage.middle} />
          <Bullets title="Higher ratings" items={a.criteriaLanguage.higher} />
        </Fold>
      )}

      {a.examPrep.length > 0 && (
        <Fold title="Preparing for the exam">
          <Bullets title="" items={a.examPrep} />
        </Fold>
      )}

      {a.secondary.length > 0 && (
        <Fold title="Possible secondary conditions">
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
        </Fold>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function VaRatingNavigatorPage() {
  const [conditionsText, setConditionsText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [identifying, setIdentifying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patch = (index: number, change: Partial<Row>) => setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...change } : row)));

  const entered = conditionsText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 2);

  async function identify(e: FormEvent) {
    e.preventDefault();
    const conditions = entered.slice(0, MAX_CONDITIONS).map((c) => c.slice(0, 160));
    if (conditions.length === 0) {
      setError("List at least one condition, one per line.");
      return;
    }
    setError(null);
    setRows([]);
    setOpenIndex(null);

    const found: Row[] = [];
    try {
      // Long lists go in batches so each request stays fast and reliable.
      for (let start = 0; start < conditions.length; start += BATCH) {
        const batch = conditions.slice(start, start + BATCH);
        setIdentifying(
          conditions.length > BATCH
            ? `Matching conditions ${start + 1} to ${start + batch.length} of ${conditions.length}…`
            : "Matching your conditions to the rating schedule…"
        );
        const res = await fetch("/api/tools/va-rating-navigator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: "identify", conditions: batch }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(
            `${typeof data.error === "string" ? data.error : "Something went wrong on our end."}${
              found.length ? ` The first ${found.length} conditions are shown below.` : ""
            }`
          );
          break;
        }
        setSource(data.source as Source);
        found.push(
          ...(data.conditions as Identified[]).map((c) => ({
            ...c,
            code: c.candidates[0]?.code ?? "",
            details: "",
            analysis: null,
            loading: false,
            error: null,
            rating: "",
            side: "" as Side,
          }))
        );
        setRows([...found]);
      }
    } catch {
      setError("That didn't go through. Check your connection and try again.");
    } finally {
      setIdentifying(null);
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
          condition: row.input.slice(0, 160),
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
        // If no rating was picked yet, start from the low end of the range: the conservative read.
        rating: row.rating !== "" ? row.rating : analysis.likelyRange.low !== null ? String(analysis.likelyRange.low) : "",
      });
    } catch {
      patch(index, { loading: false, error: "That didn't go through. Check your connection and try again." });
    }
  }

  const combined = useMemo(() => {
    const rated = rows.filter((row) => row.rating !== "").map((row) => ({ rating: Number(row.rating), side: row.side }));
    return rated.length > 0 ? combineRatings(withBilateralFlags(rated)) : null;
  }, [rows]);

  const ratedCount = rows.filter((row) => row.rating !== "").length;

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
                <p className="section-description mt-1">
                  One per line, in your own words. List everything you plan to claim, up to {MAX_CONDITIONS}.
                </p>
              </div>
              <textarea
                className="input min-h-48"
                value={conditionsText}
                onChange={(e) => setConditionsText(e.target.value)}
                placeholder={"Lower back pain\nTinnitus\nRight knee\nLeft knee\nSleep apnea\nMigraines"}
              />
              <p className="text-xs text-[var(--muted)]">
                {entered.length} listed
                {entered.length > MAX_CONDITIONS ? `. Only the first ${MAX_CONDITIONS} will be matched.` : ""}
              </p>
              <button className="btn btn-primary w-full sm:w-auto" type="submit" disabled={!!identifying}>
                {identifying ? "Matching…" : "Find the Rating Codes"}
              </button>
            </form>
          </section>

          {rows.length > 0 && (
            <section className="tool-section lg:sticky lg:top-4">
              <p className="tool-kicker">COMBINED RATING ESTIMATE</p>
              {combined ? (
                <>
                  <p className="text-3xl font-extrabold">{combined.combinedRating}%</p>
                  <p className="text-sm text-[var(--muted)]">
                    From {ratedCount} of {rows.length} conditions. VA does not add ratings together: each one applies to what is
                    left after the one before it. Exact combined value: {combined.combinedValue}.
                  </p>
                  <details>
                    <summary className="cursor-pointer text-xs font-semibold text-[var(--accent)]">Show the math</summary>
                    <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-[var(--muted)]">
                      {combined.steps.map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ol>
                  </details>
                </>
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  Pick a rating on any condition to start the estimate. You do not need to analyze a condition first.
                </p>
              )}
              <p className="text-xs text-[var(--muted)]">Approximate. It uses the ratings you pick, and VA decides the real ones.</p>
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
          {identifying && <LoadingBlock task={identifying} detail="About 15 to 30 seconds for every 20 conditions." />}

          {error && (
            <ToolAlert variant="error" title="Could not finish">
              <p className="text-sm">{error}</p>
            </ToolAlert>
          )}

          {rows.length > 0 && (
            <div className="tool-output-card">
              <div>
                <p className="tool-kicker">STEP 2: YOUR CONDITIONS</p>
                <p className="section-description mt-1">
                  Pick a rating on each row to build your combined estimate. Open a condition to see its criteria, describe your
                  symptoms, and get an estimated range.
                </p>
              </div>

              <div className="grid gap-2">
                {rows.map((row, index) => {
                  const candidate = row.candidates.find((c) => c.code === row.code);
                  const ratingOptions = row.analysis?.allowedRatings.length ? row.analysis.allowedRatings : candidate?.ratings ?? [];
                  const sides = sideOptions(candidate?.limb ?? null);
                  const open = openIndex === index;
                  const noMatch = row.candidates.length === 0;

                  return (
                    <div
                      key={`${row.input}-${index}`}
                      className={`rounded-xl border ${open ? "border-[var(--accent)] bg-[var(--panel)]" : "border-[var(--line)] bg-[var(--surface)]"}`}
                    >
                      {/* Row summary: always visible */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-start gap-2 text-left"
                          aria-expanded={open}
                          onClick={() => setOpenIndex(open ? null : index)}
                        >
                          <span className="mt-0.5 w-5 shrink-0 text-xs font-bold text-[var(--muted)]">{index + 1}</span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold leading-tight">{row.input}</span>
                            <span className="block truncate text-xs text-[var(--muted)]">
                              {noMatch ? "No matching code found" : `DC ${row.code}: ${candidate?.title ?? ""}`}
                            </span>
                          </span>
                        </button>

                        {row.analysis && (
                          <span className="tool-badge tool-badge-success shrink-0" style={{ fontSize: "0.62rem" }} title="Estimated range from your description">
                            Est. {rangeText(row.analysis)}
                          </span>
                        )}

                        {sides.length > 0 && (
                          <select
                            className="input !w-auto !py-1.5 text-sm"
                            value={row.side}
                            onChange={(e) => patch(index, { side: e.target.value as Side })}
                            aria-label={`Which side, for ${row.input}`}
                            title="Arms and legs only. When both sides are rated, VA adds a bilateral factor."
                          >
                            <option value="">Which side?</option>
                            {sides.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        )}

                        {ratingOptions.length > 0 && (
                          <select
                            className="input !w-auto !py-1.5 text-sm"
                            value={row.rating}
                            onChange={(e) => patch(index, { rating: e.target.value })}
                            aria-label={`Rating to use for ${row.input}`}
                          >
                            <option value="">Rating</option>
                            {ratingOptions.map((r) => (
                              <option key={r} value={r}>
                                {r}%
                              </option>
                            ))}
                          </select>
                        )}

                        <button
                          type="button"
                          className="shrink-0 text-xs font-semibold text-[var(--accent)] hover:underline"
                          onClick={() => setOpenIndex(open ? null : index)}
                        >
                          {open ? "Close" : "Details"}
                        </button>
                      </div>

                      {/* Expanded detail: one condition at a time */}
                      {open && (
                        <div className="grid gap-4 border-t border-[var(--line)] p-3">
                          {row.plainLanguage ? <p className="text-sm text-[var(--muted)]">{row.plainLanguage}</p> : null}

                          {noMatch ? (
                            <ToolAlert variant="warn" title="No matching code found">
                              <p className="text-sm">
                                {row.note || "Nothing in the rating schedule clearly matches this wording."} Try the medical name of
                                the condition, or ask a Veterans Service Officer how it would be rated.
                              </p>
                            </ToolAlert>
                          ) : (
                            <>
                              {row.candidates.length > 1 ? (
                                <label className="block space-y-1">
                                  <span className="text-sm font-medium">Rating code</span>
                                  <select
                                    className="input"
                                    value={row.code}
                                    onChange={(e) => patch(index, { code: e.target.value, analysis: null, rating: "", side: "" })}
                                  >
                                    {row.candidates.map((c) => (
                                      <option key={c.code} value={c.code}>
                                        DC {c.code}: {c.title}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : null}
                              {candidate?.why || row.note ? (
                                <p className="text-xs text-[var(--muted)]">{[candidate?.why, row.note].filter(Boolean).join(" ")}</p>
                              ) : null}

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
                                  Describe it <span className="font-normal text-[var(--muted)]">(optional, but it makes the estimate real)</span>
                                </span>
                                <textarea
                                  className="input min-h-28"
                                  value={row.details}
                                  onChange={(e) => patch(index, { details: e.target.value })}
                                  placeholder="How often it happens, how bad it gets, how long it lasts, what you can't do because of it, treatment and medication, tests or imaging you've had, and how it affects work and daily life."
                                />
                                <span className="block text-xs text-[var(--muted)]">
                                  Sent to our AI provider to write this analysis. MilVector does not save it. Leave out names, SSNs,
                                  and dates of birth.
                                </span>
                              </label>

                              <div>
                                <button className="btn btn-primary text-sm" type="button" disabled={row.loading} onClick={() => void analyze(index)}>
                                  {row.loading ? "Analyzing…" : row.analysis ? "Analyze Again" : "Analyze This Condition"}
                                </button>
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
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!identifying && rows.length === 0 && !error && (
            <div className="tool-empty">
              <p className="font-medium">Your conditions will appear here</p>
              <p className="text-sm">
                List everything you plan to claim on the left. You will get a compact list with the rating code for each one. Pick
                ratings to estimate your combined rating, and open any condition for its criteria, an exam checklist, your evidence
                gaps, and an estimated range.
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
