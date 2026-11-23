"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardPaste, Copy, FileSearch } from "lucide-react";
import { BotMessage } from "@/components/chat/bot-message";
import { ChatShell } from "@/components/chat/chat-shell";
import { ChatText } from "@/components/chat/chat-text";
import { CHAT_ERRORS, newId, readChat, useBrowserReady, useChatSession, type ChatMessage } from "@/components/chat/use-chat-session";
import { FitMapView } from "@/components/tools/fit-map-view";
import { JobLinkField, postingSummary, readPostingFromLink, type LoadedPosting } from "@/components/tools/job-link-field";
import { LoadingBlock } from "@/components/tools/loading-block";
import { MasterResumePicker, originLine } from "@/components/tools/master-resume-picker";
import { EMPTY_JD_CONTEXT, jdContext, jdHeadline, jdPayload, jdSuggestions, NO_MASTER, spotPosting, type JdInput, type JdResult } from "@/lib/chat/jd";
import { jdTranscript } from "@/lib/chat/jd-transcript";
import { CHAT_MESSAGE_CHARS } from "@/lib/chat/tools";
import type { MasterOption } from "@/lib/master-resume";

// The Job Description Decoder as a chat (docs/CHAT_TOOLS_PLAN.md, Phase 2).
// Decode reads the link first when there is no pasted text, exactly as the
// classic page does, then posts the same body to the same route. The role
// summary and the member's fit show open; everything else sits in one card of
// folds (D12). A link or a whole posting pasted into the reply box gets a
// Decode button, decided by the page with no AI call (D13).

type Msg = ChatMessage<JdResult, JdInput>;
type Form = { link: string; posting: string; pasting: boolean };
type Extra = { form: Form; collapsed: boolean };

const EMPTY_FORM: Form = { link: "", posting: "", pasting: false };
const RUN_STOPPED = "Stopped. If the decode had already started on our end, it may still count as one of today's runs.";
const GAP_HINT = "Have you done this? Add it to your master in Word, upload it to My Files, choose it as your master, and decode again. If not, be ready to speak to it.";

function PageHead() {
  return (
    <header className="chat-page-head">
      <div className="min-w-0">
        <p className="tool-kicker">JOB DESCRIPTION DECODER</p>
        <h1 className="chat-page-title">What a job posting really wants, and how you fit</h1>
      </div>
      <Link href="/app/tools/jd-decoder?view=classic" className="text-xs font-semibold text-[var(--muted)] underline">
        Classic view
      </Link>
    </header>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function Fold({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <details className="rounded-lg border border-[var(--line)] bg-[var(--panel)]">
      <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold">
        {title} <span className="font-normal text-[var(--muted)]">({count})</span>
      </summary>
      <div className="chat-msg-body border-t border-[var(--line)] p-3">{children}</div>
    </details>
  );
}

function Keywords({ keywords }: { keywords: string[] }) {
  const [copied, setCopied] = useState("");
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {keywords.map((kw) => (
          <span
            key={kw}
            className="rounded-full border border-[color-mix(in_oklab,var(--accent)_35%,var(--line)_65%)] bg-[color-mix(in_oklab,var(--accent-soft)_60%,var(--surface)_40%)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]"
          >
            {kw}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-secondary !min-h-9 !px-3 !py-1 text-xs"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(keywords.join(", "));
              setCopied("Copied");
            } catch {
              setCopied("Could not copy");
            }
            setTimeout(() => setCopied(""), 1500);
          }}
        >
          <Copy size={13} aria-hidden="true" />
          Copy keywords
        </button>
        {copied && <span className="text-xs font-semibold text-[var(--accent)]">{copied}</span>}
      </div>
    </>
  );
}

// D12: the summary and the fit open, everything else folded in one card.
function DecodeView({ result, input }: { result: JdResult; input: JdInput }) {
  const wants = result.top_must_have_signals.length + result.hard_requirements.length + result.soft_requirements.length + result.implied_expectations.length;
  const prep = result.interview_focus_areas.length + result.likely_interview_questions.length + result.clarifying_questions.length;
  const handoff = result.runId ? `/app/tools/resume-targeter?jd=${result.runId}` : "/app/tools/resume-targeter";
  return (
    <>
      <BotMessage>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-base font-bold leading-snug">{jdHeadline(result, input)}</p>
          {result.role_level_guess && (
            <span className="tool-badge tool-badge-success shrink-0" style={{ fontSize: "0.62rem" }}>
              {result.role_level_guess}
              {result.role_level_confidence ? `, ${result.role_level_confidence} confidence` : ""}
            </span>
          )}
        </div>
        {result.plain_english_summary && <p>{result.plain_english_summary}</p>}
        {result.role_mission_summary && (
          <p className="text-[var(--muted)]">
            <span className="font-semibold text-[var(--foreground)]">The mission:</span> {result.role_mission_summary}
          </p>
        )}
      </BotMessage>

      <BotMessage>
        {result.fit ? (
          <div className="chat-fit">
            <FitMapView fit={result.fit} kicker="YOUR FIT" gapHint={GAP_HINT} />
          </div>
        ) : result.fitNote === NO_MASTER || !result.fitNote ? (
          <p>
            <span className="font-semibold">Your fit was not checked:</span> choose your master resume at the top, or{" "}
            <Link href="/app/tools/fitrep-bullets" className="font-semibold underline">
              build one from your records
            </Link>
            , then decode again to see each requirement matched to your own experience.
          </p>
        ) : (
          <p>
            <span className="font-semibold">Your fit was not checked this time.</span> {result.fitNote}
          </p>
        )}
      </BotMessage>

      <BotMessage>
        <div className="grid gap-2">
          <Fold title="What they want" count={wants}>
            {result.top_must_have_signals.length > 0 && (
              <>
                <p className="font-semibold">Top must-haves</p>
                <List items={result.top_must_have_signals} />
              </>
            )}
            {result.hard_requirements.length > 0 && (
              <>
                <p className="font-semibold">Hard requirements</p>
                <List items={result.hard_requirements} />
              </>
            )}
            {result.soft_requirements.length > 0 && (
              <>
                <p className="font-semibold">Soft requirements</p>
                <List items={result.soft_requirements} />
              </>
            )}
            {result.implied_expectations.length > 0 && (
              <>
                <p className="font-semibold">Unwritten expectations</p>
                <List items={result.implied_expectations} />
              </>
            )}
          </Fold>
          <Fold title="Risks to weigh" count={result.fit_risks.length}>
            <List items={result.fit_risks} />
          </Fold>
          <Fold title="Keywords" count={result.ats_keywords_priority.length}>
            <p className="text-[var(--muted)]">The words screening software looks for, most important first. Use one only where your record backs it up.</p>
            <Keywords keywords={result.ats_keywords_priority} />
          </Fold>
          <Fold title="Interview prep" count={prep}>
            {result.interview_focus_areas.length > 0 && (
              <>
                <p className="font-semibold">What they will focus on</p>
                <List items={result.interview_focus_areas} />
              </>
            )}
            {result.likely_interview_questions.length > 0 && (
              <>
                <p className="font-semibold">Likely questions</p>
                <List items={result.likely_interview_questions} />
              </>
            )}
            {result.clarifying_questions.length > 0 && (
              <>
                <p className="font-semibold">Questions to ask them</p>
                <List items={result.clarifying_questions} />
              </>
            )}
          </Fold>
          <Fold title="About the company" count={result.company_context_signals.length}>
            <List items={result.company_context_signals} />
          </Fold>
        </div>
        <div className="chat-card">
          <p className="text-sm">
            <span className="font-semibold">Ready to apply?</span> Build a resume aimed at this job. {result.fit ? "The posting and your fit come with you." : "The posting comes with you."}
          </p>
          <Link href={handoff} className="btn btn-primary !min-h-9 w-fit !px-3 !py-1 text-xs">
            Build a resume for this job
          </Link>
        </div>
      </BotMessage>
    </>
  );
}

type Props = { userId: string };

// The chat is kept in the browser, so it renders once the browser is ready.
export function JdChat(props: Props) {
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
  return <JdChatSession {...props} />;
}

function JdChatSession({ userId }: Props) {
  const [stored] = useState(() => readChat<JdResult, JdInput, Extra>("jd_decoder", userId));
  const [form, setForm] = useState<Form>(() => stored?.extra.form ?? EMPTY_FORM);
  const [collapsed, setCollapsed] = useState(() => !!stored?.extra.collapsed);
  const [fromLink, setFromLink] = useState<LoadedPosting | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [master, setMaster] = useState<MasterOption | null>(null);
  const [changingMaster, setChangingMaster] = useState(false);
  const [exporting, setExporting] = useState<"download" | "save" | null>(null);
  const [focusKey, setFocusKey] = useState(0);

  const extra = useMemo<Extra>(() => ({ form, collapsed }), [form, collapsed]);
  const latestResult = useCallback((messages: Msg[]) => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant" && m.kind === "result") return m;
    }
    return null;
  }, []);

  const chat = useChatSession<JdResult, JdInput, Extra>({
    tool: "jd_decoder",
    userId,
    initial: stored,
    extra,
    context: () => {
      const last = latestResult(chat.messages);
      return last ? jdContext(last.result, last.inputs) : EMPTY_JD_CONTEXT;
    },
  });
  const { messages, busy } = chat;
  const working = !!busy;

  function changeLink(value: string) {
    setLinkError(null);
    // A new link clears a posting the old link filled in; typed text stays.
    setForm((prev) => ({ ...prev, link: value, posting: fromLink && prev.posting === fromLink.text ? "" : prev.posting }));
    setFromLink(null);
  }

  async function decode(next: Form) {
    if (working) return;
    setInputError(null);
    setLinkError(null);
    setForm(next);
    let postingText = next.posting;
    let loaded: LoadedPosting | null = null;
    if (!postingText.trim() && !next.link.trim()) {
      setCollapsed(false);
      setInputError("Paste the job posting's link, or the whole posting, then tap Decode.");
      return;
    }
    const label = postingText.trim() ? `Decode this posting (${postingText.trim().length.toLocaleString("en-US")} characters)` : `Decode the posting at ${next.link.trim()}`;
    chat.push({ id: newId(), role: "user", text: label, action: true });
    setFocusKey((k) => k + 1);
    const signal = chat.begin();

    // A link and an empty box: read the posting first, as the classic page does.
    if (!postingText.trim()) {
      chat.setBusy({ kind: "run", label: "Reading the posting from your link" });
      const read = await readPostingFromLink(next.link);
      if (signal.aborted) {
        chat.setBusy(null);
        return;
      }
      if (!read.ok) {
        chat.setBusy(null);
        setLinkError(read.error);
        setCollapsed(false);
        chat.push({ id: newId(), role: "assistant", kind: "notice", tone: "error", text: read.error });
        return;
      }
      loaded = read.posting;
      postingText = read.posting.text;
      setFromLink(read.posting);
      setForm({ ...next, posting: read.posting.text });
    }
    if (postingText.trim().length < 100) {
      chat.setBusy(null);
      setCollapsed(false);
      setInputError("Paste the full job posting, at least 100 characters, and try again.");
      return;
    }

    chat.setBusy({ kind: "run", label: "Decoding the posting", detail: "Reading the posting for requirements, keywords, and interview prep, and checking it against your master resume. Usually 15 to 30 seconds, or up to a minute when it checks your fit." });
    try {
      const res = await fetch("/api/tools/jd-decoder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jdPayload(postingText)),
        signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        chat.push({ id: newId(), role: "assistant", kind: "notice", tone: "error", text: typeof data.error === "string" ? data.error : `${CHAT_ERRORS.friendly} Your posting is still above.` });
        return;
      }
      const input: JdInput = { posting: postingText, link: next.link.trim() || undefined, title: loaded?.title ?? null, company: loaded?.company ?? null };
      chat.push({ id: newId(), role: "assistant", kind: "result", result: data as JdResult, inputs: input });
      setCollapsed(true);
    } catch {
      chat.push({ id: newId(), role: "assistant", kind: "notice", tone: signal.aborted ? "info" : "error", text: signal.aborted ? RUN_STOPPED : `${CHAT_ERRORS.offline} Your posting is still above.` });
    } finally {
      chat.setBusy(null);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void decode(form);
  }

  // D13: a link or a whole posting in the reply box gets a Decode button.
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
      text: offer.link ? "That looks like a link to a job posting. Want me to decode it?" : "That looks like a whole job posting. Want me to decode it?",
      run: { posting: offer.posting ?? "", link: offer.link },
    });
  }

  async function exportChat(mode: "download" | "save") {
    setExporting(mode);
    const last = latestResult(messages);
    const result = await chat.exportChat(mode, jdTranscript(messages, last ? { result: last.result, input: last.inputs } : null));
    setExporting(null);
    if (!result.ok) chat.push({ id: newId(), role: "assistant", kind: "notice", tone: "error", text: result.error });
    else if (mode === "save") chat.push({ id: newId(), role: "assistant", kind: "notice", tone: "success", text: `Saved to My Files as ${result.fileName}.`, href: "/app/documents", hrefLabel: "Open My Files" });
  }

  function newChat() {
    if (messages.length > 0 && !window.confirm("Start a new chat? This one is cleared from this device. Download or save it first if you want to keep it.")) return;
    chat.reset();
    setForm(EMPTY_FORM);
    setFromLink(null);
    setCollapsed(false);
    setInputError(null);
    setLinkError(null);
  }

  // Three to tap once there is a decode: the latest answer's own first.
  const last = [...messages].reverse().find((m) => !(m.role === "assistant" && m.kind === "notice" && m.tone !== "error"));
  const result = latestResult(messages);
  const asked = messages.flatMap((m) => (m.role === "user" ? [m.text] : []));
  const suggestions =
    !result || working || !last || last.role === "user" || (last.role === "assistant" && (last.kind === "notice" || (last.kind === "text" && (!!last.error || !!last.local))))
      ? []
      : jdSuggestions({
          fromModel: last.role === "assistant" && last.kind === "text" ? (last.suggestions ?? []) : [],
          hasFit: !!result.result.fit,
          hasGap: !!result.result.fit?.fitMap.requirements.some((r) => r.assessment === "gap" || r.assessment === "partial"),
          asked,
        });

  const canExport = messages.some((m) => m.role === "user" || (m.role === "assistant" && m.kind !== "notice"));
  const lastHeadline = result ? jdHeadline(result.result, result.inputs) : "";

  return (
    <main className="page-shell chat-page">
      <PageHead />

      {/* ── Inputs ─────────────────────────────────────────────── */}
      <section className="chat-inputs" aria-label="Your inputs">
        {collapsed && result ? (
          <div className="chat-inputs-summary">
            <p className="min-w-0 flex-1 truncate text-sm">
              <span className="font-semibold">Decoded:</span> <span className="text-[var(--muted)]">{lastHeadline}</span>
            </p>
            <button type="button" className="btn btn-secondary !min-h-9 shrink-0 !px-3 !py-1 text-xs" onClick={() => setCollapsed(false)}>
              Edit
            </button>
          </div>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={onSubmit}>
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
              <p className="text-xs text-[var(--muted)]">Your fit is checked against it. Without one, you still get the posting decoded.</p>
              {/* Mounted while closed, so it reports the member's master as the page opens. */}
              <div hidden={!changingMaster}>
                <MasterResumePicker onSelect={setMaster} purpose="Your fit compares the posting with this resume, the same way the Targeted Resume Builder does." />
              </div>
            </div>
            <JobLinkField value={form.link} onChange={changeLink} disabled={working} note={fromLink ? postingSummary(fromLink) : null} error={linkError} id="jd-chat-link" />
            {form.pasting || (form.posting && !fromLink) ? (
              <label className="block space-y-1">
                <span className="text-sm font-medium">The whole posting{form.link.trim() ? " (or leave empty to use the link)" : ""}</span>
                <textarea
                  className="input min-h-40 resize-y"
                  value={form.posting}
                  onChange={(e) => setForm({ ...form, posting: e.target.value })}
                  placeholder="Paste the complete posting: title, duties, requirements, and qualifications."
                />
                {form.posting.trim() && <span className="block text-xs text-[var(--muted)]">{form.posting.trim().length.toLocaleString("en-US")} characters</span>}
              </label>
            ) : (
              <button type="button" className="w-fit text-sm font-semibold text-[var(--accent)] underline" onClick={() => setForm({ ...form, pasting: true })}>
                <ClipboardPaste size={14} className="mr-1 inline" aria-hidden="true" />
                Or paste the whole posting
              </button>
            )}
            {inputError && <p className="tool-text-error text-sm font-medium">{inputError}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn btn-primary" type="submit" disabled={working}>
                <FileSearch size={14} aria-hidden="true" />
                {result ? "Decode Again" : "Decode"}
              </button>
              {result && (
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
        placeholder={result ? "Ask about this job..." : "Paste a job link here, or ask a question..."}
        canExport={canExport}
        exporting={exporting}
        onDownload={() => void exportChat("download")}
        onSave={() => void exportChat("save")}
        onNew={newChat}
        focusKey={focusKey}
      >
        <BotMessage>
          <p>
            Give me a job posting and I show you what it really asks for, what to watch out for, and how your master resume fits it. Paste its link or the whole posting above, or right here in the chat, and tap <strong>Decode</strong>.
          </p>
          <p className="text-[var(--muted)]">Then ask me anything about it: whether you are a fit, how to handle a gap, or what they will ask you in the interview.</p>
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
          if (m.kind === "result") return <DecodeView key={m.id} result={m.result} input={m.inputs} />;
          const offer = m.local ? (m.run ?? null) : null;
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
                  <button
                    type="button"
                    className="btn btn-primary !min-h-9 !px-3 !py-1 text-xs"
                    disabled={working}
                    onClick={() => void decode({ link: offer.link ?? "", posting: offer.posting, pasting: !!offer.posting })}
                  >
                    <FileSearch size={13} aria-hidden="true" />
                    Decode this posting
                  </button>
                  <span className="text-xs text-[var(--muted)]">Uses 1 of today&apos;s runs.</span>
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
