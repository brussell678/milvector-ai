"use client";

import { useState, type ReactNode } from "react";
import { ACK_LABEL, DECISION_NOTICE_TITLE, decisionNotice, type AckTool, type DecisionTool } from "@/lib/legal/decision-notice";

// The notice at the top of the Decide tools (lib/legal/decision-notice.ts).
export function DecisionNotice({ tool }: { tool: DecisionTool }) {
  return (
    <div className="tool-alert" data-variant="warn" role="note" aria-label={DECISION_NOTICE_TITLE} data-decision-notice={tool}>
      <p className="tool-alert-title">{DECISION_NOTICE_TITLE}</p>
      <p className="text-sm">{decisionNotice(tool)}</p>
    </div>
  );
}

// Before a member's first use of the VA or SBP tool: the notice and one
// checkbox. Confirming it is recorded once per notice version, then the tool
// opens. The page decides whether it is needed; the tool routes check too.
export function DecisionGate({ tool, kicker, title, required, children }: { tool: AckTool; kicker: string; title: string; required: boolean; children: ReactNode }) {
  const [done, setDone] = useState(!required);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (done) return <>{children}</>;

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/acknowledgments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool }) });
      // 503: the record cannot be kept yet (before migration 0045); the tool opens anyway.
      if (res.ok || res.status === 503) {
        setDone(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "That did not save. Try again.");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="section-card mx-auto w-full max-w-2xl space-y-4" aria-labelledby="decision-gate-title">
        <div>
          <p className="tool-kicker">{kicker}</p>
          <h1 id="decision-gate-title" className="section-title mt-1">
            {title}
          </h1>
          <p className="section-description">Before you start, please read this once.</p>
        </div>
        <DecisionNotice tool={tool} />
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span className="font-medium">{ACK_LABEL}</span>
        </label>
        <button type="button" className="btn btn-primary" disabled={!checked || busy} onClick={() => void confirm()}>
          {busy ? "Saving..." : "Continue"}
        </button>
        {error ? (
          <p className="alert-base alert-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
