"use client";

import { FormEvent, useMemo, useState } from "react";
import { DecisionNotice } from "@/components/tools/decision-notice";
import { LoadingBlock } from "@/components/tools/loading-block";
import Link from "next/link";
import { ToolAlert } from "@/components/tools/tool-alert";
import { combineRatings } from "@/lib/va/combined";
import { withBilateralFlags, type Side } from "@/lib/va/bilateral";
import { AnalysisView, rangeText, sideOptions } from "@/components/tools/va-analysis";
import { VA_BATCH as BATCH, VA_MAX as MAX_CONDITIONS, vaAnalyzeBody, vaIdentifyBody, type Analysis, type Identified, type Row, type Source } from "@/lib/chat/va";


// ─── Page ─────────────────────────────────────────────────────────────

// Today's VA Rating Navigator page. Members see it until the chat view opens
// to them (docs/CHAT_TOOLS_PLAN.md, D6); anyone who can see the chat reaches
// this at ?view=classic. Its request bodies come from the same functions the
// chat uses.
export function VaNavigatorClassic({ chatAvailable = false }: { chatAvailable?: boolean }) {
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
          body: JSON.stringify(vaIdentifyBody(batch)),
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
        body: JSON.stringify(vaAnalyzeBody(row)),
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

      <DecisionNotice tool="va" />

      <div className="tool-shell">
        {/* ── INPUT ─────────────────────────────────────────────── */}
        <div className="tool-input-panel">
          {chatAvailable && (
            <ToolAlert variant="info" title="Try the chat view">
              <p className="text-sm">
                The same navigator, as a chat you can ask questions in.{" "}
                <Link href="/app/tools/va-rating-navigator" className="font-semibold underline">
                  Open the chat view
                </Link>
              </p>
            </ToolAlert>
          )}
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
                              {noMatch
                                ? "No matching code found"
                                : `${candidate?.analogous ? "By analogy, " : ""}DC ${row.code}: ${candidate?.title ?? ""}`}
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
                              {candidate?.analogous ? (
                                <ToolAlert variant="info" title="Rated by analogy">
                                  <p className="text-sm">
                                    This condition has no rating code of its own. VA rates conditions like it under the closest
                                    related code (38 CFR 4.20), and this is the one usually used. VA may choose a different one.
                                  </p>
                                </ToolAlert>
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
