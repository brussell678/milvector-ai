"use client";

import { useState } from "react";
import type { ChatSwitch } from "@/lib/chat/access";

// Admin: who sees each chat view (docs/CHAT_TOOLS_PLAN.md, Phase 6). Opening a
// chat to members asks first; closing it does not, since members simply go
// back to the classic page. Either way it shows on their next page load.

const day = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));

function SwitchRow({ initial }: { initial: ChatSwitch }) {
  const [item, setItem] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function flip(open: boolean) {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const res = await fetch("/api/admin/chat-access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: item.key, open }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "That did not save. Try again.");
        return;
      }
      setItem({ ...item, open: !!data.open, updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : item.updatedAt });
      setConfirming(false);
      setNote(data.open ? "Open. Members get the chat on their next page load." : "Closed. Members get the classic page on their next page load.");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4" data-chat-switch={item.key}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{item.label}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {item.open ? (
              <>
                <strong className="text-[var(--foreground)]">Open to members</strong>
                {item.updatedAt ? <span suppressHydrationWarning> since {day(item.updatedAt)}</span> : null}
              </>
            ) : (
              "Admin only. Members get the classic page."
            )}
          </p>
        </div>
        {!confirming ? (
          item.open ? (
            <button type="button" className="btn btn-secondary shrink-0 text-sm" disabled={busy} onClick={() => void flip(false)}>
              {busy ? "Closing…" : "Close to members"}
            </button>
          ) : (
            <button type="button" className="btn btn-primary shrink-0 text-sm" disabled={busy} onClick={() => setConfirming(true)}>
              Open to members
            </button>
          )
        ) : null}
      </div>
      {confirming ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-sm font-medium">
            Open the {item.label} chat to every member now? Publish its What&apos;s New entry when you do, so they know what changed.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary text-sm" disabled={busy} onClick={() => void flip(true)}>
              {busy ? "Opening…" : "Yes, open it"}
            </button>
            <button type="button" className="btn btn-secondary text-sm" disabled={busy} onClick={() => setConfirming(false)}>
              Not yet
            </button>
          </div>
        </div>
      ) : null}
      {note ? (
        <p className="alert-base alert-success mt-3" aria-live="polite">
          {note}
        </p>
      ) : null}
      {error ? (
        <p className="alert-base alert-error mt-3" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function ChatAccessPanel({ switches }: { switches: ChatSwitch[] | null }) {
  return (
    <section className="section-card" aria-labelledby="chat-access-title">
      <p className="section-kicker">CHAT TOOLS</p>
      <h2 id="chat-access-title" className="section-title mt-1">
        Who sees each chat
      </h2>
      {switches ? (
        <>
          <p className="section-description">
            You always see every chat. Open one to members and they get it on their next page load; close it and they go back to the classic page.
            Nothing is redeployed, and the classic page stays at ?view=classic either way.
          </p>
          <ul className="mt-4 grid gap-3">
            {switches.map((item) => (
              <SwitchRow key={item.key} initial={item} />
            ))}
          </ul>
        </>
      ) : (
        <p className="section-description">
          The chat switches need migration 0044 run in Supabase first. Until then every chat stays admin only, and members keep the classic pages.
        </p>
      )}
    </section>
  );
}
