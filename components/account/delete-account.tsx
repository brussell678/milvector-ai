"use client";

import { useState } from "react";
import Link from "next/link";
import { CONFIRM_WORD } from "@/lib/account/delete";

// Profile: delete the account and everything in it. The member types DELETE,
// the server does the work (app/api/account), then they land on a goodbye page.
export function DeleteAccount() {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = typed.trim() === CONFIRM_WORD;

  async function remove() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: typed.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Something went wrong on our end. Nothing more was deleted. Try again in a minute.");
        return;
      }
      window.location.assign("/account-deleted");
    } catch {
      setError("That didn't go through. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section-card" aria-labelledby="delete-account-title">
      <h2 id="delete-account-title" className="section-title">
        Delete your account
      </h2>
      <p className="section-description">This permanently deletes your MilVector account and everything in it. It can&apos;t be undone.</p>
      <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-[var(--muted)]">
        <li>Your profile, uploaded records, and every resume and file MilVector made for you</li>
        <li>Your tool history, Timeline progress, and LinkedIn drafts</li>
        <li>Your business card and retirement invitation, which go offline, along with the answers your guests sent</li>
        <li>Your support tickets</li>
        <li>Your Community replies and any thread nobody answered. A thread others replied to stays, shown as from a former member.</li>
      </ul>
      <p className="mt-3 text-sm text-[var(--muted)]">
        Want to keep something? Download it from{" "}
        <Link href="/app/documents" className="font-semibold text-[var(--accent)] underline">
          My Files
        </Link>{" "}
        first.
      </p>
      <label className="mt-5 block max-w-sm space-y-1">
        <span className="text-sm font-medium">Type {CONFIRM_WORD} to confirm</span>
        <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
      </label>
      <button type="button" className="btn btn-danger mt-4 w-full sm:w-auto" disabled={!ready || busy} onClick={remove}>
        {busy ? "Deleting…" : "Delete my account"}
      </button>
      {error ? (
        <div className="alert-base alert-error mt-4" role="alert">
          {error}
        </div>
      ) : null}
    </section>
  );
}
