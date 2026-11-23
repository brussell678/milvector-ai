"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { MessageCircleQuestion, Play } from "lucide-react";
import { ChatShell } from "@/components/chat/chat-shell";
import { ChatText } from "@/components/chat/chat-text";
import { CHAT_ERRORS, newId, readChat, useBrowserReady, useChatSession, type ChatMessage } from "@/components/chat/use-chat-session";
import { LoadingBlock } from "@/components/tools/loading-block";
import { EMPTY_MOS_FORM, matchBadge, mosChanges, mosFormFrom, mosPayload, mosSummary, type CivilianRole, type MosForm, type MosPayload, type MosResult } from "@/lib/chat/mos";
import { mosTranscript } from "@/lib/chat/mos-transcript";

// The MOS Translator as a chat (docs/CHAT_TOOLS_PLAN.md, Phase 1). Translate
// posts the same body the classic form posts to the same route; the result
// arrives as cards in the thread. Questions about it go to the follow-up
// endpoint, which can propose a new run as a button but never runs one.

type Msg = ChatMessage<MosResult, MosPayload>;
type Extra = { form: MosForm; lastInputs: MosPayload | null; collapsed: boolean };

const RUN_STOPPED = "Stopped. If the translation had already started on our end, it may still count as one of today's runs.";

function RoleCard({ role, onAsk, disabled }: { role: CivilianRole; onAsk: (q: string) => void; disabled: boolean }) {
  const badge = matchBadge(role.match_strength);
  return (
    <article className="chat-card">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold leading-snug">{role.title}</h3>
        <span className={`tool-badge shrink-0 ${badge.className}`} style={{ fontSize: "0.62rem" }}>
          {badge.label}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-[var(--muted)]">{role.why_fit}</p>
      {role.common_industries.length > 0 && (
        <p className="text-xs text-[var(--muted)]">
          <span className="font-semibold text-[var(--foreground)]">Industries:</span> {role.common_industries.join(", ")}
        </p>
      )}
      {role.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {role.keywords.map((kw) => (
            <span
              key={kw}
              className="rounded-full border border-[color-mix(in_oklab,var(--accent)_35%,var(--line)_65%)] bg-[color-mix(in_oklab,var(--accent-soft)_60%,var(--surface)_40%)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]"
            >
              {kw}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          className="btn btn-secondary !min-h-9 !px-3 !py-1 text-xs"
          disabled={disabled}
          onClick={() => onAsk(`Tell me more about the ${role.title} role: what the work is like day to day, and how my experience fits it.`)}
        >
          <MessageCircleQuestion size={14} aria-hidden="true" />
          Ask about this role
        </button>
        <Link href={`/app/tools/resume-targeter?title=${encodeURIComponent(role.title)}`} className="btn btn-primary !min-h-9 !px-3 !py-1 text-xs">
          Build Resume for this Role
        </Link>
        <Link href={`/app/tools/fitrep-bullets?role=${encodeURIComponent(role.title)}`} className="btn btn-secondary !min-h-9 !px-3 !py-1 text-xs">
          Set as Target Role
        </Link>
      </div>
    </article>
  );
}

function ResultView({ result, onAsk, disabled }: { result: MosResult; onAsk: (q: string) => void; disabled: boolean }) {
  if (result.civilian_roles.length === 0) return <p>No civilian roles came back this time. Check the MOS above and tap Translate again.</p>;
  return (
    <>
      <p>Here are the civilian jobs that fit your experience, best fit first. Tap Ask about this role on any of them, or ask me anything below.</p>
      <div className="grid gap-2.5">
        {result.civilian_roles.map((role) => (
          <RoleCard key={role.title} role={role} onAsk={onAsk} disabled={disabled} />
        ))}
      </div>
      {result.recommended_certs.length > 0 && (
        <div className="chat-card">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Certifications worth getting</p>
          <ul className="!list-none !pl-0">
            {result.recommended_certs.map((cert) => (
              <li key={cert.name} className="border-t border-[var(--line)] pt-2 first:border-t-0 first:pt-0">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold">{cert.name}</p>
                  <span className="tool-badge tool-badge-warn shrink-0" style={{ fontSize: "0.6rem" }}>
                    {cert.time_to_get}
                  </span>
                </div>
                <p className="text-sm text-[var(--muted)]">{cert.why}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function Bot({ children }: { children: React.ReactNode }) {
  return (
    <div className="chat-msg-bot">
      <span className="chat-avatar" aria-hidden="true">
        MV
      </span>
      <div className="chat-msg-body">{children}</div>
    </div>
  );
}

type Props = { userId: string; initialMos: string; welcome: boolean };

function PageHead() {
  return (
    <header className="chat-page-head">
      <div className="min-w-0">
        <p className="tool-kicker">MOS TRANSLATOR</p>
        <h1 className="chat-page-title">Your military experience, in civilian jobs</h1>
      </div>
      <Link href="/app/tools/mos-translator?view=classic" className="text-xs font-semibold text-[var(--muted)] underline">
        Classic view
      </Link>
    </header>
  );
}

// The chat is kept in the browser, so it renders once the browser is ready;
// until then, the page frame holds its place.
export function MosChat(props: Props) {
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
  return <MosChatSession {...props} />;
}

function MosChatSession({ userId, initialMos, welcome }: Props) {
  // The chat this member left on this device. A link naming a different MOS
  // (?mos=) fills it in; the chat itself is kept.
  const [stored] = useState(() => readChat<MosResult, MosPayload, Extra>("mos_translator", userId));
  const linkChangesMos = !!initialMos && !!stored && stored.extra.form.mos.trim().toLowerCase() !== initialMos.trim().toLowerCase();
  const [form, setForm] = useState<MosForm>(() => (stored ? (linkChangesMos ? { ...stored.extra.form, mos: initialMos } : stored.extra.form) : { ...EMPTY_MOS_FORM, mos: initialMos }));
  const [lastInputs, setLastInputs] = useState<MosPayload | null>(() => stored?.extra.lastInputs ?? null);
  const [collapsed, setCollapsed] = useState(() => !!stored?.extra.collapsed && !linkChangesMos);
  const [inputError, setInputError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"download" | "save" | null>(null);
  const [focusKey, setFocusKey] = useState(0);

  const extra = useMemo<Extra>(() => ({ form, lastInputs, collapsed }), [form, lastInputs, collapsed]);
  const latestResult = useCallback((messages: Msg[]) => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant" && m.kind === "result") return m;
    }
    return null;
  }, []);

  const chat = useChatSession<MosResult, MosPayload, Extra>({
    tool: "mos_translator",
    userId,
    extra,
    initial: stored,
    context: () => {
      const result = latestResult(chat.messages);
      return {
        inputs: result?.inputs ?? mosPayload(form),
        result: result ? { civilian_roles: result.result.civilian_roles, recommended_certs: result.result.recommended_certs } : null,
      };
    },
  });
  const { messages, busy } = chat;
  const working = !!busy;

  async function translate(nextForm: MosForm) {
    if (working) return;
    const payload = mosPayload(nextForm);
    if (payload.mos.trim().length < 2) {
      setCollapsed(false);
      setInputError("Enter your MOS, rate, or AFSC (at least two characters), then tap Translate.");
      return;
    }
    setInputError(null);
    setForm(nextForm);
    chat.push({ id: newId(), role: "user", text: `Translate: ${mosSummary(payload)}`, action: true });
    chat.setBusy({ kind: "run", label: "Translating your MOS", detail: "Mapping your experience to civilian roles, industries, and keywords. Usually 10 to 30 seconds." });
    setFocusKey((k) => k + 1);
    const signal = chat.begin();
    try {
      const res = await fetch("/api/tools/mos-translator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        chat.push({ id: newId(), role: "assistant", kind: "notice", tone: "error", text: typeof data.error === "string" ? data.error : `${CHAT_ERRORS.friendly} Your inputs are still above.` });
        return;
      }
      const result = data as MosResult;
      chat.push({ id: newId(), role: "assistant", kind: "result", result: { runId: result.runId ?? null, civilian_roles: result.civilian_roles ?? [], recommended_certs: result.recommended_certs ?? [] }, inputs: payload });
      setLastInputs(payload);
      setCollapsed(true);
    } catch {
      chat.push({ id: newId(), role: "assistant", kind: "notice", tone: signal.aborted ? "info" : "error", text: signal.aborted ? RUN_STOPPED : `${CHAT_ERRORS.offline} Your inputs are still above.` });
    } finally {
      chat.setBusy(null);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void translate(form);
  }

  async function exportChat(mode: "download" | "save") {
    setExporting(mode);
    const result = await chat.exportChat(mode, mosTranscript(messages, lastInputs));
    setExporting(null);
    if (!result.ok) chat.push({ id: newId(), role: "assistant", kind: "notice", tone: "error", text: result.error });
    else if (mode === "save") chat.push({ id: newId(), role: "assistant", kind: "notice", tone: "success", text: `Saved to My Files as ${result.fileName}.`, href: "/app/documents", hrefLabel: "Open My Files" });
  }

  function newChat() {
    if (messages.length > 0 && !window.confirm("Start a new chat? This one is cleared from this device. Download or save it first if you want to keep it.")) return;
    chat.reset();
    setLastInputs(null);
    setCollapsed(false);
    setInputError(null);
  }

  // Suggestions: the latest answer's, or after a translation, three to start with.
  const last = messages[messages.length - 1];
  const result = latestResult(messages);
  const suggestions =
    last?.role === "assistant" && last.kind === "text" && !last.streaming
      ? last.error
        ? []
        : (last.suggestions ?? [])
      : last?.role === "assistant" && last.kind === "result" && result && result.result.civilian_roles.length > 0
        ? ["Which of these fits me best, and why?", `What does a ${result.result.civilian_roles[0].title} do all day?`, "Which certification should I start with?"]
        : [];

  const canExport = messages.some((m) => m.role === "user" || (m.role === "assistant" && m.kind !== "notice"));
  const ask = (q: string) => void chat.ask(q);

  return (
    <main className="page-shell chat-page">
      <PageHead />

      {/* ── Inputs ─────────────────────────────────────────────── */}
      <section className="chat-inputs" aria-label="Your inputs">
        {collapsed && lastInputs ? (
          <div className="chat-inputs-summary">
            <p className="min-w-0 flex-1 truncate text-sm">
              <span className="font-semibold">Translated:</span> <span className="text-[var(--muted)]">{mosSummary(lastInputs)}</span>
            </p>
            <button type="button" className="btn btn-secondary !min-h-9 shrink-0 !px-3 !py-1 text-xs" onClick={() => setCollapsed(false)}>
              Edit
            </button>
          </div>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={onSubmit}>
            <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
              <label className="block space-y-1">
                <span className="text-sm font-medium">MOS / Rate / AFSC</span>
                <input className="input" value={form.mos} onChange={(e) => setForm({ ...form, mos: e.target.value })} placeholder="e.g. 0311, 11B, 25B" required />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Years</span>
                <input className="input" type="number" min={0} max={40} inputMode="numeric" value={form.yearsExp} onChange={(e) => setForm({ ...form, yearsExp: e.target.value })} placeholder="8" />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-sm font-medium">
                Billets <span className="font-normal text-[var(--muted)]">(optional, comma-separated)</span>
              </span>
              <input className="input" value={form.billets} onChange={(e) => setForm({ ...form, billets: e.target.value })} placeholder="e.g. Platoon Sergeant, S3 Operations Chief" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">
                Interests <span className="font-normal text-[var(--muted)]">(optional, comma-separated)</span>
              </span>
              <input className="input" value={form.interests} onChange={(e) => setForm({ ...form, interests: e.target.value })} placeholder="e.g. technology, project management" />
            </label>
            {inputError && <p className="tool-text-error text-sm font-medium">{inputError}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn btn-primary" type="submit" disabled={working}>
                <Play size={14} aria-hidden="true" />
                {lastInputs ? "Translate Again" : "Translate"}
              </button>
              {lastInputs && (
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
        onSend={ask}
        suggestions={suggestions}
        onSuggestion={ask}
        placeholder={result ? "Ask about these jobs..." : "Ask about civilian jobs for your MOS..."}
        canExport={canExport}
        exporting={exporting}
        onDownload={() => void exportChat("download")}
        onSave={() => void exportChat("save")}
        onNew={newChat}
        focusKey={focusKey}
      >
        <Bot>
          {welcome && form.mos.trim() && messages.length === 0 ? (
            <p>
              Welcome aboard. Your MOS ({form.mos.trim()}) is loaded above. Tap <strong>Translate</strong> to see the civilian jobs that match your experience. It takes about 30 seconds.
            </p>
          ) : (
            <p>
              I show you which civilian jobs fit your military experience, in the words hiring managers use. Enter your MOS above and tap <strong>Translate</strong>. Billets, years, and interests sharpen the matches.
            </p>
          )}
          <p className="text-[var(--muted)]">Then ask me anything about the results: what a job is like day to day, how your experience fits, or which certification to start with.</p>
        </Bot>

        {messages.map((m) => {
          if (m.role === "user") {
            return (
              <p key={m.id} className="chat-msg-user">
                {m.text}
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
          if (m.kind === "result") {
            return (
              <Bot key={m.id}>
                <ResultView result={m.result} onAsk={ask} disabled={working} />
              </Bot>
            );
          }
          const proposed = m.run ?? null;
          return (
            <Bot key={m.id}>
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
              {proposed && !m.streaming && (
                <div className="chat-card">
                  <p className="text-sm">
                    <span className="font-semibold">Translate with:</span> {mosChanges(lastInputs, proposed)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="btn btn-primary !min-h-9 !px-3 !py-1 text-xs" disabled={working} onClick={() => void translate(mosFormFrom(proposed))}>
                      <Play size={13} aria-hidden="true" />
                      Translate
                    </button>
                    <span className="text-xs text-[var(--muted)]">Uses 1 of today&apos;s runs.</span>
                  </div>
                </div>
              )}
            </Bot>
          );
        })}

        {busy?.kind === "run" && <LoadingBlock task={busy.label} detail={busy.detail} />}
      </ChatShell>
    </main>
  );
}
