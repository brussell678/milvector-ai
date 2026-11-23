"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { FigureCheck } from "@/lib/resume/targeting";

// The Targeted Resume Builder's review step. Every line with a figure, or with
// wording the member's master does not use, is marked Correct or Wrong before
// the Word file downloads. Wrong says which kind:
//   "My master is out of date": the member writes the true line; it replaces
//     this one and every later resume uses it until their master says it.
//   "The resume says something my master doesn't": the master's own line
//     goes back in.
// Correct is saved too, so the review is kept and the resume unlocks once
// every line has a mark (lib/resume/review-lock.ts, D15).

import type { Correction, ReviewState } from "@/lib/resume/build-result";
export type { Correction, ReviewState };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A line with its figures in bold and the wording its master does not use underlined. */
export function MarkedLine({ text, figures, added = [] }: { text: string; figures: string[]; added?: string[] }) {
  const parts = [...figures.map(escape), ...added.map((w) => `\\b${escape(w)}\\w*`)];
  if (parts.length === 0) return <>{text}</>;
  const pattern = new RegExp(`(${parts.join("|")})`, "gi");
  const addedWord = added.length ? new RegExp(`^(?:${added.map((w) => `${escape(w)}\\w*`).join("|")})$`, "i") : null;
  return (
    <>
      {text.split(pattern).map((part, i) =>
        !part ? null : figures.includes(part) ? (
          <strong key={i} className="font-bold text-[var(--foreground)]">
            {part}
          </strong>
        ) : addedWord?.test(part) ? (
          <span key={i} className="underline decoration-dotted decoration-2 underline-offset-4" title="Wording your master does not use">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

type FixResult = { ok: true; text: string; item: FigureCheck | null; kept: boolean } | { ok: false; error: string };

// Each review action reads the saved resume, changes one line or mark, and
// writes it back. Two at once (a quick tap on Correct, then the next) could
// each write over the other's mark, leaving the resume locked with every line
// marked on screen. So a page sends them one after another.
let queue: Promise<unknown> = Promise.resolve();

function sendFix(body: Record<string, unknown>): Promise<FixResult> {
  const next = queue.then(() => postFix(body));
  queue = next.catch(() => undefined);
  return next;
}

async function postFix(body: Record<string, unknown>): Promise<FixResult> {
  try {
    const res = await fetch("/api/tools/targeted-resume/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: typeof data.error === "string" ? data.error : "That did not save. Try again." };
    return { ok: true, text: String(data.text ?? ""), item: data.item ?? null, kept: !!data.kept };
  } catch {
    return { ok: false, error: "That didn't go through. Check your connection and try again." };
  }
}

export function ReviewCard({
  item,
  state,
  artifactId,
  fromPaste,
  onCorrect,
  onFixed,
}: {
  item: FigureCheck;
  state?: ReviewState;
  artifactId: string | null;
  fromPaste: boolean;
  onCorrect: () => void;
  onFixed: (fix: { oldText: string; newText: string; item: FigureCheck | null; note: string; correction?: Correction }) => void;
}) {
  const [open, setOpen] = useState<null | "choose" | "outdated">(null);
  const masterLine = item.sources[0] ?? "";
  const [draft, setDraft] = useState(masterLine || item.text);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSummary = item.place === "Summary";
  const done = state?.status;

  async function markCorrect() {
    if (!artifactId) return setError("This resume was not saved. Build it again.");
    setSaving(true);
    setError(null);
    const res = await sendFix({ action: "correct", artifactId, text: item.text });
    setSaving(false);
    if (!res.ok) return setError(res.error);
    onCorrect();
  }

  async function fix(action: "outdated" | "misstated" | "remove") {
    if (!artifactId) return setError("This resume was not saved. Build it again.");
    setSaving(true);
    setError(null);
    const res = await sendFix({ action, artifactId, text: item.text, ...(action !== "remove" ? { sourceLine: masterLine || item.text } : {}), ...(action === "outdated" ? { newLine: draft } : {}) });
    setSaving(false);
    if (!res.ok) return setError(res.error);
    setOpen(null);
    const note =
      action === "outdated"
        ? fromPaste
          ? "Fixed in this resume. Your pasted text is not changed."
          : res.kept
            ? "Fixed. Every resume we build for you now uses your corrected line. It is listed in step 1 to copy into your Word master."
            : "Fixed in this resume."
        : action === "misstated"
          ? "Your master's own wording is back in."
          : "Taken out of the summary.";
    onFixed({ oldText: item.text, newText: res.text, item: res.item, note, correction: action === "outdated" && !fromPaste ? { oldLine: masterLine || item.text, newLine: draft.trim() } : undefined });
  }

  return (
    <li className={`rounded-lg border p-3 ${done ? "border-[var(--accent)] bg-[var(--surface)]" : "border-[var(--line)]"}`}>
      <span className="block text-xs font-bold uppercase tracking-[0.08em] text-[var(--muted)]">{item.place}</span>
      <span className="block text-sm">
        <MarkedLine text={item.text} figures={item.figures} added={item.added} />
      </span>
      {masterLine && <span className="mt-1 block border-l-2 border-[var(--line)] pl-2 text-xs text-[var(--muted)]">From your master: {item.sources.join(" ")}</span>}
      {item.added?.length ? (
        <span className="mt-1 block text-xs text-[var(--muted)]">Uses wording your master does not ({item.added.join(", ")}). Make sure it still describes what you did.</span>
      ) : null}

      {done ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-[var(--accent)]">
          <Check size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{done === "correct" ? "Marked correct." : state?.note}</span>
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="btn btn-secondary text-sm" type="button" onClick={() => void markCorrect()} disabled={saving}>
            {saving && !open ? "Saving..." : "Correct"}
          </button>
          <button className="btn btn-secondary text-sm" type="button" onClick={() => setOpen(open ? null : "choose")} aria-expanded={!!open} disabled={saving}>
            Wrong
          </button>
        </div>
      )}

      {!done && open === "choose" && (
        <div className="mt-3 grid gap-2 rounded-lg border border-[var(--line)] p-3">
          <p className="text-sm font-semibold">What is wrong with it?</p>
          <button className="btn btn-secondary justify-start text-left text-sm" type="button" onClick={() => setOpen("outdated")}>
            My master is out of date
          </button>
          {masterLine ? (
            <button className="btn btn-secondary justify-start text-left text-sm" type="button" onClick={() => void fix("misstated")} disabled={saving}>
              The resume says something my master doesn&apos;t: use my master&apos;s wording
            </button>
          ) : null}
          {isSummary ? (
            <button className="btn btn-secondary justify-start text-left text-sm" type="button" onClick={() => void fix("remove")} disabled={saving}>
              Take this sentence out
            </button>
          ) : null}
        </div>
      )}

      {!done && open === "outdated" && (
        <div className="mt-3 grid gap-2 rounded-lg border border-[var(--line)] p-3">
          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Write the line as it is true today</span>
            <textarea className="input min-h-24 resize-y" value={draft} onChange={(e) => setDraft(e.target.value)} />
          </label>
          <p className="text-xs text-[var(--muted)]">
            {fromPaste ? "This fixes this resume only." : "It replaces this line now, every resume we build for you will use it, and step 1 lists it so you can copy it into your Word master."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary text-sm" type="button" onClick={() => void fix("outdated")} disabled={saving || draft.trim().length < 10}>
              {saving ? "Saving..." : "Save correction"}
            </button>
            <button className="btn btn-secondary text-sm" type="button" onClick={() => setOpen("choose")} disabled={saving}>
              Back
            </button>
          </div>
        </div>
      )}
      {error && <p className="tool-text-error mt-2 text-xs font-semibold">{error}</p>}
    </li>
  );
}

/** Step 1's list of corrections waiting to be copied into the member's Word master. */
export function CorrectionsList({ corrections }: { corrections: Correction[] }) {
  const [copied, setCopied] = useState<number | null>(null);
  if (corrections.length === 0) return null;
  return (
    <div className="grid gap-2 rounded-xl border border-[var(--line)] p-3">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Corrections to copy into your Word master ({corrections.length})</p>
      <p className="text-xs text-[var(--muted)]">Every resume we build for you already uses these. Each one clears on its own once a master you upload says it.</p>
      <ul className="grid gap-2">
        {corrections.map((c, i) => (
          <li key={c.id ?? i} className="grid gap-1 text-sm">
            <span className="text-xs text-[var(--muted)] line-through">{c.oldLine}</span>
            <span className="flex items-start justify-between gap-2">
              <span>{c.newLine}</span>
              <button
                className="btn btn-secondary shrink-0 text-xs"
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(c.newLine).catch(() => {});
                  setCopied(i);
                }}
              >
                <Copy size={12} aria-hidden="true" />
                {copied === i ? "Copied" : "Copy"}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
