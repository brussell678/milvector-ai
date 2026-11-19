"use client";

import { useState, useSyncExternalStore } from "react";

const subscribe = () => () => {};
const canShareNow = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

// Share and copy buttons for the guest page. The share sheet only appears on
// devices that have one; copying works everywhere.
export function ShareActions({ url, title, accent, onAccent, accentText }: { url: string; title: string; accent: string; onAccent: string; accentText: string }) {
  const canShare = useSyncExternalStore(subscribe, canShareNow, () => false);
  const [status, setStatus] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied.");
    } catch {
      setStatus(`Copy this link: ${url}`);
    }
  }

  async function share() {
    try {
      await navigator.share({ title, url });
    } catch {
      // The guest closed the share sheet. Nothing to report.
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {canShare && (
          <button type="button" onClick={share} className="min-h-11 rounded-xl px-5 text-sm font-bold" style={{ background: accent, color: onAccent }}>
            Share the link
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          className="min-h-11 rounded-xl border px-5 text-sm font-bold"
          style={{ borderColor: accentText, color: accentText, background: "transparent" }}
        >
          Copy link
        </button>
      </div>
      <p className="mt-2 min-h-5 text-sm" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
