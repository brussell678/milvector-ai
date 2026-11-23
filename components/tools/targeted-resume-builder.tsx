"use client";

import { useState } from "react";
import { Check, Download } from "lucide-react";
import { LoadingBlock } from "@/components/tools/loading-block";
import { MasterResumePicker } from "@/components/tools/master-resume-picker";
import { ToolAlert } from "@/components/tools/tool-alert";
import type { FitResult, SavedFit } from "@/lib/resume/fit-check";
import { FitMapView } from "@/components/tools/fit-map-view";
import type { MasterOption } from "@/lib/master-resume";
import { CorrectionsList, ReviewCard, type Correction, type ReviewState } from "@/components/tools/resume-review";
import { ResumePreview } from "@/components/tools/resume-preview";
import { withLine, type BuildResult } from "@/lib/resume/build-result";
import { resumeBody, type ResumeJob } from "@/lib/chat/resume";
import { PASTE_LIMIT, POSTING_LIMIT } from "@/lib/resume/limits";
import { JobLinkField, postingSummary, readPostingFromLink, type LoadedPosting } from "@/components/tools/job-link-field";

// The rebuilt Targeted Resume Builder. Works only from the member's own master
// resume: the fit comes first, gaps send the member back to their master, and
// every line with a figure, or with wording the master does not use, is
// marked Correct or fixed before the Word file downloads.

const BUILD_BUSY = "Writing your resume from your master and checking every line...";
const FRIENDLY_ERROR = "Something went wrong on our end. Your work is still here. Try again in a few seconds.";

export const LEVEL: Record<string, { label: string; badge: string }> = {
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
export function PasteCheck({ id, text, limit, what }: { id: string; text: string; limit: number; what: string }) {
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

// initialFit: the fit a JD Decoder run checked. It is shown, not checked again,
// while the member keeps the same master and posting. initialBuild: a saved
// resume reopened at its review (?review=), with the marks already made.
export function TargetedResumeBuilder({
  initialTitle = "",
  initialPosting = "",
  initialCompany = "",
  initialFit = null,
  initialBuild = null,
}: {
  initialTitle?: string;
  initialPosting?: string;
  initialCompany?: string;
  initialFit?: SavedFit | null;
  initialBuild?: { built: BuildResult; review: Record<number, ReviewState> } | null;
} = {}) {
  const [master, setMaster] = useState<MasterOption | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [jobTitle, setJobTitle] = useState(initialTitle);
  const [company, setCompany] = useState(initialCompany);
  const [posting, setPosting] = useState(initialPosting);
  const [link, setLink] = useState("");
  // What the link filled in, so a new link clears it but anything typed stays.
  const [fromLink, setFromLink] = useState<LoadedPosting | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fit, setFit] = useState<FitResult | null>(null);
  const [built, setBuilt] = useState<BuildResult | null>(initialBuild?.built ?? null);
  const [review, setReview] = useState<Record<number, ReviewState>>(initialBuild?.review ?? {});
  // Corrections saved in this visit, shown in step 1 before the next build lists them.
  const [savedCorrections, setSavedCorrections] = useState<Correction[]>([]);

  const source = pasting ? "paste" : "master";
  const haveSource = pasting ? pastedText.trim().length >= 100 && pastedText.trim().length <= PASTE_LIMIT : !!master;
  const postingOk = posting.trim().length >= 100 && posting.trim().length <= POSTING_LIMIT;
  // A link with an empty posting box is read when the member checks the fit.
  const linkOnly = !posting.trim() && link.trim().length > 0;
  const ready = haveSource && ((jobTitle.trim().length >= 2 && postingOk) || linkOnly) && !busy;
  // One function builds the request for this page and the chat, so both send the same thing.
  const job = (j = { jobTitle, company, posting }): ResumeJob => ({ source, masterRef: master?.ref, pastedText, jobTitle: j.jobTitle, company: j.company, posting: j.posting });

  function changeLink(value: string) {
    setLink(value);
    setLinkError(null);
    if (fromLink) {
      if (posting === fromLink.text) setPosting("");
      if (jobTitle === (fromLink.title ?? "")) setJobTitle("");
      if (company === (fromLink.company ?? "")) setCompany("");
      setFromLink(null);
      reset();
    }
  }

  // A new master, paste, or posting makes earlier results stale.
  const reset = () => {
    setFit(null);
    setBuilt(null);
    setReview({});
  };

  async function checkFit() {
    setError(null);
    setLinkError(null);
    reset();
    let fresh = { jobTitle, company, posting };
    if (linkOnly) {
      setBusy("Reading the job posting from your link...");
      const read = await readPostingFromLink(link);
      if (!read.ok) {
        setBusy(null);
        return setLinkError(read.error);
      }
      fresh = {
        jobTitle: jobTitle.trim() || read.posting.title || "",
        company: company.trim() || read.posting.company || "",
        posting: read.posting.text,
      };
      setPosting(fresh.posting);
      setJobTitle(fresh.jobTitle);
      setCompany(fresh.company);
      setFromLink(read.posting);
      if (fresh.jobTitle.trim().length < 2) {
        setBusy(null);
        return setLinkError("We read the posting but not its job title. Type the job title above, then tap Check My Fit.");
      }
    }
    setBusy("Reading your master and mapping the posting against it...");
    const res = await post<FitResult>(resumeBody("fit", job(fresh)));
    setBusy(null);
    if (!res.ok) return setError(res.error);
    setFit(res.data);
  }

  async function build() {
    setError(null);
    setBuilt(null);
    setReview({});
    setBusy(BUILD_BUSY);
    const res = await post<BuildResult>(resumeBody("build", job(), fit?.fitMap));
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
              // A different master makes results stale. The first report, as the
              // page opens, does not, so a reopened review (?review=) stays.
              if (master && option?.ref !== master.ref) reset();
              setMaster(option);
              if (initialFit && option?.ref === initialFit.sourceRef && posting === initialPosting && !built) setFit(initialFit);
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
        <JobLinkField value={link} onChange={changeLink} disabled={!!busy} note={fromLink ? postingSummary(fromLink) : null} error={linkError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Job title{linkOnly ? " (or leave empty to use the link)" : ""}</span>
            <input className="input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Director of AI Transformation" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Company (optional)</span>
            <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Full job posting{linkOnly ? " (or leave empty to use the link)" : ""}</span>
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

      {busy && <LoadingBlock task={busy} detail={busy === BUILD_BUSY ? "Usually one to two minutes. Keep this page open." : "Usually under a minute. Keep this page open."} />}
      {error && (
        <ToolAlert variant="error" title="Could not finish">
          <p className="text-sm">{error}</p>
        </ToolAlert>
      )}

      {/* ── STEP 3: FIT ────────────────────────────────────────── */}
      {fit && !busy && (
        <FitMapView
          fit={fit}
          kicker="STEP 3: YOUR FIT"
          gapHint="Have you done this? Add it to your master in Word, upload it to My Files, choose it as your master, and check your fit again. If not, be ready to speak to it."
        >
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
        </FitMapView>
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

          <ResumePreview resume={built.resume} />

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
            {allChecked ? `Saved to My Files as ${built.fileName}.` : `Saved to My Files as ${built.fileName}. It downloads once every line above is checked.`}
          </p>
        </section>
      )}
    </div>
  );
}
