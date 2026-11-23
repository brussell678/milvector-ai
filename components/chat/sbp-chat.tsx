"use client";

import { FormEvent, Fragment, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Calculator, ListChecks, Scale } from "lucide-react";
import { BotMessage } from "@/components/chat/bot-message";
import { ChatShell } from "@/components/chat/chat-shell";
import { ChatText } from "@/components/chat/chat-text";
import { CHAT_ERRORS, newId, readChat, useBrowserReady, useChatSession, type ChatMessage } from "@/components/chat/use-chat-session";
import { LoadingBlock } from "@/components/tools/loading-block";
import { Bullets, Field, SbpNumbers, SbpReadThis, SbpSpecialRules } from "@/components/tools/sbp-views";
import { applyWhatIf, EMPTY_SBP_CONTEXT, parseAmount, SBP_QUICK_QUESTIONS, sbpIntake, sbpSuggestions, whatIfLabel, type SbpWhatIf } from "@/lib/chat/sbp";
import { sbpAlternativesText } from "@/lib/chat/sbp-text";
import { sbpTranscript, type SbpChatResult } from "@/lib/chat/sbp-transcript";
import { DEFAULT_SBP_FORM, num, sbpAnalysisForForm, sbpPayload, usd, type SbpForm, type SbpResult } from "@/lib/sbp/inputs";

// The SBP Decision Advisor as a chat (docs/CHAT_TOOLS_PLAN.md, Phase 5).
// Compare posts the same body to the same route as the classic page. The
// figures always come from code: what-ifs are recalculated in the page at
// once, with no AI and no run. Quick questions are asked by the page (D19),
// and the chat is kept like the VA chat: this tab, or this device by choice,
// never by MilVector (D10).

// quiz / ready: the page's quick questions. Anything else: a what-if the model proposed.
type SbpRun = SbpWhatIf & { quiz?: number; ready?: boolean };
type Msg = ChatMessage<SbpChatResult, SbpRun>;
type CompareMsg = Extract<Msg, { kind: "result" }> & { result: Extract<SbpChatResult, { type: "compare" }> };
type WhatIfMsg = Extract<Msg, { kind: "result" }> & { result: Extract<SbpChatResult, { type: "whatif" }> };
type Extra = { form: SbpForm; collapsed: boolean; quiz: number | null };

const KEEP_DAYS = 30;
const keepKey = (userId: string) => `mv.chat.keep.sbp_advisor.${userId}`;
const RUN_STOPPED = "Stopped. If it had already started on our end, it may still count as one of today's runs.";
const isCompare = (m: Msg): m is CompareMsg => m.role === "assistant" && m.kind === "result" && m.result.type === "compare";
const isWhatIf = (m: Msg): m is WhatIfMsg => m.role === "assistant" && m.kind === "result" && m.result.type === "whatif";
const hasWhatIf = (r: SbpRun | null | undefined) => !!r && (r.reducedBaseAmount !== undefined || !!r.termQuote || r.grossRetiredPay !== undefined || r.memberAgeAtRetirement !== undefined || r.spouseAge !== undefined);

function readKeep(userId: string): boolean {
  try {
    return window.localStorage.getItem(keepKey(userId)) === "1";
  } catch {
    return false;
  }
}

function PageHead() {
  return (
    <header className="chat-page-head">
      <div className="min-w-0">
        <p className="tool-kicker">SBP DECISION ADVISOR</p>
        <h1 className="chat-page-title">The Survivor Benefit Plan, with your real numbers</h1>
      </div>
      <Link href="/app/tools/sbp-advisor?view=classic" className="text-xs font-semibold text-[var(--muted)] underline">
        Classic view
      </Link>
    </header>
  );
}

function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="rounded-lg border border-[var(--line)] bg-[var(--panel)]">
      <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold">{title}</summary>
      <div className="border-t border-[var(--line)] p-3">{children}</div>
    </details>
  );
}

type Props = { userId: string };

export function SbpChat(props: Props) {
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
  return <SbpChatSession {...props} />;
}

function SbpChatSession({ userId }: Props) {
  const [keep, setKeep] = useState(() => readKeep(userId));
  const [stored] = useState(() =>
    keep
      ? (readChat<SbpChatResult, SbpRun, Extra>("sbp_advisor", userId, "local", KEEP_DAYS) ?? readChat<SbpChatResult, SbpRun, Extra>("sbp_advisor", userId, "session"))
      : readChat<SbpChatResult, SbpRun, Extra>("sbp_advisor", userId, "session"),
  );
  const [form, setForm] = useState<SbpForm>(() => stored?.extra.form ?? DEFAULT_SBP_FORM);
  const [collapsed, setCollapsed] = useState(() => !!stored?.extra.collapsed);
  const [quiz, setQuiz] = useState<number | null>(() => stored?.extra.quiz ?? null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"download" | "save" | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const [draft, setDraft] = useState({ reducedBase: "", termCoverage: "", termPremium: "", termYears: "" });

  const extra = useMemo<Extra>(() => ({ form, collapsed, quiz }), [form, collapsed, quiz]);
  const latest = useCallback(<T extends Msg>(messages: Msg[], test: (m: Msg) => m is T): T | null => {
    for (let i = messages.length - 1; i >= 0; i--) if (test(messages[i])) return messages[i] as T;
    return null;
  }, []);

  const chat = useChatSession<SbpChatResult, SbpRun, Extra>({
    tool: "sbp_advisor",
    userId,
    initial: stored,
    extra,
    storage: keep ? "local" : "session",
    context: () => {
      const current: Msg[] = chat.messages;
      const compare = latest(current, isCompare);
      if (!compare) return EMPTY_SBP_CONTEXT;
      const at = current.indexOf(compare);
      const whatIf = [...current.slice(at)].reverse().find(isWhatIf) ?? null;
      return {
        intake: sbpIntake(compare.result.form),
        assessment: compare.result.result.assessment,
        whatIf: whatIf ? sbpIntake(whatIf.result.form) : null,
        whatIfLabel: whatIf?.result.label ?? null,
      };
    },
  });
  const { messages, busy } = chat;
  const working = !!busy;
  const compareMsg = latest(messages, isCompare);

  const set = (key: keyof SbpForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  async function compare(next: SbpForm) {
    if (working) return;
    const pay = num(next.retiredPay);
    const age = num(next.memberAge);
    const spouse = num(next.spouseAge);
    const fail = (message: string) => {
      setCollapsed(false);
      setInputError(message);
    };
    if (!pay || pay < 100) return fail("Enter your gross monthly retired pay.");
    if (!age || age < 30 || age > 75) return fail("Enter your age at retirement (30 to 75).");
    if (next.maritalStatus === "married" && (!spouse || spouse < 18 || spouse > 95)) return fail("Enter your spouse's age, so the survivor figures can be calculated.");
    setInputError(null);
    setForm(next);
    setQuiz(null);
    chat.push({ id: newId(), role: "user", text: `Compare my options: ${usd(pay)} a month of retired pay`, action: true });
    chat.setBusy({ kind: "run", label: "Running the numbers", detail: "Calculating each option and writing your assessment. Usually 20 to 40 seconds." });
    setFocusKey((k) => k + 1);
    const signal = chat.begin();
    try {
      const res = await fetch("/api/tools/sbp-advisor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sbpPayload(next)), signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        chat.push({ id: newId(), role: "assistant", kind: "notice", tone: "error", text: typeof data.error === "string" ? data.error : `${CHAT_ERRORS.friendly} Your answers are still above.` });
        return;
      }
      chat.push({ id: newId(), role: "assistant", kind: "result", result: { type: "compare", form: next, result: data as SbpResult }, inputs: {} });
      setCollapsed(true);
    } catch {
      chat.push({ id: newId(), role: "assistant", kind: "notice", tone: signal.aborted ? "info" : "error", text: signal.aborted ? RUN_STOPPED : `${CHAT_ERRORS.offline} Your answers are still above.` });
    } finally {
      chat.setBusy(null);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void compare(form);
  }

  // D19: the page's quick questions, one at a time.
  function ask(index: number) {
    setQuiz(index);
    chat.push({ id: newId(), role: "assistant", kind: "text", local: true, text: SBP_QUICK_QUESTIONS[index].ask, run: { quiz: index } });
    setFocusKey((k) => k + 1);
  }

  function answer(index: number, value: string | null, label: string) {
    const q = SBP_QUICK_QUESTIONS[index];
    if (value !== null) setForm((prev) => ({ ...prev, [q.field]: value }));
    chat.push({ id: newId(), role: "user", text: label, paste: true });
    if (index + 1 < SBP_QUICK_QUESTIONS.length) ask(index + 1);
    else {
      setQuiz(null);
      chat.push({ id: newId(), role: "assistant", kind: "text", local: true, text: "That's everything. Your answers are in More details at the top, where you can change any of them.", run: { ready: true } });
    }
  }

  // A what-if, recalculated here at once: no AI and no run.
  function tryWhatIf(base: SbpForm, w: SbpWhatIf) {
    const next = applyWhatIf(base, w);
    const analysis = sbpAnalysisForForm(next);
    if (!analysis) {
      chat.push({ id: newId(), role: "assistant", kind: "notice", tone: "error", text: "That what-if needs your retired pay and ages. Check them at the top." });
      return;
    }
    chat.push({ id: newId(), role: "assistant", kind: "result", result: { type: "whatif", form: next, label: whatIfLabel(w), analysis }, inputs: {} });
  }

  function draftWhatIf(): SbpWhatIf | null {
    const w: SbpWhatIf = {};
    const reduced = parseAmount(draft.reducedBase);
    if (reduced) w.reducedBaseAmount = reduced;
    const coverage = parseAmount(draft.termCoverage);
    const premium = num(draft.termPremium);
    const years = num(draft.termYears);
    if (coverage && premium && years) w.termQuote = { coverage, monthlyPremium: premium, termYears: Math.round(years) };
    return Object.keys(w).length ? w : null;
  }

  function onSend(text: string) {
    if (quiz !== null) {
      const q = SBP_QUICK_QUESTIONS[quiz];
      if (q.placeholder) {
        const amount = parseAmount(text);
        if (amount !== null) return answer(quiz, String(amount), text);
        chat.push({ id: newId(), role: "user", text, paste: true });
        chat.push({ id: newId(), role: "assistant", kind: "notice", tone: "info", text: "Type an amount, like 250,000, or tap Skip." });
        return;
      }
      setQuiz(null);
    }
    void chat.ask(text);
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
    const result = await chat.exportChat("download", sbpTranscript(messages));
    setExporting(null);
    if (!result.ok) chat.push({ id: newId(), role: "assistant", kind: "notice", tone: "error", text: result.error });
  }

  function newChat() {
    if (messages.length > 0 && !window.confirm("Start a new chat? This one is cleared. Download it first if you want a copy.")) return;
    chat.reset();
    setQuiz(null);
    setCollapsed(false);
    setInputError(null);
  }

  const last = [...messages].reverse().find((m) => !(m.role === "assistant" && m.kind === "notice" && m.tone !== "error"));
  const asked = messages.flatMap((m) => (m.role === "user" && !m.paste ? [m.text] : []));
  const suggestions =
    !compareMsg || working || quiz !== null || !last || last.role === "user" || (last.role === "assistant" && (last.kind === "notice" || (last.kind === "text" && (!!last.error || !!last.local))))
      ? []
      : sbpSuggestions({ fromModel: last.role === "assistant" && last.kind === "text" ? (last.suggestions ?? []) : [], married: compareMsg.result.form.maritalStatus === "married", asked });
  const canExport = messages.some((m) => m.role === "user" || (m.role === "assistant" && m.kind !== "notice"));
  const lastLocalId = [...messages].reverse().find((m) => m.role === "assistant" && m.kind === "text" && m.local)?.id;
  const currentQuestion = quiz !== null ? SBP_QUICK_QUESTIONS[quiz] : null;

  function compareView(m: CompareMsg) {
    const { analysis: a, assessment: r, assessmentError } = m.result.result;
    const active = m.id === compareMsg?.id;
    return (
      <>
        <BotMessage>
          <SbpSpecialRules retirementType={m.result.form.retirementType} formerSpouse={m.result.form.formerSpouse} />
          <p className="font-semibold">What each option costs and pays</p>
          <p className="text-[var(--muted)]">In today&apos;s dollars. SBP premiums and the survivor payment both rise with the yearly cost-of-living adjustment.</p>
          <SbpNumbers a={a} />
        </BotMessage>
        <BotMessage>
          {r ? (
            <>
              <p className="text-base font-bold leading-snug">{r.best_fit_option}</p>
              <p>{r.snapshot}</p>
              {r.missing_information.length > 0 && <Bullets title="This is provisional" items={r.missing_information} />}
              <div className="grid gap-2">
                <Fold title="Why it fits">
                  <Bullets title="" items={r.why_it_fits} />
                </Fold>
                <Fold title="What could make this wrong">
                  <Bullets title="" items={r.main_risks} />
                </Fold>
                <Fold title="Alternatives">
                  <Bullets title="" items={sbpAlternativesText(r)} />
                </Fold>
                <Fold title="What to do next">
                  <Bullets title="" items={r.next_steps} />
                </Fold>
                <Fold title="Read this">
                  <SbpReadThis a={a} />
                </Fold>
              </div>
            </>
          ) : (
            <p className="tool-text-error">The numbers are ready, but the written assessment did not generate. {assessmentError ?? "Try again in a moment."}</p>
          )}
        </BotMessage>
        {active && (
          <BotMessage>
            <p>
              <span className="font-semibold">Try a what-if.</span> It recalculates here at once, free; it does not use a run.
            </p>
            <div className="grid gap-3">
              <Field label="Reduced SBP: covered amount (monthly)">
                <input className="input" inputMode="decimal" value={draft.reducedBase} onChange={(e) => setDraft({ ...draft, reducedBase: e.target.value })} placeholder="e.g. 2,000" />
              </Field>
              <Field label="A real term life quote: coverage, premium per month, years">
                <div className="grid grid-cols-3 gap-2">
                  <input className="input" inputMode="decimal" value={draft.termCoverage} onChange={(e) => setDraft({ ...draft, termCoverage: e.target.value })} placeholder="750,000" aria-label="What-if term coverage" />
                  <input className="input" inputMode="decimal" value={draft.termPremium} onChange={(e) => setDraft({ ...draft, termPremium: e.target.value })} placeholder="65" aria-label="What-if term premium per month" />
                  <input className="input" inputMode="numeric" value={draft.termYears} onChange={(e) => setDraft({ ...draft, termYears: e.target.value })} placeholder="20" aria-label="What-if term years" />
                </div>
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-primary !min-h-9 !px-3 !py-1 text-xs"
                disabled={working || !draftWhatIf()}
                onClick={() => {
                  const w = draftWhatIf();
                  if (w) tryWhatIf(m.result.form, w);
                }}
              >
                <Calculator size={13} aria-hidden="true" />
                Recalculate
              </button>
              <span className="text-xs text-[var(--muted)]">MilVector never makes up insurance prices. Use a real quote.</span>
            </div>
          </BotMessage>
        )}
      </>
    );
  }

  function whatIfView(m: WhatIfMsg) {
    return (
      <BotMessage>
        <p>
          <span className="font-semibold">What if:</span> {m.result.label}
        </p>
        <SbpNumbers a={m.result.analysis} />
        <p className="text-xs text-[var(--muted)]">Calculated here at once. The written assessment above is for your original answers.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-secondary !min-h-9 !px-3 !py-1 text-xs"
            disabled={working}
            onClick={() => void compare(m.result.form)}
          >
            <Scale size={13} aria-hidden="true" />
            Get a written assessment for this
          </button>
          <span className="text-xs text-[var(--muted)]">Uses 1 of today&apos;s runs.</span>
        </div>
      </BotMessage>
    );
  }

  function localView(m: Extract<Msg, { kind: "text" }>) {
    const live = m.id === lastLocalId;
    if (m.run?.quiz !== undefined) {
      const index = m.run.quiz;
      const q = SBP_QUICK_QUESTIONS[index];
      return (
        <BotMessage>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--accent)]">
            Question {index + 1} of {SBP_QUICK_QUESTIONS.length}
          </p>
          <p>{q.ask}</p>
          {live && quiz === index && (
            <div className="flex flex-wrap gap-2">
              {q.options?.map((o) => (
                <button key={o.value} type="button" className="btn btn-secondary !min-h-9 !px-3 !py-1 text-xs" onClick={() => answer(index, o.value, o.label)}>
                  {o.label}
                </button>
              ))}
              {q.placeholder && <span className="self-center text-xs text-[var(--muted)]">Type it below ({q.placeholder}), or</span>}
              <button type="button" className="btn btn-ghost !min-h-9 !px-3 !py-1 text-xs" onClick={() => answer(index, null, "Skip")}>
                Skip
              </button>
              <button type="button" className="text-xs font-semibold text-[var(--accent)] underline" onClick={() => setQuiz(null)}>
                Stop the questions
              </button>
            </div>
          )}
        </BotMessage>
      );
    }
    if (m.run?.ready) {
      return (
        <BotMessage>
          <p>{m.text}</p>
          {live && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-primary !min-h-9 !px-3 !py-1 text-xs" disabled={working} onClick={() => void compare(form)}>
                <Scale size={13} aria-hidden="true" />
                Compare My Options
              </button>
              <span className="text-xs text-[var(--muted)]">Uses 1 of today&apos;s runs.</span>
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

      {/* ── The essentials, and everything else in More details ── */}
      <section className="chat-inputs grid gap-3" aria-label="Your answers">
        {collapsed && compareMsg ? (
          <div className="chat-inputs-summary">
            <p className="min-w-0 flex-1 truncate text-sm">
              <span className="font-semibold">Compared:</span>{" "}
              <span className="text-[var(--muted)]">
                {usd(num(compareMsg.result.form.retiredPay) ?? 0)} a month; age {compareMsg.result.form.memberAge}
                {compareMsg.result.form.maritalStatus === "married" ? `, spouse ${compareMsg.result.form.spouseAge}` : ""}
              </span>
            </p>
            <button type="button" className="btn btn-secondary !min-h-9 shrink-0 !px-3 !py-1 text-xs" onClick={() => setCollapsed(false)}>
              Edit
            </button>
          </div>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={onSubmit}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Marital status">
                <select className="input" value={form.maritalStatus} onChange={set("maritalStatus")}>
                  <option value="married">Married</option>
                  <option value="single">Single</option>
                  <option value="divorced">Divorced</option>
                  <option value="widowed">Widowed</option>
                </select>
              </Field>
              <Field label="Retired pay / mo">
                <input className="input" inputMode="decimal" value={form.retiredPay} onChange={set("retiredPay")} placeholder="4,200" />
              </Field>
              <Field label="Your age at retirement">
                <input className="input" inputMode="numeric" value={form.memberAge} onChange={set("memberAge")} placeholder="42" />
              </Field>
              <Field label="Spouse's age">
                <input className="input" inputMode="numeric" value={form.spouseAge} onChange={set("spouseAge")} placeholder="40" />
              </Field>
            </div>
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-[var(--accent)]">More details (optional, they sharpen the answer)</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Retirement type">
                  <select className="input" value={form.retirementType} onChange={set("retirementType")}>
                    <option value="active">Active duty (20+ years)</option>
                    <option value="reserve">Reserve or Guard</option>
                    <option value="medical">Medical retirement</option>
                  </select>
                </Field>
                <Field label="Children's ages" hint="Comma-separated. Blank if none.">
                  <input className="input" value={form.childrenAges} onChange={set("childrenAges")} placeholder="e.g. 8, 12" />
                </Field>
                <Field label="How much does your spouse rely on your retired pay?">
                  <select className="input" value={form.relies} onChange={set("relies")}>
                    <option value="fully">It would be most of the household income</option>
                    <option value="partly">It matters, but there is other income</option>
                    <option value="no">My spouse would be fine without it</option>
                  </select>
                </Field>
                <Field label="VA compensation (monthly)">
                  <input className="input" inputMode="decimal" value={form.vaComp} onChange={set("vaComp")} placeholder="e.g. 1,800" />
                </Field>
                <Field label="Spouse's income (monthly)">
                  <input className="input" inputMode="decimal" value={form.spouseIncome} onChange={set("spouseIncome")} placeholder="0" />
                </Field>
                <Field label="Other income (monthly)">
                  <input className="input" inputMode="decimal" value={form.otherIncome} onChange={set("otherIncome")} placeholder="0" />
                </Field>
                <Field label="Savings and investments">
                  <input className="input" inputMode="decimal" value={form.assets} onChange={set("assets")} placeholder="e.g. 250,000" />
                </Field>
                <Field label="Life insurance already in force">
                  <input className="input" inputMode="decimal" value={form.lifeInsurance} onChange={set("lifeInsurance")} placeholder="e.g. 500,000" />
                </Field>
                <Field label="Household expenses (monthly)">
                  <input className="input" inputMode="decimal" value={form.expenses} onChange={set("expenses")} placeholder="e.g. 6,500" />
                </Field>
                <Field label="Tax bracket (%)" hint="Federal plus state. 22 is a common estimate.">
                  <input className="input" inputMode="decimal" value={form.taxRate} onChange={set("taxRate")} />
                </Field>
                <Field label="Your health">
                  <select className="input" value={form.memberHealth} onChange={set("memberHealth")}>
                    <option value="good">Good</option>
                    <option value="some_issues">Some issues</option>
                    <option value="serious_issues">Serious issues</option>
                  </select>
                </Field>
                <Field label="Spouse's health">
                  <select className="input" value={form.spouseHealth} onChange={set("spouseHealth")}>
                    <option value="good">Good</option>
                    <option value="some_issues">Some issues</option>
                    <option value="serious_issues">Serious issues</option>
                  </select>
                </Field>
                <Field label="If you die first, your spouse would want">
                  <select className="input" value={form.incomePreference} onChange={set("incomePreference")}>
                    <option value="guaranteed_monthly">A guaranteed monthly check</option>
                    <option value="lump_sum">A lump sum to manage</option>
                    <option value="unsure">Not sure</option>
                  </select>
                </Field>
                <Field label="Managing a large lump sum">
                  <select className="input" value={form.lumpSumComfort} onChange={set("lumpSumComfort")}>
                    <option value="confident">My spouse would handle it well</option>
                    <option value="somewhat">Probably, with help</option>
                    <option value="not_confident">That would be hard</option>
                  </select>
                </Field>
                <Field label="Protection from inflation">
                  <select className="input" value={form.inflation} onChange={set("inflation")}>
                    <option value="very">Very important</option>
                    <option value="somewhat">Somewhat important</option>
                    <option value="not">Not a concern</option>
                  </select>
                </Field>
                <Field label="Protection is needed for">
                  <select className="input" value={form.horizon} onChange={set("horizon")}>
                    <option value="spouse_lifetime">My spouse&apos;s whole life</option>
                    <option value="early_years">Mostly the early retirement years</option>
                    <option value="unsure">Not sure</option>
                  </select>
                </Field>
                <Field label="Reduced SBP: covered amount (monthly)" hint="Less than your full retired pay, to see partial coverage.">
                  <input className="input" inputMode="decimal" value={form.reducedBase} onChange={set("reducedBase")} placeholder="e.g. 2,000" />
                </Field>
                <Field label="A real term quote: coverage, premium/mo, years">
                  <div className="grid grid-cols-3 gap-2">
                    <input className="input" inputMode="decimal" value={form.termCoverage} onChange={set("termCoverage")} placeholder="750,000" aria-label="Term coverage" />
                    <input className="input" inputMode="decimal" value={form.termPremium} onChange={set("termPremium")} placeholder="65" aria-label="Term premium per month" />
                    <input className="input" inputMode="numeric" value={form.termYears} onChange={set("termYears")} placeholder="20" aria-label="Term years" />
                  </div>
                </Field>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={form.formerSpouse} onChange={set("formerSpouse")} />
                  <span>A former spouse or a court order is involved</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={form.tobacco} onChange={set("tobacco")} />
                  <span>I use tobacco or nicotine</span>
                </label>
                <Field label="Anything else that matters" hint="Optional. No SSNs or account numbers.">
                  <textarea className="input min-h-20" value={form.notes} onChange={set("notes")} />
                </Field>
              </div>
            </details>
            {inputError && <p className="tool-text-error text-sm font-medium">{inputError}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn btn-primary" type="submit" disabled={working}>
                <Scale size={14} aria-hidden="true" />
                {compareMsg ? "Compare Again" : "Compare My Options"}
              </button>
              {compareMsg && (
                <button type="button" className="btn btn-secondary" onClick={() => setCollapsed(true)}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
        <label className="flex items-start gap-2 text-xs text-[var(--muted)]">
          <input type="checkbox" className="mt-0.5" checked={keep} onChange={(e) => changeKeep(e.target.checked)} />
          <span>
            <span className="font-semibold text-[var(--foreground)]">Keep this chat on this device for 30 days.</span> Off, it stays only in this tab. MilVector does not save it either way; anyone who uses this browser could see it.
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
        onSuggestion={(q) => void chat.ask(q)}
        placeholder={currentQuestion?.placeholder ? `Type an amount (${currentQuestion.placeholder})...` : compareMsg ? "Ask about your options, or a what-if..." : "Ask how SBP works..."}
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
            The Survivor Benefit Plan is a one-time choice at retirement. Enter your marital status, ages, and retired pay above and tap <strong>Compare My Options</strong>: I show what full, reduced, and no SBP cost and pay, compare a real term life
            quote if you have one, and give a plain-language assessment. Then try what-ifs; they recalculate at once, free.
          </p>
          <p className="text-[var(--muted)]">Educational guidance, not legal, tax, or financial advice. MilVector sells nothing. This chat stays in this tab unless you keep it on this device; MilVector does not save it.</p>
          {quiz === null && !compareMsg && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-secondary !min-h-9 !px-3 !py-1 text-xs" disabled={working} onClick={() => ask(0)}>
                <ListChecks size={13} aria-hidden="true" />
                Ask me {SBP_QUICK_QUESTIONS.length} quick questions first
              </button>
              <span className="text-xs text-[var(--muted)]">Most are one tap. They sharpen the answer.</span>
            </div>
          )}
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
            return (
              <p key={m.id} className="chat-notice" data-tone={m.tone} role={m.tone === "error" ? "alert" : undefined}>
                {m.text}
              </p>
            );
          }
          if (isCompare(m)) return <Fragment key={m.id}>{compareView(m)}</Fragment>;
          if (isWhatIf(m)) return <Fragment key={m.id}>{whatIfView(m)}</Fragment>;
          if (m.kind !== "text") return null;
          if (m.local) return <Fragment key={m.id}>{localView(m)}</Fragment>;
          const proposed = hasWhatIf(m.run) ? (m.run as SbpWhatIf) : null;
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
              {proposed && compareMsg && !m.streaming && (
                <div className="chat-card">
                  <p className="text-sm">
                    <span className="font-semibold">What if:</span> {whatIfLabel(proposed)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="btn btn-primary !min-h-9 !px-3 !py-1 text-xs" disabled={working} onClick={() => tryWhatIf(compareMsg.result.form, proposed)}>
                      <Calculator size={13} aria-hidden="true" />
                      Show the numbers
                    </button>
                    <span className="text-xs text-[var(--muted)]">Free, calculated here at once.</span>
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
