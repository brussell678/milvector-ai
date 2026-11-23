"use client";

import { FormEvent, Fragment, useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, ClipboardPaste, Download, FileText, Hammer, Search } from "lucide-react";
import { BotMessage } from "@/components/chat/bot-message";
import { ChatShell } from "@/components/chat/chat-shell";
import { ChatText } from "@/components/chat/chat-text";
import { CHAT_ERRORS, newId, readChat, useBrowserReady, useChatSession, type ChatMessage, type StoredChat } from "@/components/chat/use-chat-session";
import { FitMapView } from "@/components/tools/fit-map-view";
import { JobLinkField, postingSummary, readPostingFromLink, type LoadedPosting } from "@/components/tools/job-link-field";
import { LoadingBlock } from "@/components/tools/loading-block";
import { MasterResumePicker, originLine } from "@/components/tools/master-resume-picker";
import { CorrectionsList, ReviewCard } from "@/components/tools/resume-review";
import { ResumePreview } from "@/components/tools/resume-preview";
import { LEVEL, PasteCheck } from "@/components/tools/targeted-resume-builder";
import { spotPosting } from "@/lib/chat/jd";
import { EMPTY_RESUME_CONTEXT, jobHeadline, resumeBody, resumeContext, resumeSuggestions, type ResumeChatContext, type ResumeJob, type ResumeResult, type ResumeRun } from "@/lib/chat/resume";
import { resumeTranscript } from "@/lib/chat/resume-transcript";
import { CHAT_MESSAGE_CHARS } from "@/lib/chat/tools";
import { reviewCount, withLine, type BuildResult, type Correction, type ReviewState } from "@/lib/resume/build-result";
import type { FitResult, SavedFit } from "@/lib/resume/fit-check";
import { PASTE_LIMIT, POSTING_LIMIT } from "@/lib/resume/limits";
import type { SavedBuild } from "@/lib/resume/saved-build";
import type { MasterOption } from "@/lib/master-resume";

// The Targeted Resume Builder as a chat (docs/CHAT_TOOLS_PLAN.md, Phase 3).
// Check my fit and Build post the same bodies to the same route as the
// classic page; every check is untouched. The line review runs one line at a
// time (D14) and is saved, so the Word file downloads only once every line is
// marked (D15). The chat never changes resume wording (D8).

type Msg = ChatMessage<ResumeResult, ResumeRun>;
type Form = { pasting: boolean; pastedText: string; link: string; jobTitle: string; company: string; posting: string };
type Extra = { form: Form; collapsed: boolean; savedCorrections: Correction[] };
type BuildMsg = Extract<Msg, { kind: "result" }> & { result: Extract<ResumeResult, { type: "build" }> };
type FitMsg = Extract<Msg, { kind: "result" }> & { result: Extract<ResumeResult, { type: "fit" }> };

const EMPTY_FORM: Form = { pasting: false, pastedText: "", link: "", jobTitle: "", company: "", posting: "" };
const GAP_HINT = "Have you done this? Add it to your master in Word, upload it to My Files, choose it as your master, and check your fit again. If not, be ready to speak to it.";
const RUN_STOPPED = "Stopped. If it had already started on our end, it may still count as one of today's runs.";

function PageHead() {
  return (
    <header className="chat-page-head">
      <div className="min-w-0">
        <p className="tool-kicker">TARGETED RESUME BUILDER</p>
        <h1 className="chat-page-title">A resume for one job, written only from your master</h1>
      </div>
      <Link href="/app/tools/resume-targeter?view=classic" className="text-xs font-semibold text-[var(--muted)] underline">
        Classic view
      </Link>
    </header>
  );
}

function masterDownload(master: MasterOption | null): string | null {
  if (!master) return null;
  return master.kind === "document" ? `/api/documents/${master.id}/download` : `/api/resume-artifacts/${master.id}/download?format=docx`;
}

const isFit = (m: Msg): m is FitMsg => m.role === "assistant" && m.kind === "result" && m.result.type === "fit";
const isBuild = (m: Msg): m is BuildMsg => m.role === "assistant" && m.kind === "result" && m.result.type === "build";

function Fold({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <details className="rounded-lg border border-[var(--line)] bg-[var(--panel)]">
      <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold">
        {title} {count !== undefined && <span className="font-normal text-[var(--muted)]">({count})</span>}
      </summary>
      <div className="chat-msg-body border-t border-[var(--line)] p-3">{children}</div>
    </details>
  );
}

type Props = { userId: string; initialTitle: string; initialPosting: string; initialFit: SavedFit | null; initialReview: SavedBuild | null };

// The chat is kept in the browser, so it renders once the browser is ready.
export function ResumeChat(props: Props) {
  const ready = useBrowserReady();
  if (!ready) {
    return (
      <main className="page-shell chat-page">
        <PageHead />
        <section className="chat-inputs min-h-24" aria-hidden="true" />
        <section className="chat-box" aria-hidden="true" />
      </main>
    );
  }
  return <ResumeChatSession {...props} />;
}

function ResumeChatSession({ userId, initialTitle, initialPosting, initialFit, initialReview }: Props) {
  // The chat on this device, plus a saved resume reopened at its review
  // (?review=) when the chat does not hold it already.
  const [stored] = useState<StoredChat<ResumeResult, ResumeRun, Extra> | null>(() => {
    const kept = readChat<ResumeResult, ResumeRun, Extra>("resume_targeter", userId);
    if (!initialReview) return kept;
    const has = kept?.messages.some((m) => isBuild(m) && m.result.built.artifactId === initialReview.built.artifactId);
    if (has) return kept;
    const job: ResumeJob = { source: "master", jobTitle: initialReview.jobTitle, company: initialReview.company, posting: initialReview.posting };
    const reopened: Msg = { id: newId(), role: "assistant", kind: "result", result: { type: "build", built: initialReview.built, review: initialReview.review }, inputs: { job } };
    return {
      v: 1,
      savedAt: Date.now(),
      messages: [...(kept?.messages ?? []), reopened],
      extra: kept?.extra ?? { form: { ...EMPTY_FORM, jobTitle: initialReview.jobTitle, company: initialReview.company, posting: initialReview.posting }, collapsed: true, savedCorrections: [] },
    };
  });
  const linked = !!(initialTitle || initialPosting);
  const [form, setForm] = useState<Form>(() =>
    linked ? { ...(stored?.extra.form ?? EMPTY_FORM), jobTitle: initialTitle || stored?.extra.form.jobTitle || "", posting: initialPosting || stored?.extra.form.posting || "", link: initialPosting ? "" : (stored?.extra.form.link ?? "") } : (stored?.extra.form ?? EMPTY_FORM),
  );
  const [collapsed, setCollapsed] = useState(() => !linked && !!stored?.extra.collapsed);
  const [savedCorrections, setSavedCorrections] = useState<Correction[]>(() => stored?.extra.savedCorrections ?? []);
  const [fromLink, setFromLink] = useState<LoadedPosting | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [master, setMaster] = useState<MasterOption | null>(null);
  const [changingMaster, setChangingMaster] = useState(false);
  const [exporting, setExporting] = useState<"download" | "save" | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const seeded = useRef(false);

  const extra = useMemo<Extra>(() => ({ form, collapsed, savedCorrections }), [form, collapsed, savedCorrections]);
  const latest = useCallback(<T extends Msg>(messages: Msg[], test: (m: Msg) => m is T): T | null => {
    for (let i = messages.length - 1; i >= 0; i--) if (test(messages[i])) return messages[i] as T;
    return null;
  }, []);

  const chat = useChatSession<ResumeResult, ResumeRun, Extra>({
    tool: "resume_targeter",
    userId,
    initial: stored,
    extra,
    context: (): ResumeChatContext => {
      const current: Msg[] = chat.messages;
      const fit: FitMsg | null = latest(current, isFit);
      const build: BuildMsg | null = latest(current, isBuild);
      const job: ResumeJob | null = build?.inputs.job ?? fit?.inputs.job ?? null;
      return job ? resumeContext(job, fit?.result.fit ?? null, build ? { built: build.result.built, review: build.result.review } : null) : EMPTY_RESUME_CONTEXT;
    },
  });
  const { messages, busy } = chat;
  const working = !!busy;

  // The master as the picker reports it. A JD Decoder fit (?jd=) checked
  // against this same master is shown once, with no run spent.
  function onMaster(option: MasterOption | null) {
    setMaster(option);
    if (seeded.current) return;
    seeded.current = true;
    if (initialFit && option?.ref === initialFit.sourceRef && initialPosting && !chat.messages.some(isFit)) {
      const job: ResumeJob = { source: "master", masterRef: option.ref, pastedText: "", jobTitle: initialTitle, company: "", posting: initialPosting };
      chat.push({ id: newId(), role: "assistant", kind: "result", result: { type: "fit", fit: initialFit, fromDecoder: true }, inputs: { job } });
      setCollapsed(true);
    }
  }

  function changeLink(value: string) {
    setLinkError(null);
    setForm((prev) => {
      if (!fromLink) return { ...prev, link: value };
      return {
        ...prev,
        link: value,
        posting: prev.posting === fromLink.text ? "" : prev.posting,
        jobTitle: prev.jobTitle === (fromLink.title ?? "") ? "" : prev.jobTitle,
        company: prev.company === (fromLink.company ?? "") ? "" : prev.company,
      };
    });
    setFromLink(null);
  }

  const post = async <T,>(body: unknown, signal: AbortSignal): Promise<{ ok: true; data: T } | { ok: false; error: string }> => {
    try {
      const res = await fetch("/api/tools/targeted-resume", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: typeof data.error === "string" ? data.error : CHAT_ERRORS.friendly };
      return { ok: true, data: data as T };
    } catch {
      return { ok: false, error: signal.aborted ? RUN_STOPPED : CHAT_ERRORS.offline };
    }
  };

  async function checkFit(next: Form) {
    if (working) return;
    setInputError(null);
    setLinkError(null);
    setForm(next);
    const source = next.pasting ? "paste" : "master";
    const haveSource = next.pasting ? next.pastedText.trim().length >= 100 && next.pastedText.trim().length <= PASTE_LIMIT : !!master;
    const postingOk = next.posting.trim().length >= 100 && next.posting.trim().length <= POSTING_LIMIT;
    const linkOnly = !next.posting.trim() && next.link.trim().length > 0;
    const fail = (message: string) => {
      setCollapsed(false);
      setInputError(message);
    };
    if (!haveSource) return fail(next.pasting ? "Paste the whole resume you want this one built from." : "Choose your master resume first.");
    if (!linkOnly && !next.posting.trim()) return fail("Add the job posting: its link, or the whole posting.");
    if (!linkOnly && !postingOk) return fail(next.posting.trim().length < 100 ? "Paste the full job posting: duties, requirements, and qualifications." : `That posting is over the ${POSTING_LIMIT.toLocaleString("en-US")} character limit. Cut the benefits and company boilerplate.`);
    if (!linkOnly && next.jobTitle.trim().length < 2) return fail("Enter the job title.");

    const signal = chat.begin();
    let fresh = { jobTitle: next.jobTitle, company: next.company, posting: next.posting };
    if (linkOnly) {
      chat.setBusy({ kind: "run", label: "Reading the job posting from your link" });
      const read = await readPostingFromLink(next.link);
      chat.setBusy(null);
      if (signal.aborted) return;
      if (!read.ok) {
        setLinkError(read.error);
        return fail(read.error);
      }
      fresh = { jobTitle: next.jobTitle.trim() || read.posting.title || "", company: next.company.trim() || read.posting.company || "", posting: read.posting.text };
      setFromLink(read.posting);
      setForm({ ...next, ...fresh });
      if (fresh.jobTitle.trim().length < 2) {
        setLinkError("We read the posting but not its job title. Type the job title above, then tap Check My Fit.");
        return fail("We read the posting but not its job title. Type the job title above, then tap Check My Fit.");
      }
    }
    const job: ResumeJob = { source, masterRef: master?.ref, pastedText: next.pastedText, ...fresh, link: next.link.trim() || undefined };
    chat.push({ id: newId(), role: "user", text: `Check my fit: ${jobHeadline(job)}`, action: true });
    chat.setBusy({ kind: "run", label: "Reading your master and mapping the posting against it", detail: "Usually under a minute. Keep this page open." });
    setFocusKey((k) => k + 1);
    const res = await post<FitResult>(resumeBody("fit", job), signal);
    chat.setBusy(null);
    if (!res.ok) {
      chat.push({ id: newId(), role: "assistant", kind: "notice", tone: signal.aborted ? "info" : "error", text: res.error });
      return;
    }
    chat.push({ id: newId(), role: "assistant", kind: "result", result: { type: "fit", fit: res.data }, inputs: { job } });
    setCollapsed(true);
  }

  async function build(fitMsg: FitMsg) {
    if (working || !fitMsg.inputs.job) return;
    const job = fitMsg.inputs.job;
    const signal = chat.begin();
    chat.push({ id: newId(), role: "user", text: `Build my resume for ${jobHeadline(job)}`, action: true });
    chat.setBusy({ kind: "run", label: "Writing your resume from your master and checking every line", detail: "Usually one to two minutes. Keep this page open." });
    setFocusKey((k) => k + 1);
    const res = await post<BuildResult>(resumeBody("build", job, fitMsg.result.fit.fitMap), signal);
    chat.setBusy(null);
    if (!res.ok) {
      chat.push({ id: newId(), role: "assistant", kind: "notice", tone: signal.aborted ? "info" : "error", text: res.error });
      return;
    }
    chat.push({ id: newId(), role: "assistant", kind: "result", result: { type: "build", built: res.data, review: {} }, inputs: { job } });
  }

  // One marked line: its mark, and for a fix the line itself, swapped in place.
  function marked(msg: BuildMsg, index: number, state: ReviewState, fix?: { oldText: string; newText: string; item: BuildResult["figures"][number] | null; correction?: Correction }) {
    chat.setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msg.id || !isBuild(m)) return m;
        const built = fix
          ? { ...m.result.built, resume: withLine(m.result.built.resume, fix.oldText, fix.newText), figures: m.result.built.figures.map((f, j) => (j === index ? (fix.item ?? { ...f, text: fix.newText }) : f)) }
          : m.result.built;
        return { ...m, result: { ...m.result, built, review: { ...m.result.review, [index]: state } } };
      }),
    );
    if (fix?.correction) setSavedCorrections((prev) => [...prev, fix.correction!]);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void checkFit(form);
  }

  // A link or a whole posting in the reply box: offer to put it in at the top.
  function onSend(text: string) {
    const offer = spotPosting(text);
    if (!offer) {
      void chat.ask(text);
      return;
    }
    chat.push({ id: newId(), role: "user", text, paste: !!offer.posting });
    chat.push({
      id: newId(),
      role: "assistant",
      kind: "text",
      local: true,
      question: text,
      text: offer.link ? "That looks like a link to a job posting. Use it for this resume?" : "That looks like a whole job posting. Use it for this resume?",
      run: { offer },
    });
  }

  function fillPosting(msg: Msg, offer: { link?: string; posting?: string }) {
    setForm((prev) => (offer.link ? { ...prev, link: offer.link, posting: "" } : { ...prev, posting: offer.posting ?? "", link: "" }));
    setCollapsed(false);
    chat.patch(msg.id, { text: "It is filled in at the top. Add the job title if it is missing, then tap Check My Fit.", run: null });
  }

  async function exportChat(mode: "download" | "save") {
    setExporting(mode);
    const result = await chat.exportChat(mode, resumeTranscript(messages));
    setExporting(null);
    if (!result.ok) chat.push({ id: newId(), role: "assistant", kind: "notice", tone: "error", text: result.error });
    else if (mode === "save") chat.push({ id: newId(), role: "assistant", kind: "notice", tone: "success", text: `Saved to My Files as ${result.fileName}.`, href: "/app/documents", hrefLabel: "Open My Files" });
  }

  function newChat() {
    if (messages.length > 0 && !window.confirm("Start a new chat? This one is cleared from this device. Your built resumes stay in My Files.")) return;
    chat.reset();
    setForm(EMPTY_FORM);
    setFromLink(null);
    setCollapsed(false);
    setInputError(null);
    setLinkError(null);
  }

  const fitMsg = latest(messages, isFit);
  const buildMsg = latest(messages, isBuild);
  const corrections = [...(buildMsg?.result.built.corrections ?? fitMsg?.result.fit.corrections ?? []), ...savedCorrections].filter((c, i, all) => all.findIndex((x) => x.newLine === c.newLine) === i);
  const lastResult = [...messages].reverse().find((m) => isFit(m) || isBuild(m)) ?? null;
  const last = [...messages].reverse().find((m) => !(m.role === "assistant" && m.kind === "notice" && m.tone !== "error"));
  const asked = messages.flatMap((m) => (m.role === "user" ? [m.text] : []));
  const suggestions =
    !lastResult || working || !last || last.role === "user" || (last.role === "assistant" && (last.kind === "notice" || (last.kind === "text" && (!!last.error || !!last.local))))
      ? []
      : resumeSuggestions({
          fromModel: last.role === "assistant" && last.kind === "text" ? (last.suggestions ?? []) : [],
          stage: isBuild(lastResult) ? "build" : "fit",
          hasGap: !!fitMsg?.result.fit.fitMap.requirements.some((r) => r.assessment === "gap" || r.assessment === "partial"),
          toCheck: buildMsg ? reviewCount(buildMsg.result.built.figures, buildMsg.result.review).total - reviewCount(buildMsg.result.built.figures, buildMsg.result.review).done : 0,
          asked,
        });
  const canExport = messages.some((m) => m.role === "user" || (m.role === "assistant" && m.kind !== "notice"));
  const download = masterDownload(master);

  function fitView(msg: FitMsg) {
    const counts = msg.result.fit.fitMap.counts;
    const gaps = counts.mandatory.gap + counts.mandatory.partial + counts.preferred.gap + counts.preferred.partial;
    const pasted = msg.inputs.job?.source === "paste";
    return (
      <>
        <BotMessage>
          <div className="chat-fit">
            <FitMapView fit={msg.result.fit} kicker={msg.result.fromDecoder ? "YOUR FIT, FROM THE JD DECODER" : "YOUR FIT"} gapHint={GAP_HINT} />
          </div>
        </BotMessage>
        <BotMessage>
          <p>
            {gaps > 0
              ? `${gaps} ${gaps === 1 ? "requirement is" : "requirements are"} short or missing in your master. If you have done the work, update your master first; if not, build now and be ready to speak to it.`
              : "Your master covers what this job asks for. Build when you are ready."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary !min-h-9 !px-3 !py-1 text-xs" disabled={working} onClick={() => void build(msg)}>
              <Hammer size={13} aria-hidden="true" />
              {buildMsg ? "Build It Again" : "Build My Resume"}
            </button>
            {download && !pasted && (
              <a className="btn btn-secondary !min-h-9 !px-3 !py-1 text-xs" href={download}>
                <Download size={13} aria-hidden="true" />
                Download my master to edit
              </a>
            )}
          </div>
          <p className="text-xs text-[var(--muted)]">Building takes one to two minutes and uses 1 of today&apos;s runs.</p>
        </BotMessage>
      </>
    );
  }

  function buildView(msg: BuildMsg) {
    const { built, review } = msg.result;
    const { done, total } = reviewCount(built.figures, review);
    const current = built.figures.findIndex((_, i) => !review[i]);
    const pasted = msg.inputs.job?.source === "paste";
    const headline = msg.inputs.job ? jobHeadline(msg.inputs.job) : "this job";
    return (
      <>
        <BotMessage>
          <p className="text-base font-bold leading-snug">Your resume for {headline}</p>
          <p className="text-[var(--muted)]">
            {built.gateSummary.pass} checks passed, {built.gateSummary.warn} fixed automatically, {built.gateSummary.fail} need you. About {built.resume.estimatedPages.toFixed(1)} pages.
            {built.notes.filled > 0 ? ` Added ${built.notes.filled} bullet(s) from your master to fill it out.` : ""}
            {built.notes.closedGaps > 0 ? ` Added ${built.notes.closedGaps} job(s) from your master so your timeline has no gap.` : ""}
            {built.notes.summaryRewritten ? " The summary was rewritten once to keep it to what your master supports." : ""}
          </p>
          <div className="grid gap-2">
            <Fold title="See the whole resume">
              <ResumePreview resume={built.resume} />
            </Fold>
            <Fold title="What the checks did" count={built.findings.length}>
              <ul className="!list-none !pl-0">
                {built.findings.map((f, i) => {
                  const level = LEVEL[f.level] ?? LEVEL.pass;
                  return (
                    <li key={i} className="flex items-start gap-2">
                      <span className={`tool-badge ${level.badge} mt-0.5 shrink-0`} style={{ fontSize: "0.6rem" }}>
                        {level.label}
                      </span>
                      <span>
                        <span className="font-semibold">{f.check}.</span> <span className="text-[var(--muted)]">{f.detail}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Fold>
            {built.resume.gaps.length > 0 && (
              <Fold title="Gaps to be ready for" count={built.resume.gaps.length}>
                <ul>
                  {built.resume.gaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </Fold>
            )}
          </div>
          {built.contactMissing && (
            <p className="text-[var(--muted)]">
              <span className="font-semibold text-[var(--foreground)]">Your name is not on it yet.</span> The Word file&apos;s header comes from your{" "}
              <Link href="/app/profile" className="font-semibold underline">
                Profile
              </Link>
              , and it is empty. Add your details there; the file picks them up.
            </p>
          )}
        </BotMessage>

        {total > 0 && (
          <BotMessage>
            <p>
              <span className="font-semibold">Check every line before you send.</span> {total === 1 ? "One line has" : `${total} lines have`} a figure, or wording your master does not use. Mark one Correct only if it is
              true today. The Word file unlocks after the last one.
            </p>
            {done > 0 && (
              <ul className="!list-none !pl-0 grid gap-1">
                {built.figures.map((f, i) =>
                  review[i] ? (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-[var(--muted)]">
                      <Check size={13} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                      <span>
                        <span className="font-semibold text-[var(--foreground)]">Line {i + 1}, {review[i].status === "correct" ? "marked correct" : "fixed"}:</span> {f.text}
                      </span>
                    </li>
                  ) : null,
                )}
              </ul>
            )}
            {current >= 0 && (
              <div className="grid gap-1.5">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--accent)]">
                  Line {current + 1} of {total}
                </p>
                <ul className="!list-none !pl-0">
                  <ReviewCard
                    key={`${current}-${built.figures[current].text}`}
                    item={built.figures[current]}
                    state={review[current]}
                    artifactId={built.artifactId}
                    fromPaste={pasted}
                    onCorrect={() => marked(msg, current, { status: "correct" })}
                    onFixed={(fix) => marked(msg, current, { status: "fixed", note: fix.note }, fix)}
                  />
                </ul>
              </div>
            )}
          </BotMessage>
        )}

        {done === total && (
          <BotMessage>
            <p>{total > 0 ? "Every line is checked. Your resume is ready." : "No line needs a check. Your resume is ready."}</p>
            <a className="btn btn-primary !min-h-9 w-fit !px-3 !py-1 text-xs" href={`/api/documents/${built.documentId}/download`}>
              <FileText size={13} aria-hidden="true" />
              Download Word File
            </a>
            <p className="text-xs text-[var(--muted)]">Saved to My Files as {built.fileName}.</p>
          </BotMessage>
        )}
      </>
    );
  }

  return (
    <main className="page-shell chat-page">
      <PageHead />

      {/* ── Inputs ─────────────────────────────────────────────── */}
      <section className="chat-inputs" aria-label="Your inputs">
        {/* Always mounted, so the master is known even with the inputs shrunk. */}
        <div hidden={!changingMaster || collapsed || form.pasting} className="mb-3">
          <MasterResumePicker onSelect={onMaster} purpose="The posting is compared with this resume, and the targeted resume is written only from it." />
        </div>
        {collapsed && (fitMsg || buildMsg) ? (
          <div className="chat-inputs-summary">
            <p className="min-w-0 flex-1 truncate text-sm">
              <span className="font-semibold">For:</span> <span className="text-[var(--muted)]">{jobHeadline((buildMsg ?? fitMsg)!.inputs.job ?? { jobTitle: form.jobTitle, company: form.company })}</span>
            </p>
            <button type="button" className="btn btn-secondary !min-h-9 shrink-0 !px-3 !py-1 text-xs" onClick={() => setCollapsed(false)}>
              Edit
            </button>
          </div>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={onSubmit}>
            {!form.pasting && (
              <div className="grid gap-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="shrink-0 font-medium">Your master resume:</span>
                  <span className="min-w-0 flex-1 truncate font-semibold" title={master ? originLine(master) : undefined}>
                    {master ? master.name : "None chosen"}
                  </span>
                  <button type="button" className="btn btn-secondary !min-h-8 shrink-0 !px-2.5 !py-0.5 text-xs" onClick={() => setChangingMaster((v) => !v)} aria-expanded={changingMaster}>
                    {changingMaster ? "Done" : master ? "Change" : "Choose"}
                  </button>
                </div>
                <p className="text-xs text-[var(--muted)]">Every line of your targeted resume comes from it.</p>
                {corrections.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-xs font-semibold text-[var(--accent)]">Corrections to copy into your Word master ({corrections.length})</summary>
                    <div className="mt-2">
                      <CorrectionsList corrections={corrections} />
                    </div>
                  </details>
                )}
              </div>
            )}
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={form.pasting} onChange={(e) => setForm({ ...form, pasting: e.target.checked })} />
              <span>Paste a resume for this one run instead</span>
            </label>
            {form.pasting && (
              <label className="block space-y-1">
                <span className="sr-only">Resume to work from</span>
                <textarea
                  className="input min-h-40 resize-y"
                  value={form.pastedText}
                  onChange={(e) => setForm({ ...form, pastedText: e.target.value })}
                  aria-describedby="chat-pasted-check"
                  placeholder="Paste the whole resume you want this one built from."
                />
                <PasteCheck id="chat-pasted-check" text={form.pastedText} limit={PASTE_LIMIT} what="a resume" />
              </label>
            )}
            <JobLinkField value={form.link} onChange={changeLink} disabled={working} note={fromLink ? postingSummary(fromLink) : null} error={linkError} id="resume-chat-link" />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-sm font-medium">Job title</span>
                <input className="input" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} placeholder="e.g. Readiness Program Manager" />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Company (optional)</span>
                <input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              </label>
            </div>
            {form.posting || !form.link.trim() ? (
              <label className="block space-y-1">
                <span className="text-sm font-medium">The whole posting{form.link.trim() ? " (or leave empty to use the link)" : ""}</span>
                <textarea
                  className="input min-h-40 resize-y"
                  value={form.posting}
                  onChange={(e) => setForm({ ...form, posting: e.target.value })}
                  aria-describedby="chat-posting-check"
                  placeholder="Paste the whole posting: duties, requirements, and qualifications."
                />
                <PasteCheck id="chat-posting-check" text={form.posting} limit={POSTING_LIMIT} what="a posting" />
              </label>
            ) : (
              <p className="text-xs text-[var(--muted)]">
                <ClipboardPaste size={12} className="mr-1 inline" aria-hidden="true" />
                The posting is read from the link when you check your fit.
              </p>
            )}
            {inputError && <p className="tool-text-error text-sm font-medium">{inputError}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn btn-primary" type="submit" disabled={working}>
                <Search size={14} aria-hidden="true" />
                {fitMsg ? "Check My Fit Again" : "Check My Fit"}
              </button>
              {(fitMsg || buildMsg) && (
                <button type="button" className="btn btn-secondary" onClick={() => setCollapsed(true)}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
      </section>

      {/* ── Chat ───────────────────────────────────────────────── */}
      <ChatShell
        title="Chat"
        working={working}
        onStop={chat.stop}
        onSend={onSend}
        suggestions={suggestions}
        onSuggestion={(q) => void chat.ask(q)}
        placeholder={buildMsg ? "Ask about your resume..." : fitMsg ? "Ask about your fit..." : "Paste a job link here, or ask a question..."}
        canExport={canExport}
        exporting={exporting}
        onDownload={() => void exportChat("download")}
        onSave={() => void exportChat("save")}
        onNew={newChat}
        focusKey={focusKey}
      >
        <BotMessage>
          <p>
            I write a resume aimed at one job, only from your master resume, and check every line against it. Add the job above and tap <strong>Check My Fit</strong>: you see how you match before anything is written. Then build it,
            and check each line with a figure before the Word file downloads.
          </p>
          <p className="text-[var(--muted)]">Ask me anything along the way: about your fit, a gap, or what the checks did. I can explain your resume, but I do not change its wording.</p>
        </BotMessage>

        {messages.map((m) => {
          if (m.role === "user") {
            const long = m.text.length > 600;
            return (
              <p key={m.id} className="chat-msg-user">
                {long ? `${m.text.slice(0, 280).trim()}... (${m.text.length.toLocaleString("en-US")} characters)` : m.text}
              </p>
            );
          }
          if (m.kind === "notice") {
            return (
              <p key={m.id} className="chat-notice" data-tone={m.tone} role={m.tone === "error" ? "alert" : undefined}>
                {m.text}
                {m.href && (
                  <>
                    {" "}
                    <Link href={m.href} className="font-semibold underline">
                      {m.hrefLabel}
                    </Link>
                  </>
                )}
              </p>
            );
          }
          if (isFit(m)) return <Fragment key={m.id}>{fitView(m)}</Fragment>;
          if (isBuild(m)) return <Fragment key={m.id}>{buildView(m)}</Fragment>;
          if (m.kind !== "text") return null;
          const offer = m.local ? (m.run?.offer ?? null) : null;
          return (
            <BotMessage key={m.id}>
              {m.text ? <ChatText text={m.text} streaming={m.streaming} /> : m.streaming ? <span className="chat-typing" aria-label="Writing"><span /><span /><span /></span> : null}
              {m.stopped && <p className="text-xs text-[var(--muted)]">Stopped.</p>}
              {m.error && (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="tool-text-error text-sm">{m.error}</p>
                  {m.question && (
                    <button type="button" className="btn btn-secondary !min-h-9 !px-3 !py-1 text-xs" disabled={working} onClick={() => void chat.ask(m.question!, m.id)}>
                      Try again
                    </button>
                  )}
                </div>
              )}
              {offer && (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="btn btn-primary !min-h-9 !px-3 !py-1 text-xs" disabled={working} onClick={() => fillPosting(m, offer)}>
                    Use this posting
                  </button>
                  {m.question && m.question.length <= CHAT_MESSAGE_CHARS && (
                    <button type="button" className="text-xs font-semibold text-[var(--accent)] underline" disabled={working} onClick={() => void chat.ask(m.question!, m.id)}>
                      Ask it as a question instead
                    </button>
                  )}
                </div>
              )}
            </BotMessage>
          );
        })}

        {busy?.kind === "run" && <LoadingBlock task={busy.label} detail={busy.detail} />}
      </ChatShell>
    </main>
  );
}
