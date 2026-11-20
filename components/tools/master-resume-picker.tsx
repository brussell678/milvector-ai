"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, FileText, Upload } from "lucide-react";
import { ToolAlert } from "@/components/tools/tool-alert";
import type { MasterOption } from "@/lib/master-resume";

// The member's master resume, shown wherever a tool works from it. The member
// chooses it; MilVector never picks one for them. Choosing here changes it for
// every resume tool, because the choice is saved to their profile.

type State = { canSave: boolean; chosen: string | null; options: MasterOption[] };

const formatDate = (iso: string) => new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });

export function originLine(option: MasterOption): string {
  return option.origin === "uploaded" ? `Uploaded by you, ${formatDate(option.createdAt)}` : `Written by MilVector, ${formatDate(option.createdAt)}`;
}

export function MasterResumePicker({
  onSelect,
  purpose,
}: {
  // The master the tool should use right now, or null when there is none.
  onSelect?: (option: MasterOption | null) => void;
  // One line on why this tool needs it.
  purpose?: string;
}) {
  const [state, setState] = useState<State | null>(null);
  const [loadError, setLoadError] = useState("");
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Before the choice can be saved, a pick only applies on this page.
  const [localPick, setLocalPick] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/master-resume", { cache: "no-store" }).catch(() => null);
      const json = res ? await res.json().catch(() => ({})) : {};
      if (cancelled) return;
      if (!res?.ok) {
        setLoadError("Your resumes could not be loaded. Refresh the page to try again.");
        return;
      }
      setState({ canSave: json.canSave !== false, chosen: json.chosen ?? null, options: json.options ?? [] });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const options = state?.options ?? [];
  const activeRef = state ? (state.canSave ? state.chosen : (localPick ?? options.find((o) => o.ready)?.ref ?? null)) : null;
  const active = options.find((option) => option.ref === activeRef && option.ready) ?? null;
  const missing = !!state?.canSave && !!state.chosen && !options.some((option) => option.ref === state.chosen);

  // Tell the tool which master to use whenever it changes.
  useEffect(() => {
    if (state) onSelect?.(active);
    // onSelect is a setter from the parent; the active master is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, active?.ref]);

  async function choose(option: MasterOption) {
    setError("");
    setNotice("");
    if (!state?.canSave) {
      setLocalPick(option.ref);
      setChanging(false);
      return;
    }
    setBusy(option.ref);
    const res = await fetch("/api/master-resume", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: option.ref }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy("");
    if (!res?.ok) {
      setError(json.error ?? "That did not save. Check your connection and try again.");
      return;
    }
    setState({ ...state, chosen: option.ref });
    setChanging(false);
    setNotice("Saved. Every resume tool now works from this one.");
  }

  if (loadError) return <ToolAlert variant="error">{loadError}</ToolAlert>;
  if (!state) return <p className="text-sm text-[var(--muted)]">Loading your master resume...</p>;

  const list = changing || !active;

  return (
    <div className="grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4" aria-live="polite">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Your master resume</p>
        {purpose && <p className="mt-1 text-sm text-[var(--muted)]">{purpose}</p>}
      </div>

      {options.length === 0 ? (
        <div className="grid gap-2 text-sm">
          <p>You do not have a master resume yet. Every resume tool works from one.</p>
          <div className="flex flex-wrap gap-2">
            <Link className="btn btn-primary text-sm" href="/app/tools/fitrep-bullets">
              Build one from your records
            </Link>
            <Link className="btn btn-secondary text-sm" href="/app/documents">
              <Upload size={14} aria-hidden="true" />
              Upload yours
            </Link>
          </div>
        </div>
      ) : (
        <>
          {active && !changing && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <FileText size={20} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="break-words font-semibold">{active.name}</p>
                  <p className="text-xs text-[var(--muted)]">{originLine(active)}</p>
                </div>
              </div>
              <button type="button" className="btn btn-secondary shrink-0 text-sm" onClick={() => setChanging(true)}>
                Change
              </button>
            </div>
          )}

          {list && (
            <>
              {missing && <ToolAlert variant="warn">The master resume you chose has been deleted. Choose another one.</ToolAlert>}
              {!active && !missing && state.canSave && (
                <p className="text-sm font-medium">Choose which resume is your master. Every resume tool works from it.</p>
              )}
              <ul className="grid max-h-80 gap-2 overflow-y-auto">
                {options.map((option) => {
                  const current = option.ref === activeRef;
                  return (
                    <li key={option.ref}>
                      <button
                        type="button"
                        onClick={() => void choose(option)}
                        disabled={!option.ready || !!busy}
                        aria-pressed={current}
                        className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm disabled:opacity-60 ${
                          current ? "border-[var(--accent)] bg-[var(--panel)]" : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--muted)]"
                        }`}
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-[var(--line)]" aria-hidden="true">
                          {current && <Check size={12} strokeWidth={3} className="text-[var(--accent)]" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block break-words font-semibold">{option.name}</span>
                          <span className="block text-xs text-[var(--muted)]">
                            {originLine(option)}
                            {!option.ready ? ". Not ready to use yet; check it in My Files." : ""}
                            {busy === option.ref ? ". Saving..." : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {changing && active && (
                <div>
                  <button type="button" className="btn btn-ghost text-sm" onClick={() => setChanging(false)}>
                    Keep {active.name.length > 40 ? "the current one" : active.name}
                  </button>
                </div>
              )}
            </>
          )}

          {active?.origin === "milvector" && !list && (
            <p className="text-xs text-[var(--muted)]">
              A MilVector draft gets you most of the way. Download it, refine it in Word, upload it to My Files, then choose that version here.
            </p>
          )}
          <p className="text-xs text-[var(--muted)]">
            Refined a new version?{" "}
            <Link className="font-semibold underline" href="/app/documents">
              Upload it to My Files
            </Link>{" "}
            as a Master Resume, then choose it here.
          </p>
          {!state.canSave && <p className="text-xs text-[var(--muted)]">For now your choice applies on this page only.</p>}
        </>
      )}

      {error && <ToolAlert variant="error">{error}</ToolAlert>}
      {notice && <p className="text-sm font-medium text-[var(--accent)]">{notice}</p>}
    </div>
  );
}
