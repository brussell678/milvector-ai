"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Download, QrCode, Share2, UserPlus } from "lucide-react";
import type { EventSource } from "@/lib/cards/schema";

// Everything interactive on the public card: saving the contact, sharing your
// own details back, showing the QR code, and counting visits.

type Props = {
  slug: string;
  ownerFirstName: string;
  source: EventSource;
  leadCapture: boolean;
  qrSvg: string;
  shareUrl: string;
  // False for the owner's own preview and for cards that are not live.
  track: boolean;
};

function send(slug: string, kind: "view" | "save" | "link", source: EventSource) {
  const body = JSON.stringify({ kind, source });
  try {
    if (navigator.sendBeacon?.(`/c/${slug}/event`, new Blob([body], { type: "application/json" }))) return;
  } catch {
    // fall through to fetch
  }
  void fetch(`/c/${slug}/event`, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}

const primary = { background: "var(--card-accent)", color: "var(--card-on-accent)" };
const secondary = { background: "var(--card-soft)", color: "var(--card-fg)", border: "1px solid var(--card-line)" };
const field = {
  background: "var(--card-bg)",
  color: "var(--card-fg)",
  border: "1px solid var(--card-line)",
};

export function CardActions({ slug, ownerFirstName, source, leadCapture, qrSvg, shareUrl, track }: Props) {
  const [panel, setPanel] = useState<"none" | "lead" | "qr">("none");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const counted = useRef(false);

  useEffect(() => {
    if (!track) return;
    if (!counted.current) {
      counted.current = true;
      send(slug, "view", source);
    }
    // Count taps on the card's links without making every link a client component.
    const onClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement | null)?.closest?.("a[data-card-link]");
      if (link) send(slug, "link", source);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [slug, source, track]);

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The visitor closed the share sheet. Nothing to do.
    }
  }

  async function submitLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("sending");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]));
    try {
      const res = await fetch(`/c/${slug}/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, source }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "That did not go through. Please try again.");
        setStatus("idle");
        return;
      }
      setStatus("sent");
    } catch {
      setError("That did not go through. Check your connection and try again.");
      setStatus("idle");
    }
  }

  const inputClass = "min-h-[46px] w-full rounded-xl px-3 text-base";

  return (
    <div className="space-y-2">
      <a
        href={`/c/${slug}/vcard`}
        onClick={() => track && send(slug, "save", source)}
        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-base font-extrabold"
        style={primary}
      >
        <Download size={18} aria-hidden="true" />
        Save Contact
      </a>

      <div className="grid gap-2" style={{ gridTemplateColumns: leadCapture ? "1fr auto auto" : "1fr 1fr" }}>
        {leadCapture && (
          <button
            type="button"
            onClick={() => setPanel(panel === "lead" ? "none" : "lead")}
            aria-expanded={panel === "lead"}
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-3 text-sm font-bold"
            style={secondary}
          >
            <UserPlus size={16} aria-hidden="true" />
            Share your info{ownerFirstName ? ` with ${ownerFirstName}` : ""}
          </button>
        )}
        <button
          type="button"
          onClick={() => setPanel(panel === "qr" ? "none" : "qr")}
          aria-expanded={panel === "qr"}
          aria-label="Show QR code"
          className="flex min-h-[48px] min-w-[48px] items-center justify-center gap-2 rounded-2xl px-3 text-sm font-bold"
          style={secondary}
        >
          <QrCode size={18} aria-hidden="true" />
          {!leadCapture && "QR code"}
        </button>
        <button
          type="button"
          onClick={share}
          aria-label="Share this card"
          className="flex min-h-[48px] min-w-[48px] items-center justify-center gap-2 rounded-2xl px-3 text-sm font-bold"
          style={secondary}
        >
          {copied ? <Check size={18} aria-hidden="true" /> : <Share2 size={18} aria-hidden="true" />}
          {!leadCapture && (copied ? "Link copied" : "Share")}
        </button>
      </div>
      <p aria-live="polite" className="sr-only">
        {copied ? "Link copied" : ""}
      </p>

      {panel === "qr" && (
        <div className="rounded-2xl p-4 text-center" style={secondary}>
          <div className="mx-auto w-48 rounded-xl bg-white p-2" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <p className="mt-3 text-sm" style={{ color: "var(--card-muted)" }}>
            Point a phone camera at this code to open the card.
          </p>
        </div>
      )}

      {panel === "lead" && (
        <div className="rounded-2xl p-4" style={secondary}>
          {status === "sent" ? (
            <p className="flex items-center gap-2 text-sm font-bold" role="status">
              <Check size={18} aria-hidden="true" style={{ color: "var(--card-accent)" }} />
              Sent. {ownerFirstName || "They"} now {ownerFirstName ? "has" : "have"} your details.
            </p>
          ) : (
            <form onSubmit={submitLead} className="space-y-3">
              <p className="text-sm" style={{ color: "var(--card-muted)" }}>
                Your details go only to {ownerFirstName || "the card owner"}. Add an email or a phone number.
              </p>
              <label className="block text-sm font-bold">
                Name
                <input name="name" required minLength={2} maxLength={80} autoComplete="name" className={`${inputClass} mt-1`} style={field} />
              </label>
              <label className="block text-sm font-bold">
                Email
                <input name="email" type="email" maxLength={120} autoComplete="email" className={`${inputClass} mt-1`} style={field} />
              </label>
              <label className="block text-sm font-bold">
                Phone
                <input name="phone" type="tel" maxLength={30} autoComplete="tel" className={`${inputClass} mt-1`} style={field} />
              </label>
              <label className="block text-sm font-bold">
                Organization <span style={{ color: "var(--card-muted)", fontWeight: 500 }}>(optional)</span>
                <input name="company" maxLength={80} autoComplete="organization" className={`${inputClass} mt-1`} style={field} />
              </label>
              <label className="block text-sm font-bold">
                Note <span style={{ color: "var(--card-muted)", fontWeight: 500 }}>(optional)</span>
                <textarea name="note" maxLength={300} rows={2} className="mt-1 w-full rounded-xl px-3 py-2 text-base" style={field} />
              </label>
              {/* Honeypot. Hidden from people, tempting to bots. */}
              <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 0, overflow: "hidden" }}>
                <label>
                  Website
                  <input name="website" tabIndex={-1} autoComplete="off" />
                </label>
              </div>
              {error && (
                <p role="alert" className="text-sm font-bold" style={{ color: "#c2410c" }}>
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={status === "sending"}
                className="flex min-h-[48px] w-full items-center justify-center rounded-2xl text-base font-extrabold disabled:opacity-60"
                style={primary}
              >
                {status === "sending" ? "Sending..." : "Send My Details"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
