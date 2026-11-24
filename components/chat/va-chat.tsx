"use client";

import { FormEvent, Fragment, useCallback, useMemo, useState } from "react";
import { DecisionNotice } from "@/components/tools/decision-notice";
import Link from "next/link";
import { MessageSquareText, Play, Search } from "lucide-react";
import { BotMessage } from "@/components/chat/bot-message";
import { ChatShell } from "@/components/chat/chat-shell";
import { ChatText } from "@/components/chat/chat-text";
import { CHAT_ERRORS, newId, readChat, useBrowserReady, useChatSession, type ChatMessage } from "@/components/chat/use-chat-session";
import { LoadingBlock } from "@/components/tools/loading-block";
import { ToolAlert } from "@/components/tools/tool-alert";
import { AnalysisView, rangeText, sideOptions } from "@/components/tools/va-analysis";
import { CRISIS_LINE, crisisSignal } from "@/lib/chat/crisis";
import {
  conditionLines,
  DESCRIBE_PROMPTS,
  EMPTY_VA_CONTEXT,
  rowFrom,
  vaAnalyzeBody,
  vaCombined,
  vaContext,
  vaIdentifyBody,
  vaSuggestions,
  VA_BATCH,
  VA_MAX,
  type Analysis,
  type Identified,
  type Row,
  type Source,
} from "@/lib/chat/va";
import { vaTranscript, type VaResult } from "@/lib/chat/va-transcript";
import type { Side } from "@/lib/va/bilateral";

// The VA Rating Navigator as a chat (docs/CHAT_TOOLS_PLAN.md, Phase 4). Find
// the codes and Analyze post the same bodies to the same route as the classic
// page. The chat lives in this tab only and is never saved by MilVector (D9).
// Describing a condition is guided by the page, with no extra AI (D16), and
// what the member writes goes only to that condition's analysis. Everything
// the member types is checked for words of crisis, in the page (4.5).

// conditions: a lookup the model proposed. describe / added: the page's own
// prompts while the member describes the condition at that row.
type VaRun = { conditions?: string[]; describe?: number; added?: number };
type Msg = ChatMessage<VaResult, VaRun>;
type ListMsg = Extract<Msg, { kind: "result" }> & { result: Extract<VaResult, { type: "conditions" }> };
type Describing = { listId: string; index: number } | null;
type Extra = { conditionsText: string; collapsed: boolean; describing: Describing };

const RUN_STOPPED = "Stopped. If it had already started on our end, it may still count as one of today's runs.";
const isList = (m: Msg): m is ListMsg => m.role === "assistant" && m.kind === "result" && m.result.type === "conditions";

function PageHead() {
  return (
    <>
    <header className="chat-page-head">
      <div className="min-w-0">
        <p className="tool-kicker">VA RATING NAVIGATOR</p>
        <h1 className="chat-page-title">How VA would rate each condition you claim</h1>
      </div>
      <Link href="/app/tools/va-rating-navigator?view=classic" className="text-xs font-semibold text-[var(--muted)] underline">
        Classic view
      </Link>
    </header>
    <DecisionNotice tool="va" />
    </>
  );
}

function CrisisCard() {
  return (
    <ToolAlert variant="stop" title={CRISIS_LINE.title}>
      <p className="text-sm font-medium">{CRISIS_LINE.text}</p>
      <p className="mt-2 flex flex-wrap gap-2">
        <a className="btn btn-primary !min-h-9 !px-3 !py-1 text-xs" href={CRISIS_LINE.call}>
          Call 988, press 1
        </a>
        <a className="btn btn-secondary !min-h-9 !px-3 !py-1 text-xs" href={CRISIS_LINE.textLink}>
          Text 838255
        </a>
        <a className="btn btn-secondary !min-h-9 !px-3 !py-1 text-xs" href={CRISIS_LINE.chat} target="_blank" rel="noreferrer">
          Chat online
        </a>
      </p>
    </ToolAlert>
  );
}

type Props = { userId: string };

export function VaChat(props: Props) {
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
  return <VaChatSession {...props} />;
}

// D9 amended: the member may keep this chat on this device for 30 days. The
// choice itself is remembered on the device.
const KEEP_DAYS = 30;
const keepKey = (userId: string) => `mv.chat.keep.va_rating_navigator.${userId}`;
function readKeep(userId: string): boolean {
  try {
    return window.localStorage.getItem(keepKey(userId)) === "1";
  } catch {
    return false;
  }
}

function VaChatSession({ userId }: Props) {
  // D9: this tab only, unless the member chose to keep it on this device.
  const [keep, setKeep] = useState(() => readKeep(userId));
  const [stored] = useState(() =>
    keep
      ? (readChat<VaResult, VaRun, Extra>("va_rating_navigator", userId, "local", KEEP_DAYS) ?? readChat<VaResult, VaRun, Extra>("va_rating_navigator", userId, "session"))
      : readChat<VaResult, VaRun, Extra>("va_rating_navigator", userId, "session"),
  );
  const [conditionsText, setConditionsText] = useState(() => stored?.extra.conditionsText ?? "");
  const [collapsed, setCollapsed] = useState(() => !!stored?.extra.collapsed);
  const [describing, setDescribing] = useState<Describing>(() => stored?.extra.describing ?? null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"download" | "save" | null>(null);
  const [focusKey, setFocusKey] = useState(0);

  const extra = useMemo<Extra>(() => ({ conditionsText, collapsed, describing }), [conditionsText, collapsed, describing]);
  const latestList = useCallback((messages: Msg[]): ListMsg | null => {
    for (let i = messages.length - 1; i >= 0; i--) if (isList(messages[i])) return messages[i] as ListMsg;
    return null;
  }, []);

  const chat = useChatSession<VaResult, VaRun, Extra>({
    tool: "va_rating_navigator",
    userId,
    initial: stored,
    extra,
    storage: keep ? "local" : "session",
    context: () => {
      const current: Msg[] = chat.messages;
      const list = latestList(current);
      return list ? vaContext(list.result.rows, list.result.source) : EMPTY_VA_CONTEXT;
    },
  });
  const { messages, busy } = chat;
  const working = !!busy;
  const list = latestList(messages);
  const rows = list?.result.rows ?? [];

  // 4.5: the Veterans Crisis Line, at once, whenever the member's words call
  // for it, right after those words.
  const crisisCard = (): Msg => ({ id: newId(), role: "assistant", kind: "notice", tone: "crisis", text: CRISIS_LINE.text });
  function crisisCheck(text: string) {
    if (crisisSignal(text)) chat.push(crisisCard());
  }

  const patchRow = (listId: string, index: number, change: Partial<Row>) =>
    chat.setMessages((prev) =>
      prev.map((m) => (m.id === listId && isList(m) ? { ...m, result: { ...m.result, rows: m.result.rows.map((row, i) => (i === index ? { ...row, ...change } : row)) } } : m)),
    );

  // Find the codes, in batches of 20 as the classic page does. With append,
  // the conditions join the current list (a lookup the chat proposed).
  async function identify(conditions: string[], append: boolean) {
    if (working) return;
    const wanted = conditions.slice(0, VA_MAX).map((c) => c.slice(0, 160));
    if (wanted.length === 0) {
      setCollapsed(false);
      setInputError("List at least one condition, one per line.");
      return;
    }
    setInputError(null);
    const summary = wanted.length > 4 ? `${wanted.slice(0, 4).join(", ")}, and ${wanted.length - 4} more` : wanted.join(", ");
    chat.push({ id: newId(), role: "user", text: `Find the rating codes: ${summary}`, action: true });
    crisisCheck(wanted.join("\n"));
    setFocusKey((k) => k + 1);
    const signal = chat.begin();
    const found: Row[] = [];
    let source: Source | null = list?.result.source ?? null;
    try {
      for (let start = 0; start < wanted.length; start += VA_BATCH) {
        const batch = wanted.slice(start, start + VA_BATCH);
        chat.setBusy({
          kind: "run",
          label: wanted.length > VA_BATCH ? `Matching conditions ${start + 1} to ${start + batch.length} of ${wanted.length}` : "Matching your conditions to the rating schedule",
          detail: "About 15 to 30 seconds for every 20 conditions.",
        });
        const res = await fetch("/api/tools/va-rating-navigator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vaIdentifyBody(batch)), signal });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          chat.push({ id: newId(), role: "assistant", kind: "notice", tone: "error", text: `${typeof data.error === "string" ? data.error : CHAT_ERRORS.friendly}${found.length ? ` The first ${found.length} conditions are below.` : ""}` });
          break;
        }
        source = data.source as Source;
        found.push(...(data.conditions as Identified[]).map(rowFrom));
      }
    } catch {
      chat.push({ id: newId(), role: "assistant", kind: "notice", tone: signal.aborted ? "info" : "error", text: signal.aborted ? RUN_STOPPED : CHAT_ERRORS.offline });
    } finally {
      chat.setBusy(null);
    }
    if (found.length === 0) return;
    if (append && list) {
      chat.setMessages((prev) => prev.map((m) => (m.id === list.id && isList(m) ? { ...m, result: { ...m.result, rows: [...m.result.rows, ...found], source } } : m)));
      chat.push({ id: newId(), role: "assistant", kind: "notice", tone: "success", text: `Added ${found.length} to your list of conditions above.` });
    } else {
      chat.push({ id: newId(), role: "assistant", kind: "result", result: { type: "conditions", rows: found, source }, inputs: {} });
      setDescribing(null);
    }
    setCollapsed(true);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void identify(conditionLines(conditionsText), false);
  }

  // D16: the page asks; the member answers in their own words.
  function startDescribing(listMsg: ListMsg, index: number) {
    setDescribing({ listId: listMsg.id, index });
    chat.push({ id: newId(), role: "assistant", kind: "text", local: true, text: "Describe this condition in your own words.", run: { describe: index } });
    setFocusKey((k) => k + 1);
  }

  async function analyze(listId: string, index: number) {
    const listMsg = messages.find((m) => m.id === listId);
    if (working || !listMsg || !isList(listMsg)) return;
    const row = listMsg.result.rows[index];
    if (!row?.code) return;
    const signal = chat.begin();
    chat.push({ id: newId(), role: "user", text: `Analyze: ${row.input}`, action: true });
    chat.setBusy({ kind: "run", label: `Reading the criteria for DC ${row.code}`, detail: "Usually 20 to 40 seconds." });
    setFocusKey((k) => k + 1);
    try {
      const res = await fetch("/api/tools/va-rating-navigator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vaAnalyzeBody(row)), signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        chat.push({ id: newId(), role: "assistant", kind: "notice", tone: "error", text: typeof data.error === "string" ? data.error : "This one did not finish. Try again." });
        return;
      }
      const analysis = data.analysis as Analysis;
      // As on the classic page: with no rating picked yet, start from the low end of the range.
      patchRow(listId, index, { analysis, rating: row.rating !== "" ? row.rating : analysis.likelyRange.low !== null ? String(analysis.likelyRange.low) : "" });
      chat.push({ id: newId(), role: "assistant", kind: "result", result: { type: "analysis", listId, index, condition: row.input, code: row.code, analysis }, inputs: {} });
      setDescribing(null);
    } catch {
      chat.push({ id: newId(), role: "assistant", kind: "notice", tone: signal.aborted ? "info" : "error", text: signal.aborted ? RUN_STOPPED : CHAT_ERRORS.offline });
    } finally {
      chat.setBusy(null);
    }
  }

  // Everything typed is checked for crisis. While describing a condition, it
  // goes into that condition's description only, never to the chat model.
  function onSend(text: string) {
    if (describing) {
      const listMsg = messages.find((m) => m.id === describing.listId);
      if (listMsg && isList(listMsg)) {
        const row = listMsg.result.rows[describing.index];
        if (row) {
          const details = [row.details, text].filter((part) => part.trim()).join("\n\n").slice(0, 4000);
          patchRow(describing.listId, describing.index, { details });
          chat.push({ id: newId(), role: "user", text, paste: true });
          crisisCheck(text);
          chat.push({ id: newId(), role: "assistant", kind: "text", local: true, text: "Added to your description.", run: { added: describing.index } });
          return;
        }
      }
      setDescribing(null);
    }
    void chat.ask(text, undefined, crisisSignal(text) ? crisisCard() : undefined);
  }

  function changeKeep(on: boolean) {
    setKeep(on);
    try {
      if (on) window.localStorage.setItem(keepKey(userId), "1");
      else window.localStorage.removeItem(keepKey(userId));
    } catch {
      // storage blocked: the choice lasts for this visit
    }
  }

  async function exportChat() {
    setExporting("download");
    const result = await chat.exportChat("download", vaTranscript(messages));
    setExporting(null);
    if (!result.ok) chat.push({ id: newId(), role: "assistant", kind: "notice", tone: "error", text: result.error });
  }

  function newChat() {
    if (messages.length > 0 && !window.confirm("Start a new chat? This one is cleared from this tab. Download it first if you want a copy.")) return;
    chat.reset();
    setDescribing(null);
    setCollapsed(false);
    setInputError(null);
  }

  const combined = vaCombined(rows);
  const last = [...messages].reverse().find((m) => !(m.role === "assistant" && m.kind === "notice" && m.tone !== "error"));
  const asked = messages.flatMap((m) => (m.role === "user" && !m.paste ? [m.text] : []));
  const suggestions =
    !list || working || describing || !last || last.role === "user" || (last.role === "assistant" && (last.kind === "notice" || (last.kind === "text" && (!!last.error || !!last.local))))
      ? []
      : vaSuggestions({
          fromModel: last.role === "assistant" && last.kind === "text" ? (last.suggestions ?? []) : [],
          analyzed: rows.some((r) => !!r.analysis),
          analogous: rows.some((r) => r.candidates.find((c) => c.code === r.code)?.analogous),
          asked,
        });
  const canExport = messages.some((m) => m.role === "user" || (m.role === "assistant" && m.kind !== "notice"));
  const describedRow = describing ? (messages.find((m) => m.id === describing.listId) as ListMsg | undefined)?.result.rows[describing.index] : null;
  const lastLocalId = [...messages].reverse().find((m) => m.role === "assistant" && m.kind === "text" && m.local)?.id;

  function listView(msg: ListMsg) {
    const active = msg.id === list?.id;
    return (
      <BotMessage>
        <p>
          {active ? "Here is each condition with its rating code. Pick a rating to build your combined estimate (at the top), and tap Talk me through this one to describe a condition and see how it would be rated." : "An earlier list of your conditions."}
        </p>
        <ul className="!list-none !pl-0 grid gap-2">
          {msg.result.rows.map((row, index) => {
            const candidate = row.candidates.find((c) => c.code === row.code);
            const ratingOptions = row.analysis?.allowedRatings.length ? row.analysis.allowedRatings : (candidate?.ratings ?? []);
            const sides = sideOptions(candidate?.limb ?? null);
            const noMatch = row.candidates.length === 0;
            return (
              <li key={`${row.input}-${index}`} className="chat-card !gap-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-sm font-semibold leading-snug">
                    {index + 1}. {row.input}
                  </p>
                  {row.analysis && (
                    <span className="tool-badge tool-badge-success shrink-0" style={{ fontSize: "0.6rem" }}>
                      Est. {rangeText(row.analysis)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--muted)]">{noMatch ? row.note || "No matching code found. Try the medical name, or ask a Veterans Service Officer how it would be rated." : `${candidate?.analogous ? "Rated by analogy, " : ""}DC ${row.code}: ${candidate?.title ?? ""}`}</p>
                {active && !noMatch && (
                  <div className="flex flex-wrap items-center gap-2">
                    {row.candidates.length > 1 && (
                      <select className="input !w-auto !py-1.5 text-sm" value={row.code} onChange={(e) => patchRow(msg.id, index, { code: e.target.value, analysis: null, rating: "", side: "" as Side })} aria-label={`Rating code for ${row.input}`}>
                        {row.candidates.map((c) => (
                          <option key={c.code} value={c.code}>
                            DC {c.code}: {c.title}
                          </option>
                        ))}
                      </select>
                    )}
                    {sides.length > 0 && (
                      <select className="input !w-auto !py-1.5 text-sm" value={row.side} onChange={(e) => patchRow(msg.id, index, { side: e.target.value as Side })} aria-label={`Which side, for ${row.input}`}>
                        <option value="">Which side?</option>
                        {sides.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    )}
                    {ratingOptions.length > 0 && (
                      <select className="input !w-auto !py-1.5 text-sm" value={row.rating} onChange={(e) => patchRow(msg.id, index, { rating: e.target.value })} aria-label={`Rating to use for ${row.input}`}>
                        <option value="">Rating</option>
                        {ratingOptions.map((r) => (
                          <option key={r} value={r}>
                            {r}%
                          </option>
                        ))}
                      </select>
                    )}
                    <button type="button" className="btn btn-secondary !min-h-9 !px-3 !py-1 text-xs" disabled={working} onClick={() => startDescribing(msg, index)}>
                      <MessageSquareText size={13} aria-hidden="true" />
                      {row.analysis ? "Add to my description" : "Talk me through this one"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </BotMessage>
    );
  }

  function localView(m: Extract<Msg, { kind: "text" }>) {
    const describe = m.run?.describe !== undefined;
    const added = m.run?.added !== undefined;
    const index = m.run?.describe ?? m.run?.added ?? -1;
    const row = describing && index === describing.index ? describedRow : null;
    const live = m.id === lastLocalId && !!describing && !!row;
    if (describe) {
      const r = row ?? rows[index];
      return (
        <BotMessage>
          <p>
            Tell me about your <span className="font-semibold">{r?.input ?? "condition"}</span> in your own words. Cover what applies:
          </p>
          <ul>
            {DESCRIBE_PROMPTS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {r?.dbq.length ? (
            <p className="text-[var(--muted)]">
              The exam form VA uses:{" "}
              {r.dbq.map((d, i) => (
                <Fragment key={d.url}>
                  {i > 0 ? ", " : ""}
                  <a className="underline" href={d.url} target="_blank" rel="noreferrer">
                    {d.title}
                  </a>
                </Fragment>
              ))}
            </p>
          ) : null}
          <p className="text-xs text-[var(--muted)]">
            Describe it honestly and as it really is, on typical days and worst days. What you write goes only to this condition&apos;s analysis, not to our chat, and MilVector does not save it. Leave out names, SSNs, and dates of birth.
          </p>
          {live && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary !min-h-9 !px-3 !py-1 text-xs" disabled={working} onClick={() => void analyze(describing!.listId, describing!.index)}>
                <Play size={13} aria-hidden="true" />
                {row?.details ? "Analyze this condition" : "Analyze without a description"}
              </button>
              <button type="button" className="btn btn-secondary !min-h-9 !px-3 !py-1 text-xs" onClick={() => setDescribing(null)}>
                Not now
              </button>
            </div>
          )}
        </BotMessage>
      );
    }
    if (added) {
      return (
        <BotMessage>
          <p className="text-[var(--muted)]">Added to your description. Send more, or analyze it now. Until you do, what you send here goes into this description, not to our chat.</p>
          {live && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-primary !min-h-9 !px-3 !py-1 text-xs" disabled={working} onClick={() => void analyze(describing!.listId, describing!.index)}>
                <Play size={13} aria-hidden="true" />
                Analyze this condition
              </button>
              <button type="button" className="btn btn-secondary !min-h-9 !px-3 !py-1 text-xs" onClick={() => setDescribing(null)}>
                Done for now
              </button>
              <span className="text-xs text-[var(--muted)]">Analyze uses 1 of today&apos;s runs.</span>
            </div>
          )}
        </BotMessage>
      );
    }
    return null;
  }

  return (
    <main className="page-shell chat-page">
      <PageHead />

      {/* ── Inputs, with the combined estimate pinned ──────────── */}
      <section className="chat-inputs grid gap-3" aria-label="Your conditions">
        {collapsed && list ? (
          <div className="chat-inputs-summary">
            <p className="min-w-0 flex-1 truncate text-sm">
              <span className="font-semibold">Conditions:</span> <span className="text-[var(--muted)]">{rows.length} listed</span>
            </p>
            <button type="button" className="btn btn-secondary !min-h-9 shrink-0 !px-3 !py-1 text-xs" onClick={() => setCollapsed(false)}>
              Edit
            </button>
          </div>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={onSubmit}>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Your conditions, one per line, in your own words</span>
              <textarea className="input min-h-32" value={conditionsText} onChange={(e) => setConditionsText(e.target.value)} placeholder={"Lower back pain\nTinnitus\nRight knee\nLeft knee\nSleep apnea\nMigraines"} />
            </label>
            <p className="text-xs text-[var(--muted)]">
              {conditionLines(conditionsText).length} listed
              {conditionLines(conditionsText).length > VA_MAX ? `. Only the first ${VA_MAX} will be matched.` : ""}
            </p>
            {inputError && <p className="tool-text-error text-sm font-medium">{inputError}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn btn-primary" type="submit" disabled={working}>
                <Search size={14} aria-hidden="true" />
                {list ? "Find the Codes Again" : "Find the Rating Codes"}
              </button>
              {list && (
                <button type="button" className="btn btn-secondary" onClick={() => setCollapsed(true)}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
        {list && (
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3" aria-live="polite">
            {combined ? (
              <>
                <p className="text-sm">
                  <span className="font-semibold">Combined estimate:</span> <span className="text-xl font-extrabold">{combined.combinedRating}%</span>{" "}
                  <span className="text-xs text-[var(--muted)]">
                    from {combined.rated} of {rows.length} conditions
                  </span>
                </p>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs font-semibold text-[var(--accent)]">Show the math</summary>
                  <p className="mt-1 text-xs text-[var(--muted)]">VA does not add ratings: each applies to what is left after the one before. Exact combined value: {combined.combinedValue}.</p>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-[var(--muted)]">
                    {combined.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </details>
              </>
            ) : (
              <p className="text-sm text-[var(--muted)]">Pick a rating on any condition below to start your combined estimate.</p>
            )}
            <p className="mt-1 text-xs text-[var(--muted)]">Approximate. It uses the ratings you pick, and VA decides the real ones.</p>
          </div>
        )}
        <label className="flex items-start gap-2 text-xs text-[var(--muted)]">
          <input type="checkbox" className="mt-0.5" checked={keep} onChange={(e) => changeKeep(e.target.checked)} />
          <span>
            <span className="font-semibold text-[var(--foreground)]">Keep this chat on this device for 30 days</span>, so you can work through your conditions over several days. Off, it stays only in this tab. MilVector does not save it either way; anyone who uses this browser could see it.
          </span>
        </label>
      </section>

      {/* ── Chat ───────────────────────────────────────────────── */}
      <ChatShell
        title="Chat"
        working={working}
        onStop={chat.stop}
        onSend={onSend}
        suggestions={suggestions}
        onSuggestion={(q) => void chat.ask(q, undefined, crisisSignal(q) ? crisisCard() : undefined)}
        placeholder={describedRow ? `Describe your ${describedRow.input.toLowerCase()}...` : list ? "Ask about your ratings..." : "Ask how VA rates a condition..."}
        canExport={canExport}
        canSave={false}
        exporting={exporting}
        onDownload={() => void exportChat()}
        onSave={() => undefined}
        onNew={newChat}
        focusKey={focusKey}
      >
        <BotMessage>
          <p>
            List the conditions you plan to claim above and tap <strong>Find the Rating Codes</strong>. I match each to the VA rating schedule, show what each rating level requires, and estimate your combined rating from the ratings you pick.
            Tap <strong>Talk me through this one</strong> on any condition to describe it and see its criteria, an exam checklist, your evidence gaps, and a likely range.
          </p>
          <ul className="text-[var(--muted)]">
            <li>Educational only. MilVector is not an accredited claims agent, attorney, or medical provider and does not file or prepare claims.</li>
            <li>For free help filing, work with an accredited Veterans Service Officer (VFW, DAV, American Legion, or your county office).</li>
            <li>Describe your symptoms honestly and consistently. Exaggerating a claim is fraud and can cost you your benefits.</li>
            <li>
              Criteria come from 38 CFR Part 4{list?.result.source ? `, as of ${list.result.source.asOf}` : ""}. Confirm current criteria before relying on this.
            </li>
            <li>This chat stays only in this browser tab unless you choose to keep it on this device (under your conditions). MilVector does not save it. Download a copy to keep one.</li>
          </ul>
        </BotMessage>

        {messages.map((m) => {
          if (m.role === "user") {
            return (
              <p key={m.id} className="chat-msg-user">
                {m.text}
              </p>
            );
          }
          if (m.kind === "notice") {
            if (m.tone === "crisis") return <CrisisCard key={m.id} />;
            return (
              <p key={m.id} className="chat-notice" data-tone={m.tone} role={m.tone === "error" ? "alert" : undefined}>
                {m.text}
              </p>
            );
          }
          if (m.kind === "result") {
            if (m.result.type === "conditions") return <Fragment key={m.id}>{listView(m as ListMsg)}</Fragment>;
            const r = m.result;
            const row = rows[r.index];
            return (
              <BotMessage key={m.id}>
                <p className="text-base font-bold leading-snug">
                  {r.condition} <span className="text-sm font-normal text-[var(--muted)]">DC {r.code}</span>
                </p>
                <AnalysisView a={r.analysis} />
                {list?.id === r.listId && row && (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-secondary !min-h-9 !px-3 !py-1 text-xs" disabled={working} onClick={() => startDescribing(list, r.index)}>
                      <MessageSquareText size={13} aria-hidden="true" />
                      Add to my description
                    </button>
                    <button type="button" className="btn btn-secondary !min-h-9 !px-3 !py-1 text-xs" disabled={working} onClick={() => void analyze(r.listId, r.index)}>
                      <Play size={13} aria-hidden="true" />
                      Analyze again
                    </button>
                  </div>
                )}
              </BotMessage>
            );
          }
          if (m.local) return <Fragment key={m.id}>{localView(m)}</Fragment>;
          const proposed = m.run?.conditions?.length ? m.run.conditions : null;
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
              {proposed && !m.streaming && (
                <div className="chat-card">
                  <p className="text-sm">
                    <span className="font-semibold">Find the codes for:</span> {proposed.join(", ")}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="btn btn-primary !min-h-9 !px-3 !py-1 text-xs" disabled={working} onClick={() => void identify(proposed, !!list)}>
                      <Search size={13} aria-hidden="true" />
                      Find the codes
                    </button>
                    <span className="text-xs text-[var(--muted)]">Uses 1 of today&apos;s runs.</span>
                  </div>
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
