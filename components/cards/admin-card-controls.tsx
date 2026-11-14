"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Shown only to the admin on a card page: take a reported card down or restore it.
export function AdminCardControls({ cardId, suspended }: { cardId: string; suspended: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/admin/cards/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suspended: !suspended }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError("That change did not save.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="section-card flex flex-wrap items-center justify-between gap-3 !p-4">
      <p className="text-sm font-bold">Admin: {suspended ? "this card is suspended" : "this card is live or in draft"}</p>
      <button type="button" className="btn btn-secondary text-sm" onClick={toggle} disabled={busy}>
        {busy ? "Saving..." : suspended ? "Restore Card" : "Suspend Card"}
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-[var(--danger,#c2410c)]">
          {error}
        </p>
      )}
    </div>
  );
}
