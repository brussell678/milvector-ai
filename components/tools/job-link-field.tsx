"use client";

// A job posting link, for the JD Decoder and the Targeted Resume Builder. On a
// phone, copying a whole posting is hard; copying its link is easy. The tool
// reads the posting from the link when the member runs it.

export type LoadedPosting = { title: string | null; company: string | null; location: string | null; text: string; url: string };

export async function readPostingFromLink(link: string): Promise<{ ok: true; posting: LoadedPosting } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/tools/job-posting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: link }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "We could not read that posting. Paste the description instead." };
    return { ok: true, posting: data as LoadedPosting };
  } catch {
    return { ok: false, error: "That didn't go through. Check your connection and try again." };
  }
}

/** One line saying what was read, shown under the link. */
export function postingSummary(posting: LoadedPosting) {
  let host = "";
  try {
    host = new URL(posting.url).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }
  const what = posting.title ? `${posting.title}${posting.company ? ` at ${posting.company}` : ""}` : "the posting";
  return `Read ${what}${host ? ` from ${host}` : ""}. It is filled in below.`;
}

export function JobLinkField({
  value,
  onChange,
  note,
  error,
  disabled,
  id = "job-link",
}: {
  value: string;
  onChange: (value: string) => void;
  note?: string | null;
  error?: string | null;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <div className="grid gap-1">
      <label className="text-sm font-medium" htmlFor={id}>
        Job posting link
      </label>
      <input
        id={id}
        className="input"
        // Text, not type="url": a phone's share sheet pastes "Job title at
        // Company https://...", which the browser would refuse to submit.
        type="text"
        inputMode="url"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="go"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://careers.company.com/jobs/..."
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="text-xs text-[var(--muted)]">
        On your phone? Paste the link and we read the posting for you. Works with most company career sites and USAJOBS. LinkedIn and some job
        boards do not allow it.
      </p>
      {note && !error && (
        <p className="text-xs font-semibold text-[var(--accent)]" aria-live="polite">
          {note}
        </p>
      )}
      {error && (
        <p className="tool-text-error text-sm font-semibold" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
