"use client";

import { useState } from "react";
import { Check, Download } from "lucide-react";
import { LoadingBlock } from "@/components/tools/loading-block";
import { MasterResumePicker } from "@/components/tools/master-resume-picker";
import { ToolAlert } from "@/components/tools/tool-alert";
import type { FitMap, TargetedResume, TargetedRole } from "@/lib/resume/build";
import type { Finding } from "@/lib/resume/gates";
import type { MasterOption } from "@/lib/master-resume";
import type { FigureCheck } from "@/lib/resume/targeting";
import { CorrectionsList, ReviewCard, type Correction, type ReviewState } from "@/components/tools/resume-review";
import { PASTE_LIMIT, POSTING_LIMIT } from "@/lib/resume/limits";

// The rebuilt Targeted Resume Builder. Works only from the member's own master
// resume: the fit comes first, gaps send the member back to their master, and
// every line with a figure, or with wording the master does not use, is
// marked Correct or fixed before the Word file downloads.

type MasterInfo = { name: string; origin: string; roles: number; lines: number; dropped: number; notes: string[] };
type FitResult = { master: MasterInfo; fitMap: FitMap; cited: Record<string, string>; corrections?: Correction[] };
type BuildResult = {
  master: MasterInfo;
  resume: TargetedResume & { jobs: TargetedRole[]; projects: TargetedRole[] };
  findings: Finding[];
  gateSummary: { pass: number; warn: number; fail: number };
  figures: FigureCheck[];
  notes: { summaryRewritten: boolean; filled: number; closedGaps: number };
  contactMissing?: boolean;
  fileName: string;
  documentId: string;
  artifactId: string | null;
  corrections?: Correction[];
};

/** The resume shown on screen with one line replaced, after a review fix. */
function withLine(resume: BuildResult["resume"], oldText: string, newText: string): BuildResult["resume"] {
  const same = (a: string) => a.replace(/\s+/g, " ").trim() === oldText.replace(/\s+/g, " ").trim();
  const swap = <T extends { bullets: { text: string }[] }>(groups: T[]) => groups.map((g) => ({ ...g, bullets: g.bullets.map((b) => (same(b.text) ? { ...b, text: newText } : b)) }));
  return {
    ...resume,
    summary: resume.summary.includes(oldText) ? resume.summary.replace(oldText, newText).replace(/\s{2,}/g, " ").trim() : resume.summary,
    highlights: swap(resume.highlights ?? []),
    jobs: swap(resume.jobs),
    projects: swap(resume.projects),
  };
}

const FRIENDLY_ERROR = "Something went wrong on our end. Your work is still here. Try again in a few seconds.";

const VERDICT: Record<string, { label: string; badge: string }> = {
  apply: { label: "Apply", badge: "tool-badge-success" },
  stretch: { label: "A stretch worth weighing", badge: "tool-badge-warn" },
  pass: { label: "Probably not this one", badge: "tool-badge-error" },
};
const ASSESSMENT: Record<string, { label: string; badge: string }> = {
  strong: { label: "Strong", badge: "tool-badge-success" },
  met: { label: "Met", badge: "tool-badge-success" },
  partial: { label: "Partial", badge: "tool-badge-warn" },
  gap: { label: "Gap", badge: "tool-badge-error" },
};
const LEVEL: Record<string, { label: string; badge: string }> = {
  pass: { label: "Pass", badge: "tool-badge-success" },
  warn: { label: "Fixed", badge: "tool-badge-warn" },
  fail: { label: "Needs you", badge: "tool-badge-error" },
};

async function post<T>(body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/tools/targeted-resume", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: typeof data.error === "string" ? data.error : FRIENDLY_ERROR };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "That didn't go through. Check your connection and try again." };
  }
}

function masterDownload(master: MasterOption | null): string | null {
  if (!master) return null;
  return master.kind === "document" ? `/api/documents/${master.id}/download` : `/api/resume-artifacts/${master.id}/download?format=docx`;
}

/**
 * What the box holds, so a member can tell the whole paste went in: its size,
 * and its last words to compare with the end of what they copied.
 */
function PasteCheck({ id, text, limit, what }: { id: string; text: string; limit: number; what: string }) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const words = trimmed.split(/\s+/).length;
  const over = trimmed.length - limit;
  const tail = trimmed.replace(/\s+/g, " ").slice(-70);
  return (
    <p id={id} className="text-xs text-[var(--muted)]" aria-live="polite">
      {trimmed.length.toLocaleString("en-US")} characters, about {words.toLocaleString("en-US")} words.{" "}
      {over > 0 ? (
        <span className="tool-text-error font-semibold">
          That is {over.toLocaleString("en-US")} over the {limit.toLocaleString("en-US")} limit for {what}. Cut the benefits and company boilerplate and keep the duties and requirements.
        </span>
      ) : (
        <>
          Ends with: <span className="text-[var(--foreground)]">{trimmed.length > 70 ? "..." : ""}{tail}</span>
        </>
      )}
    </p>
  );
}

function RoleBlock({ role }: { role: TargetedRole }) {
  return (
    <div className="mt-4">
      <p className="text-sm font-bold">{role.title}</p>
      {(role.organization || role.dates) && <p className="text-xs italic text-[var(--muted)]">{[role.organization, role.dates].filter(Boolean).join(" | ")}</p>}
      <ul className="mt-1.5 grid gap-1.5">
        {role.bullets.map((b, i) => (
          <li key={i} className="text-sm">
            • {b.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TargetedResumeBuilder({ initialTitle = "", initialPosting = "" }: { initialTitle?: string; initialPosting?: string } = {}) {
  const [master, setMaster] = useState<MasterOption | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [jobTitle, setJobTitle] = useState(initialTitle);
  const [company, setCompany] = useState("");
  const [posting, setPosting] = useState(initialPosting);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fit, setFit] = useState<FitResult | null>(null);
  const [built, setBuilt] = useState<BuildResult | null>(null);
  const [review, setReview] = useState<Record<number, ReviewState>>({});
  // Corrections saved in this visit, shown in step 1 before the next build lists them.
  const [savedCorrections, setSavedCorrections] = useState<Correction[]>([]);

  const source = pasting ? "paste" : "master";
  const haveSource = pasting ? pastedText.trim().length >= 100 && pastedText.trim().length <= PASTE_LIMIT : !!master;
  const postingOk = posting.trim().length >= 100 && posting.trim().length <= POSTING_LIMIT;
  const ready = haveSource && jobTitle.trim().length >= 2 && postingOk && !busy;
  const body = () => ({ source, masterRef: pasting ? null : master?.ref, pastedText: pasting ? pastedText : null, jobTitle, company: company || null, jobDescriptionText: posting });

  // A new master, paste, or posting makes earlier results stale.
  const reset = () => {
    setFit(null);
    setBuilt(null);
    setReview({});
  };

  async function checkFit() {
    setError(null);
    reset();
    setBusy("Reading your master and mapping the posting against it...");
    const res = await post<FitResult>({ stage: "fit", ...body() });
    setBusy(null);
    if (!res.ok) return setError(res.error);
    setFit(res.data);
  }

  async function build() {
    setError(null);
    setBuilt(null);
    setReview({});
    setBusy("Writing your resume from your master and checking every line...");
    const res = await post<BuildResult>({ stage: "build", ...body(), fitMap: fit?.fitMap });
    setBusy(null);
    if (!res.ok) return setError(res.error);
    setBuilt(res.data);
  }

  const figureCount = built?.figures.length ?? 0;
  const reviewedCount = Object.keys(review).length;
  const allChecked = !!built && reviewedCount >= figureCount;
  const corrections = [...(built?.corrections ?? fit?.corrections ?? []), ...savedCorrections].filter((c, i, all) => all.findIndex((x) => x.newLine === c.newLine) === i);
  const download = masterDownload(master);

  return (
    <div className="flex flex-col gap-6">
      {/* ── STEP 1: MASTER ─────────────────────────────────────── */}
      <section className="tool-output-card">
        <div>
          <p className="tool-kicker">STEP 1: YOUR MASTER RESUME</p>
          <p className="section-title mt-0.5">Every line of your targeted resume comes from it</p>
          <p className="section-description">Refine it first. A figure or claim that is out of date in your master will be out of date in every resume built from it.</p>
        </div>
        {!pasting && (
          <MasterResumePicker
            onSelect={(option) => {
              if (option?.ref !== master?.ref) reset();
              setMaster(option);
            }}
            purpose="The posting is compared with this resume, and the targeted resume is written only from it."
          />
        )}
        {!pasting && <CorrectionsList corrections={corrections} />}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={pasting}
            onChange={(e) => {
              setPasting(e.target.checked);
              reset();
            }}
          />
          <span>Paste a resume for this one run instead</span>
        </label>
        {pasting && (
          <>
            <textarea
              className="input min-h-56 resize-y"
              value={pastedText}
              onChange={(e) => {
                setPastedText(e.target.value);
                reset();
              }}
              aria-label="Resume to work from"
              aria-describedby="pasted-check"
              placeholder="Paste the whole resume you want this one built from."
            />
            <PasteCheck id="pasted-check" text={pastedText} limit={PASTE_LIMIT} what="a resume" />
          </>
        )}
      </section>

      {/* ── STEP 2: THE JOB ────────────────────────────────────── */}
      <section className="tool-output-card">
        <div>
          <p className="tool-kicker">STEP 2: THE JOB</p>
          <p className="section-title mt-0.5">The posting you are applying to</p>
          <p className="section-description">
            Not sure this is the right job to aim at?{" "}
            <a className="font-semibold underline" href="/app/tools/jd-decoder">
              Decode the posting first
            </a>
            : what it really asks for, the level it implies, and how you fit.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Job title</span>
            <input className="input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Director of AI Transformation" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Company (optional)</span>
            <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Full job posting</span>
          <textarea
            className="input min-h-72 resize-y"
            value={posting}
            onChange={(e) => {
              setPosting(e.target.value);
              if (fit) reset();
            }}
            aria-describedby="posting-check"
            placeholder="Paste the whole posting: duties, requirements, and qualifications. The box grows if you drag its corner."
          />
        </label>
        <PasteCheck id="posting-check" text={posting} limit={POSTING_LIMIT} what="a posting" />
        <button className="btn btn-primary w-full text-sm sm:w-auto" type="button" disabled={!ready} onClick={() => void checkFit()}>
          {fit ? "Check My Fit Again" : "Check My Fit"}
        </button>
        {!haveSource && <p className="text-xs text-[var(--muted)]">{pasting ? "Paste the resume to work from first." : "Choose your master resume first."}</p>}
      </section>

      {busy && <LoadingBlock task={busy} detail="Usually 20 to 60 seconds. Keep this page open." />}
      {error && (
        <ToolAlert variant="error" title="Could not finish">
          <p className="text-sm">{error}</p>
        </ToolAlert>
      )}

      {/* ── STEP 3: FIT ────────────────────────────────────────── */}
      {fit && !busy && (
        <section className="tool-output-card">
          <div>
            <p className="tool-kicker">STEP 3: YOUR FIT</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className={`tool-badge ${VERDICT[fit.fitMap.recommendation]?.badge ?? ""}`}>{VERDICT[fit.fitMap.recommendation]?.label ?? fit.fitMap.recommendation}</span>
            </div>
            <p className="mt-2 text-sm">{fit.fitMap.reason}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Required: {fit.fitMap.counts.mandatory.strong + fit.fitMap.counts.mandatory.met} covered, {fit.fitMap.counts.mandatory.partial} partial, {fit.fitMap.counts.mandatory.gap} gap.
              Preferred: {fit.fitMap.counts.preferred.strong + fit.fitMap.counts.preferred.met} covered, {fit.fitMap.counts.preferred.partial} partial, {fit.fitMap.counts.preferred.gap} gap.
              Read from {fit.master.name}: {fit.master.roles} roles, {fit.master.lines} lines.
            </p>
          </div>
          {fit.master.notes.length > 0 && (
            <ToolAlert variant="info" title="About your master">
              <ul className="list-disc pl-5 text-sm">
                {fit.master.notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </ToolAlert>
          )}
          <ul className="grid gap-2">
            {fit.fitMap.requirements.map((r, i) => {
              const a = ASSESSMENT[r.assessment] ?? ASSESSMENT.gap;
              const short = r.assessment === "gap" || r.assessment === "partial";
              return (
                <li key={i} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-sm font-medium">
                      {r.requirement} <span className="text-xs font-normal text-[var(--muted)]">({r.type === "mandatory" ? "required" : "preferred"})</span>
                    </p>
                    <span className={`tool-badge ${a.badge} shrink-0`} style={{ fontSize: "0.62rem" }}>
                      {a.label}
                    </span>
                  </div>
                  {r.evidence.length > 0 && (
                    <ul className="mt-2 grid gap-1 border-l-2 border-[var(--line)] pl-3">
                      {r.evidence.map((id) =>
                        fit.cited[id] ? (
                          <li key={id} className="text-xs text-[var(--muted)]">
                            {fit.cited[id]}
                          </li>
                        ) : null,
                      )}
                    </ul>
                  )}
                  {r.bridge && <p className="mt-2 text-sm">{r.bridge}</p>}
                  {short && (
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      Have you done this? Add it to your master in Word, upload it to My Files, choose it as your master, and check your fit again. If not, be ready to speak to it.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary text-sm" type="button" disabled={!ready} onClick={() => void build()}>
              {built ? "Build It Again" : "Build My Resume"}
            </button>
            {download && !pasting && (
              <a className="btn btn-secondary text-sm" href={download}>
                <Download size={14} aria-hidden="true" />
                Download my master to edit
              </a>
            )}
          </div>
        </section>
      )}

      {/* ── STEP 4: RESUME ─────────────────────────────────────── */}
      {built && !busy && (
        <section className="tool-output-card">
          <div>
            <p className="tool-kicker">STEP 4: YOUR RESUME</p>
            <p className="text-sm text-[var(--muted)]">
              {built.gateSummary.pass} checks passed, {built.gateSummary.warn} fixed automatically, {built.gateSummary.fail} need you. About {built.resume.estimatedPages.toFixed(1)} pages.
              {built.notes.filled > 0 ? ` Added ${built.notes.filled} bullet(s) from your master to fill it out.` : ""}
              {built.notes.closedGaps > 0 ? ` Added ${built.notes.closedGaps} job(s) from your master so your timeline has no gap.` : ""}
              {built.notes.summaryRewritten ? " The summary was rewritten once to keep it to what your master supports." : ""}
            </p>
          </div>

          {/* Check every line before you send */}
          <div className="grid gap-3 rounded-xl border-2 border-[var(--accent)] p-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--accent)]">Check every line before you send</p>
              {figureCount > 0 ? (
                <p className="mt-1 text-sm">
                  <span className="font-semibold">Your Word file unlocks once every line below is marked Correct or fixed.</span> Each one has a figure, or wording your master does not use; your master&apos;s line is under it. A master can drift out of date, so mark a line Correct only if it is true today. {reviewedCount} of {figureCount} done.
                </p>
              ) : (
                <p className="mt-1 text-sm">Your Word file is ready below.</p>
              )}
            </div>
            {figureCount === 0 ? (
              <p className="text-sm text-[var(--muted)]">No line in this resume needs a check.</p>
            ) : (
              <ul className="grid gap-2">
                {built.figures.map((item, i) => (
                  <ReviewCard
                    key={`${i}-${item.text}`}
                    item={item}
                    state={review[i]}
                    artifactId={built.artifactId}
                    fromPaste={pasting}
                    onCorrect={() => setReview((prev) => ({ ...prev, [i]: { status: "correct" } }))}
                    onFixed={(fix) => {
                      setBuilt((prev) =>
                        prev
                          ? { ...prev, resume: withLine(prev.resume, fix.oldText, fix.newText), figures: prev.figures.map((f, j) => (j === i ? (fix.item ?? { ...f, text: fix.newText }) : f)) }
                          : prev,
                      );
                      setReview((prev) => ({ ...prev, [i]: { status: "fixed", note: fix.note } }));
                      if (fix.correction) setSavedCorrections((prev) => [...prev, fix.correction!]);
                    }}
                  />
                ))}
              </ul>
            )}
            <div>
              {allChecked ? (
                <a className="btn btn-primary text-sm" href={`/api/documents/${built.documentId}/download`}>
                  <Download size={14} aria-hidden="true" />
                  Download Word File
                </a>
              ) : (
                <button className="btn btn-primary text-sm" type="button" disabled>
                  Check each line to download ({reviewedCount} of {figureCount})
                </button>
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">What the checks did</p>
            <ul className="grid gap-1.5">
              {built.findings.map((f, i) => {
                const level = LEVEL[f.level] ?? LEVEL.pass;
                return (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <span className={`tool-badge ${level.badge} mt-0.5 shrink-0`} style={{ fontSize: "0.62rem" }}>
                      {level.label}
                    </span>
                    <span>
                      <span className="font-semibold">{f.check}.</span> <span className="text-[var(--muted)]">{f.detail}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="tool-resume-preview">
            {built.resume.targetTitle && <p className="font-bold">{built.resume.targetTitle}</p>}
            {built.resume.tagline && <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--muted)]">{built.resume.tagline}</p>}
            {built.resume.summary && <p className="mt-2 text-sm">{built.resume.summary}</p>}
            {built.resume.skills.length > 0 && <p className="mt-2 text-sm text-[var(--muted)]">{built.resume.skills.join(" | ")}</p>}
            {(built.resume.highlights ?? []).map((group) => (
              <div key={group.heading} className="mt-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">{group.heading}</p>
                <ul className="mt-1.5 grid gap-1.5">
                  {group.bullets.map((b, i) => (
                    <li key={i} className="text-sm">
                      • {b.text}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {built.resume.jobs.map((role) => (
              <RoleBlock key={role.roleId} role={role} />
            ))}
            {built.resume.projects.length > 0 && (
              <>
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Selected projects</p>
                {built.resume.projects.map((role) => (
                  <RoleBlock key={role.roleId} role={role} />
                ))}
              </>
            )}
            {[...built.resume.education, ...built.resume.certifications, ...built.resume.training].length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-bold">Education and professional development</p>
                <ul className="mt-1 grid gap-1 text-sm">
                  {[...built.resume.education, ...built.resume.certifications, ...built.resume.training].map((item, i) => (
                    <li key={i}>• {item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {built.resume.gaps.length > 0 && (
            <ToolAlert variant="info" title="Gaps to be ready for">
              <ul className="list-disc pl-5 text-sm">
                {built.resume.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </ToolAlert>
          )}
          {built.contactMissing && (
            <ToolAlert variant="info" title="Your name is not on it yet">
              <p className="text-sm">
                The Word file&apos;s header (your name, phone, email, and LinkedIn) comes from your{" "}
                <a className="font-semibold underline" href="/app/profile">
                  Profile
                </a>
                , and it is empty. Add them there, then download again. The file picks them up.
              </p>
            </ToolAlert>
          )}
          <p className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <Check size={14} aria-hidden="true" />
            Saved to My Files as {built.fileName}.
          </p>
        </section>
      )}
    </div>
  );
}
