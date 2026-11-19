"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Camera, Check, Copy, Download, ExternalLink, Plus, Trash2 } from "lucide-react";
import { InviteView } from "@/components/invites/invite-view";
import { ToolAlert } from "@/components/tools/tool-alert";
import { opsecWarnings } from "@/lib/invites/opsec";
import {
  BRANCHES,
  BRANCH_NAMES,
  COVER_MAX_CHARS,
  MAX_EVENTS,
  TIME_ZONES,
  blankEvent,
  starterInvite,
  type InviteData,
  type InviteEvent,
} from "@/lib/invites/schema";
import { ACCENT_PRESETS, TEMPLATES, TEMPLATE_IDS, inviteColors, readTemplate } from "@/lib/invites/templates";
import { ceremonyOf, eventIsComplete, formatDateLong, formatTime, publicLocation, sortEvents } from "@/lib/invites/time";
import { siteUrl } from "@/lib/seo";

type SavedInvite = {
  id: string;
  slug: string;
  invite: InviteData;
  cover: string | null;
  published: boolean;
  suspended: boolean;
  updatedAt: string;
};
type Defaults = { name: string; rank: string; branch: string; ceremonyDate: string; email: string };
type Tab = "basics" | "events" | "look" | "preview" | "share";
type Message = { kind: "ok" | "error"; text: string } | null;

const pageUrlFor = (slug: string) => `${siteUrl}/r/${slug}`;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-[var(--muted)]">{hint}</span> : null}
    </label>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary text-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      }}
    >
      {done ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      {done ? "Copied" : label}
    </button>
  );
}

function download(filename: string, content: string | Blob, type = "text/plain") {
  const blob = typeof content === "string" ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Shrinks a photo to at most 1600px on its long edge and re-encodes it as a
// JPEG in the browser. Re-encoding also drops the location data phones store
// in photos. Steps down until it fits the storage limit.
async function processCover(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  for (const [edge, quality] of [
    [1600, 0.82],
    [1400, 0.78],
    [1200, 0.72],
    [1000, 0.7],
  ] as const) {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL("image/jpeg", quality).split(",")[1] ?? "";
    if (base64.length <= COVER_MAX_CHARS) return base64;
  }
  throw new Error("too large");
}

function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

// ─── Builder ──────────────────────────────────────────────────────────

export function RetirementInvitationBuilder() {
  const [saved, setSaved] = useState<SavedInvite | null>(null);
  const [defaults, setDefaults] = useState<Defaults | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [draft, setDraft] = useState<InviteData | null>(null);
  const [slugDraft, setSlugDraft] = useState("");
  const [tab, setTab] = useState<Tab>("basics");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const dirty = !!saved && !!draft && (JSON.stringify(saved.invite) !== JSON.stringify(draft) || saved.slug !== slugDraft);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/invites").catch(() => null);
      const json = res ? await res.json().catch(() => ({})) : {};
      if (cancelled) return;
      if (!res?.ok) {
        setLoadError(json.error ?? "Your invitation could not be loaded. Check your connection and refresh the page.");
      } else {
        setDefaults(json.defaults);
        if (json.invite) {
          setSaved(json.invite);
          setDraft(json.invite.invite);
          setSlugDraft(json.invite.slug);
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const warnings = useMemo(() => (draft ? opsecWarnings(draft) : []), [draft]);

  function adopt(next: SavedInvite) {
    setSaved(next);
    setDraft(next.invite);
    setSlugDraft(next.slug);
  }

  async function patch(body: Record<string, unknown>, okText: string): Promise<boolean> {
    if (!saved) return false;
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/invites/${saved.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setSaving(false);
    if (!res?.ok || !json.invite) {
      setMessage({ kind: "error", text: json.error ?? "That did not save. Check your connection and try again. Your changes are still here." });
      return false;
    }
    // A cover or publish change must not throw away unsaved typing.
    if (body.invite !== undefined || body.slug !== undefined) adopt(json.invite);
    else setSaved(json.invite);
    setMessage({ kind: "ok", text: json.profileUpdated ? `${okText} Your profile's ceremony date was updated to match.` : okText });
    return true;
  }

  const changes = () => ({ invite: draft, ...(saved && slugDraft !== saved.slug ? { slug: slugDraft } : {}) });
  const save = () => patch(changes(), "Saved.");

  async function togglePublish() {
    if (!saved) return;
    if (!saved.published) {
      const ok = await patch({ ...(dirty ? changes() : {}), published: true }, "Published. Your invitation is live.");
      if (ok) setTab("share");
      return;
    }
    if (!window.confirm("Unpublish? Guests who open the link or scan the code will see a page not found until you publish again.")) return;
    await patch({ published: false }, "Unpublished. Guests can no longer see the page.");
  }

  async function onCover(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const cover = await processCover(file);
      await patch({ cover }, "Cover photo saved.");
    } catch {
      setMessage({ kind: "error", text: "That image could not be used. Try a JPEG or PNG photo." });
    }
  }

  async function removeInvite() {
    if (!saved) return;
    if (!window.confirm("Delete this invitation? The link and QR code stop working and everything on the page is removed. This cannot be undone.")) return;
    setSaving(true);
    const res = await fetch(`/api/invites/${saved.id}`, { method: "DELETE" }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setMessage({ kind: "error", text: "The invitation could not be deleted. Try again." });
      return;
    }
    setSaved(null);
    setDraft(null);
    setSlugDraft("");
    setTab("basics");
    setMessage(null);
  }

  // ── Draft editing helpers ──
  const set = <K extends keyof InviteData>(key: K, value: InviteData[K]) => setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  const setRetiree = (patchValue: Partial<InviteData["retiree"]>) => setDraft((prev) => (prev ? { ...prev, retiree: { ...prev.retiree, ...patchValue } } : prev));
  const setEvent = (id: string, patchValue: Partial<InviteEvent>) =>
    setDraft((prev) => (prev ? { ...prev, events: prev.events.map((event) => (event.id === id ? { ...event, ...patchValue } : event)) } : prev));
  const addEvent = () =>
    setDraft((prev) => {
      if (!prev || prev.events.length >= MAX_EVENTS) return prev;
      const next = blankEvent("");
      next.date = prev.events[0]?.date ?? "";
      return { ...prev, events: [...prev.events, next] };
    });
  const removeEvent = (id: string) => setDraft((prev) => (prev ? { ...prev, events: prev.events.filter((event) => event.id !== id) } : prev));

  // ── Screens ──
  if (loading) return <p className="section-card text-sm text-[var(--muted)]">Loading your invitation...</p>;
  if (loadError) return <ToolAlert variant="error">{loadError}</ToolAlert>;
  if (!saved || !draft) return <StartPanel defaults={defaults} onCreated={(invite) => { adopt(invite); setTab("basics"); }} />;

  const status = saved.suspended ? "Suspended" : saved.published ? "Live" : "Draft";
  const tabs: { id: Tab; label: string; phoneOnly?: boolean }[] = [
    { id: "basics", label: "Basics" },
    { id: "events", label: "Events" },
    { id: "look", label: "Look" },
    { id: "preview", label: "Preview", phoneOnly: true },
    { id: "share", label: "Share" },
  ];
  const coverSrc = saved.cover ? `data:image/jpeg;base64,${saved.cover}` : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Status and publish */}
      <section className="section-card flex flex-wrap items-center gap-3 !p-4">
        {/* Full width on phones so the address does not wrap beside the buttons */}
        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Your page</p>
          <p className="break-all text-sm font-semibold">{pageUrlFor(saved.slug).replace("https://", "")}</p>
        </div>
        <span className={`tool-badge ${saved.published && !saved.suspended ? "tool-badge-success" : "tool-badge-warn"}`}>{status}</span>
        {!saved.suspended && (
          <button type="button" className={`btn text-sm ${saved.published ? "btn-secondary" : "btn-primary"}`} onClick={togglePublish} disabled={saving}>
            {saved.published ? "Unpublish" : dirty ? "Save and Publish" : "Publish"}
          </button>
        )}
      </section>

      {saved.suspended && (
        <ToolAlert variant="stop" title="This invitation was taken down">
          MilVector suspended this page after a report. Guests cannot see it. Open a support request if you think this is a mistake.
        </ToolAlert>
      )}

      <nav className="grid grid-cols-3 gap-1 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-1 sm:grid-cols-5 lg:grid-cols-4" aria-label="Invitation sections">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? "page" : undefined}
            className={`${item.phoneOnly ? "lg:hidden" : ""} min-h-11 rounded-lg px-2 text-center text-sm font-semibold transition-colors ${
              tab === item.id ? "bg-[var(--accent)] text-white shadow-[var(--shadow-sm)]" : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div aria-live="polite">{message && <ToolAlert variant={message.kind === "ok" ? "info" : "error"}>{message.text}</ToolAlert>}</div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {warnings.length > 0 && (tab === "basics" || tab === "events") && (
            <ToolAlert variant="warn" title="Before you publish">
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </ToolAlert>
          )}

          {tab === "basics" && (
            <BasicsTab draft={draft} slugDraft={slugDraft} setSlugDraft={setSlugDraft} set={set} setRetiree={setRetiree} onDelete={removeInvite} saving={saving} />
          )}
          {tab === "events" && <EventsTab draft={draft} set={set} setEvent={setEvent} addEvent={addEvent} removeEvent={removeEvent} />}
          {tab === "look" && <LookTab draft={draft} set={set} cover={coverSrc} onCover={onCover} onRemoveCover={() => patch({ cover: null }, "Cover photo removed.")} saving={saving} />}
          {tab === "preview" && (
            <div className="overflow-hidden rounded-2xl border border-[var(--line)] lg:hidden">
              <div className="pointer-events-none select-none" aria-hidden="true">
                <InviteView data={draft} slug={saved.slug} pageUrl={pageUrlFor(slugDraft)} coverSrc={coverSrc} framed />
              </div>
            </div>
          )}
          {tab === "share" && <ShareTab saved={saved} dirty={dirty} onPublish={togglePublish} saving={saving} />}
        </div>

        {/* Live preview beside the editor on wide screens */}
        <aside className="hidden lg:sticky lg:top-4 lg:block" aria-label="Preview of the guest page">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">What a guest sees on a phone</p>
          <div className="h-[760px] overflow-y-auto rounded-[28px] border-[10px] border-[#1a1f1b] bg-[#1a1f1b] shadow-[var(--shadow-lg)]">
            <div className="pointer-events-none select-none overflow-hidden rounded-[18px]" aria-hidden="true">
              <InviteView data={draft} slug={saved.slug} pageUrl={pageUrlFor(slugDraft)} coverSrc={coverSrc} framed />
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">Updates as you type. Guests see the last saved version.</p>
        </aside>
      </div>

      {/* Save bar while there are unsaved changes. Sticky, not fixed: it rides
          the bottom of the screen while the form scrolls and comes to rest
          above the site footer, and the phone menu still opens over it. A
          fixed bar here is covered by the footer, which shares its layer. */}
      {dirty && (
        <div
          className="sticky bottom-0 z-20 -mx-1 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 shadow-[var(--shadow-lg)]"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">You have unsaved changes</p>
            <button type="button" className="btn btn-primary text-sm" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Start ────────────────────────────────────────────────────────────

function StartPanel({ defaults, onCreated }: { defaults: Defaults | null; onCreated: (invite: SavedInvite) => void }) {
  const [name, setName] = useState(defaults?.name ?? "");
  const [rank, setRank] = useState(defaults?.rank ?? "");
  const [date, setDate] = useState(defaults?.ceremonyDate ?? "");
  const [start, setStart] = useState("10:00");
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const invite = starterInvite({ name, rank, branch: defaults?.branch, ceremonyDate: date, email: defaults?.email, timeZone: localTimeZone() });
    invite.events[0] = { ...invite.events[0], start, place };
    const res = await fetch("/api/invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invite }) }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok || !json.invite) {
      setError(json.error ?? "That did not go through. Check your connection and try again.");
      return;
    }
    onCreated(json.invite);
  }

  return (
    <section className="section-card">
      <p className="section-kicker">START HERE</p>
      <h2 className="section-title">Start with the ceremony</h2>
      <p className="section-description">
        Three details get you a page to work from. Your name, rank, and ceremony date come from your profile. Nothing is visible to anyone until you
        publish.
      </p>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={create}>
        <Field label="Rank" hint="Spelled out reads best, e.g. Chief Warrant Officer.">
          <input className="input" value={rank} onChange={(e) => setRank(e.target.value)} maxLength={40} />
        </Field>
        <Field label="Name, as guests know it">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required minLength={2} />
        </Field>
        <Field label="Ceremony date" hint={defaults?.ceremonyDate ? "From your profile." : "Saved to your profile too, for your Timeline."}>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Start time">
          <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Where (optional)" hint="The building or place name. You can add the address next.">
            <input className="input" value={place} onChange={(e) => setPlace(e.target.value)} maxLength={100} placeholder="e.g. Battalion ramp, Bldg. 1854" />
          </Field>
        </div>
        {error && (
          <div className="sm:col-span-2">
            <ToolAlert variant="error">{error}</ToolAlert>
          </div>
        )}
        <div className="sm:col-span-2">
          <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={busy}>
            <Plus size={16} aria-hidden="true" />
            {busy ? "Creating..." : "Create My Invitation"}
          </button>
        </div>
      </form>
    </section>
  );
}

// ─── Basics ───────────────────────────────────────────────────────────

function BasicsTab({
  draft,
  slugDraft,
  setSlugDraft,
  set,
  setRetiree,
  onDelete,
  saving,
}: {
  draft: InviteData;
  slugDraft: string;
  setSlugDraft: (value: string) => void;
  set: <K extends keyof InviteData>(key: K, value: InviteData[K]) => void;
  setRetiree: (value: Partial<InviteData["retiree"]>) => void;
  onDelete: () => void;
  saving: boolean;
}) {
  return (
    <>
      <section className="tool-section">
        <p className="tool-kicker">THE RETIREE</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rank" hint="Spelled out reads best, e.g. Chief Warrant Officer.">
            <input className="input" value={draft.retiree.rank} onChange={(e) => setRetiree({ rank: e.target.value })} maxLength={40} />
          </Field>
          <Field label="Name, as guests know it">
            <input className="input" value={draft.retiree.name} onChange={(e) => setRetiree({ name: e.target.value })} maxLength={80} />
          </Field>
          <Field label="Branch">
            <select className="input" value={draft.retiree.branch} onChange={(e) => setRetiree({ branch: e.target.value as InviteData["retiree"]["branch"] })}>
              {BRANCHES.map((branch) => (
                <option key={branch} value={branch}>
                  {BRANCH_NAMES[branch]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Questions go to" hint="Shown at the bottom of the page. A personal address keeps working after you retire.">
            <input className="input" type="email" value={draft.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} maxLength={120} />
          </Field>
        </div>
        <Field label="Welcome line" hint={`Under your name at the top of the page. ${300 - draft.welcome.length} characters left.`}>
          <textarea className="input min-h-24" value={draft.welcome} onChange={(e) => set("welcome", e.target.value)} maxLength={300} />
        </Field>
      </section>

      <section className="tool-section">
        <p className="tool-kicker">HOW TIMES ARE SHOWN</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["24h", "Military time", "1000 until 1130"],
              ["12h", "Civilian time", "10:00 AM to 11:30 AM"],
            ] as const
          ).map(([value, label, example]) => (
            <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${draft.timeFormat === value ? "border-[var(--accent)] bg-[var(--surface)]" : "border-[var(--line)]"}`}>
              <input type="radio" name="timeFormat" className="mt-1" checked={draft.timeFormat === value} onChange={() => set("timeFormat", value)} />
              <span>
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-xs text-[var(--muted)]">{example}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="tool-section">
        <p className="tool-kicker">PAGE ADDRESS</p>
        <Field
          label="milvector.org/r/"
          hint="Lowercase letters, numbers, and hyphens. The random ending stops people finding your page by guessing your name. You can shorten it, but the QR code and any links you already sent will stop working."
        >
          <input className="input" value={slugDraft} onChange={(e) => setSlugDraft(e.target.value.toLowerCase())} maxLength={40} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </Field>
      </section>

      <section className="tool-section">
        <p className="tool-kicker">START OVER</p>
        <p className="text-sm text-[var(--muted)]">Deleting removes the page, its link, and its QR code. You can then start a new one.</p>
        <button type="button" className="btn btn-secondary w-full text-sm sm:w-auto" onClick={onDelete} disabled={saving}>
          <Trash2 size={14} aria-hidden="true" />
          Delete this invitation
        </button>
      </section>
    </>
  );
}

// ─── Events ───────────────────────────────────────────────────────────

function EventsTab({
  draft,
  set,
  setEvent,
  addEvent,
  removeEvent,
}: {
  draft: InviteData;
  set: <K extends keyof InviteData>(key: K, value: InviteData[K]) => void;
  setEvent: (id: string, value: Partial<InviteEvent>) => void;
  addEvent: () => void;
  removeEvent: (id: string) => void;
}) {
  const zones = TIME_ZONES.some((zone) => zone.id === draft.timeZone) ? TIME_ZONES : [{ id: draft.timeZone, label: draft.timeZone }, ...TIME_ZONES];
  return (
    <>
      <section className="tool-section">
        <Field label="Time zone of the events" hint="Calendar entries use it, so guests traveling in see the right local time.">
          <select className="input" value={draft.timeZone} onChange={(e) => set("timeZone", e.target.value)}>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.label}
              </option>
            ))}
          </select>
        </Field>
      </section>

      {draft.events.map((event, index) => (
        <section key={event.id} className="tool-section">
          <div className="flex items-center justify-between gap-2">
            <p className="tool-kicker">{index === 0 ? "THE CEREMONY" : `EVENT ${index + 1}`}</p>
            {index > 0 && (
              <button type="button" className="btn btn-ghost text-sm" onClick={() => removeEvent(event.id)}>
                <Trash2 size={14} aria-hidden="true" />
                Remove
              </button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Name of the event">
                <input
                  className="input"
                  value={event.name}
                  onChange={(e) => setEvent(event.id, { name: e.target.value })}
                  maxLength={60}
                  placeholder={index === 0 ? "Retirement Ceremony" : "e.g. Reception, Retirement Party, Dinner"}
                />
              </Field>
            </div>
            <Field label="Date" hint={index === 0 ? "Saving updates your profile's ceremony date, so your Timeline counts down to it." : undefined}>
              <input className="input" type="date" value={event.date} onChange={(e) => setEvent(event.id, { date: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts">
                <input className="input" type="time" value={event.start} onChange={(e) => setEvent(event.id, { start: e.target.value })} />
              </Field>
              <Field label="Ends" hint="Optional.">
                <input className="input" type="time" value={event.end} onChange={(e) => setEvent(event.id, { end: e.target.value })} />
              </Field>
            </div>
            <Field label="Place" hint="Building, venue, or home.">
              <input className="input" value={event.place} onChange={(e) => setEvent(event.id, { place: e.target.value })} maxLength={100} />
            </Field>
            <Field label="Address">
              <input className="input" value={event.address} onChange={(e) => setEvent(event.id, { address: e.target.value })} maxLength={200} autoComplete="off" />
            </Field>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={event.addressPrivate} onChange={(e) => setEvent(event.id, { addressPrivate: e.target.checked })} />
            <span>
              <span className="font-medium">This is a private home. Share the address only after RSVP.</span>
              <span className="block text-xs text-[var(--muted)]">The street address stays off the public page and out of calendar files.</span>
            </span>
          </label>
          {event.addressPrivate && (
            <Field label="Town and state everyone sees" hint="So guests can plan travel before they RSVP.">
              <input className="input" value={event.area} onChange={(e) => setEvent(event.id, { area: e.target.value })} maxLength={80} placeholder="e.g. North Topsail Beach, NC" />
            </Field>
          )}

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={event.onBase} onChange={(e) => setEvent(event.id, { onBase: e.target.checked })} />
            <span>
              <span className="font-medium">Aboard a military installation</span>
              <span className="block text-xs text-[var(--muted)]">The page tells guests without a DoD ID that they need a visitor pass.</span>
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Dress, military" hint="e.g. Service Alphas, or utilities.">
              <input className="input" value={event.dressMilitary} onChange={(e) => setEvent(event.id, { dressMilitary: e.target.value })} maxLength={120} />
            </Field>
            <Field label="Dress, civilian" hint="e.g. Business casual.">
              <input className="input" value={event.dressCivilian} onChange={(e) => setEvent(event.id, { dressCivilian: e.target.value })} maxLength={120} />
            </Field>
          </div>
          <Field label="Good to know" hint="Food, drink, parking, kids, anything guests should plan for.">
            <textarea className="input min-h-24" value={event.notes} onChange={(e) => setEvent(event.id, { notes: e.target.value })} maxLength={600} />
          </Field>
        </section>
      ))}

      {draft.events.length < MAX_EVENTS && (
        <button type="button" className="btn btn-secondary w-full sm:w-auto" onClick={addEvent}>
          <Plus size={16} aria-hidden="true" />
          Add a reception, party, or dinner
        </button>
      )}
    </>
  );
}

// ─── Look ─────────────────────────────────────────────────────────────

function LookTab({
  draft,
  set,
  cover,
  onCover,
  onRemoveCover,
  saving,
}: {
  draft: InviteData;
  set: <K extends keyof InviteData>(key: K, value: InviteData[K]) => void;
  cover: string | null;
  onCover: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveCover: () => void;
  saving: boolean;
}) {
  const template = readTemplate(draft.template);
  return (
    <>
      <section className="tool-section">
        <p className="tool-kicker">TEMPLATE</p>
        <p className="section-description">Designed by MilVector for a military retirement. Switch any time; nothing you wrote is lost.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {TEMPLATE_IDS.map((id) => {
            const option = TEMPLATES[id];
            const colors = inviteColors(option, "");
            const chosen = draft.template === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => set("template", id)}
                aria-pressed={chosen}
                className={`flex flex-col overflow-hidden rounded-xl border-2 text-left transition-colors ${chosen ? "border-[var(--accent)]" : "border-[var(--line)] hover:border-[var(--muted)]"}`}
              >
                <span className="flex h-20 flex-col items-center justify-center gap-1.5" style={{ background: colors.bg }} aria-hidden="true">
                  <span className="h-2 w-16 rounded-full" style={{ background: colors.ink, opacity: 0.85 }} />
                  <span className="h-0.5 w-8" style={{ background: colors.accent }} />
                  <span className="h-1.5 w-24 rounded-full" style={{ background: colors.muted, opacity: 0.6 }} />
                </span>
                <span className="p-3">
                  <span className="flex items-center justify-between gap-2 text-sm font-bold">
                    {option.name}
                    {chosen && <Check size={16} className="text-[var(--accent)]" aria-hidden="true" />}
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">{option.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="tool-section">
        <p className="tool-kicker">ACCENT COLOR</p>
        <p className="section-description">Buttons, lines, and highlights. If a color would be hard to read, the page uses a readable one for text automatically.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => set("accent", "")}
            aria-pressed={draft.accent === ""}
            className={`min-h-11 rounded-full border-2 px-4 text-sm font-semibold ${draft.accent === "" ? "border-[var(--accent)]" : "border-[var(--line)]"}`}
          >
            {template.name} default
          </button>
          {ACCENT_PRESETS.map((preset) => (
            <button
              key={preset.hex}
              type="button"
              onClick={() => set("accent", preset.hex)}
              aria-pressed={draft.accent === preset.hex}
              aria-label={preset.label}
              title={preset.label}
              className={`h-11 w-11 rounded-full border-2 ${draft.accent === preset.hex ? "border-[var(--foreground)] ring-2 ring-[var(--accent)] ring-offset-2" : "border-[var(--line)]"}`}
              style={{ background: preset.hex }}
            />
          ))}
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
            <input
              type="color"
              value={draft.accent || template.defaultAccent}
              onChange={(e) => set("accent", e.target.value)}
              className="h-11 w-14 cursor-pointer rounded-lg border border-[var(--line)] bg-transparent"
              aria-label="Pick any color"
            />
            Any color
          </label>
        </div>
      </section>

      <section className="tool-section">
        <p className="tool-kicker">COVER PHOTO</p>
        <p className="section-description">
          Optional. It fills the top of the page behind your name. Wide photos work best. It is shrunk on your device before upload, which also strips the
          location data phones keep in photos.
        </p>
        {cover && (
          <>
            {/* The whole photo, uncropped, so the member sees what they uploaded */}
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the member's own photo */}
            <img src={cover} alt="Your cover photo" className="h-auto max-h-[28rem] w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] object-contain" />
            <p className="text-xs text-[var(--muted)]">
              This is your whole photo. Behind your name, the page shows the middle of it and trims the edges to fit the screen.{" "}
              <span className="lg:hidden">The Preview tab shows exactly how it looks on a phone.</span>
              <span className="hidden lg:inline">The phone preview beside this shows exactly how.</span>
            </p>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <label className={`btn btn-secondary cursor-pointer text-sm ${saving ? "pointer-events-none opacity-60" : ""}`}>
            <Camera size={14} aria-hidden="true" />
            {cover ? "Replace photo" : "Add a cover photo"}
            <input type="file" accept="image/*" className="sr-only" onChange={onCover} disabled={saving} />
          </label>
          {cover && (
            <button type="button" className="btn btn-ghost text-sm" onClick={onRemoveCover} disabled={saving}>
              <Trash2 size={14} aria-hidden="true" />
              Remove
            </button>
          )}
        </div>
        <p className="text-xs text-[var(--muted)]">
          The page is public to anyone with the link. Leave out current operations, sensitive equipment, and people who have not agreed to be on it.
        </p>
      </section>
    </>
  );
}

// ─── Share ────────────────────────────────────────────────────────────

const QR_COLORS = [
  { id: "navy", label: "Navy", hex: "#0a1522" },
  { id: "black", label: "Black", hex: "#000000" },
] as const;

function ShareTab({ saved, dirty, onPublish, saving }: { saved: SavedInvite; dirty: boolean; onPublish: () => void; saving: boolean }) {
  const url = pageUrlFor(saved.slug);
  // The accent is offered only when it is dark enough to scan. A light accent
  // (brass, gold) would print as near black anyway, so offering it misleads.
  const colors = inviteColors(readTemplate(saved.invite.template), saved.invite.accent);
  const qrOptions = [...QR_COLORS, ...(colors.qr === colors.accent ? [{ id: "accent", label: "Your accent color", hex: colors.accent }] : [])];
  const [picked, setQrChoice] = useState<string>("navy");
  // Falls back to navy if the accent stops qualifying after a color change.
  const qrChoice = qrOptions.some((option) => option.id === picked) ? picked : "navy";
  const qrHex = qrOptions.find((option) => option.id === qrChoice)?.hex ?? QR_COLORS[0].hex;
  const [qrPng, setQrPng] = useState("");

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width: 600, margin: 2, errorCorrectionLevel: "M", color: { dark: qrHex, light: "#ffffff" } })
      .then((png) => {
        if (!cancelled) setQrPng(png);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [url, qrHex]);

  async function downloadSvg() {
    const svg = await QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: qrHex, light: "#ffffff" } });
    download(`${saved.slug}-qr-${qrChoice}.svg`, svg, "image/svg+xml");
  }
  async function downloadPng() {
    const png = await QRCode.toDataURL(url, { width: 1200, margin: 2, errorCorrectionLevel: "M", color: { dark: qrHex, light: "#ffffff" } });
    const blob = await (await fetch(png)).blob();
    download(`${saved.slug}-qr-${qrChoice}-1200.png`, blob);
  }

  const text = shareText(saved.invite, url);

  return (
    <>
      {!saved.published && !saved.suspended && (
        <ToolAlert variant="warn" title="Not live yet">
          <p className="text-sm">Guests see a page not found until you publish. You can still preview it, download the QR code, and get everything ready.</p>
          <button type="button" className="btn btn-primary mt-3 text-sm" onClick={onPublish} disabled={saving}>
            {dirty ? "Save and Publish" : "Publish"}
          </button>
        </ToolAlert>
      )}
      {dirty && saved.published && (
        <ToolAlert variant="info">You have unsaved changes. Guests see the last saved version until you save.</ToolAlert>
      )}

      <section className="tool-section">
        <p className="tool-kicker">THE LINK</p>
        <p className="break-all text-base font-semibold">{url}</p>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={url} label="Copy link" />
          <a href={`/r/${saved.slug}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary text-sm">
            <ExternalLink size={14} aria-hidden="true" />
            Open my page
          </a>
        </div>
        <p className="text-xs text-[var(--muted)]">Before you publish, only you can open it. That is the easiest way to check it on your own phone.</p>
      </section>

      <section className="tool-section">
        <p className="tool-kicker">QR CODE FOR PRINT</p>
        <p className="section-description">
          One code for everything: save-the-dates, invitations, the program, table cards. It always opens this page, so nothing needs reprinting when details
          change.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="h-44 w-44 shrink-0 rounded-xl border border-[var(--line)] bg-white p-2">
            {qrPng && (
              // eslint-disable-next-line @next/next/no-img-element -- generated in the browser
              <img src={qrPng} alt="QR code that opens your invitation" className="h-full w-full" />
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="QR code color">
              {qrOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setQrChoice(option.id)}
                  aria-pressed={qrChoice === option.id}
                  className={`btn text-sm ${qrChoice === option.id ? "btn-primary" : "btn-secondary"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-secondary text-sm" onClick={downloadSvg}>
                <Download size={14} aria-hidden="true" />
                SVG for the printer
              </button>
              <button type="button" className="btn btn-secondary text-sm" onClick={downloadPng}>
                <Download size={14} aria-hidden="true" />
                PNG
              </button>
            </div>
          </div>
        </div>
        <details className="rounded-xl border border-[var(--line)] p-3">
          <summary className="cursor-pointer text-sm font-semibold">Rules that keep it scannable</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
            <li>Print it at least 1 inch square. 1.25 to 1.5 inches is comfortable on a card held in the hand.</li>
            <li>Keep the white border around it. Do not crop it tighter or stretch it.</li>
            <li>Put nothing on top of it, including a logo in the middle.</li>
            <li>Dark on white. Black is safest on colored paper or cheap printing.</li>
            <li>Print the link underneath it. Some guests will not scan anything.</li>
            <li>Before the full print run, scan one proof with two phones, an iPhone and an Android, at arm&apos;s length in normal light.</li>
          </ul>
        </details>
      </section>

      <section className="tool-section">
        <p className="tool-kicker">READY TO SEND</p>
        <p className="section-description">
          Send it from your own email or phone. MilVector does not email your guests. Put guests in BCC, not To, so no one sees everyone&apos;s address.
        </p>
        <div className="grid gap-3">
          <div className="rounded-xl border border-[var(--line)] p-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Email subject</p>
            <p className="mt-1 text-sm">{text.subject}</p>
            <div className="mt-2">
              <CopyButton text={text.subject} label="Copy subject" />
            </div>
          </div>
          <div className="rounded-xl border border-[var(--line)] p-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Email message</p>
            <p className="mt-1 whitespace-pre-line text-sm">{text.email}</p>
            <div className="mt-2">
              <CopyButton text={text.email} label="Copy message" />
            </div>
          </div>
          <div className="rounded-xl border border-[var(--line)] p-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Text message</p>
            <p className="mt-1 text-sm">{text.sms}</p>
            <div className="mt-2">
              <CopyButton text={text.sms} label="Copy text" />
            </div>
          </div>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Sending from a .mil account? Government networks often block images, so lead with the link. It always works.
        </p>
      </section>
    </>
  );
}

// Plain wording a host can paste anywhere. Built from the saved invitation,
// which is what guests will see when they open the link.
function shareText(data: InviteData, url: string): { subject: string; email: string; sms: string } {
  const who = [data.retiree.rank, data.retiree.name].filter(Boolean).join(" ") || "the retiree";
  const events = sortEvents(data.events.filter(eventIsComplete));
  const ceremony = ceremonyOf(data);
  const when = ceremony && eventIsComplete(ceremony) ? formatDateLong(ceremony.date) : "";
  const lines = events.map((event) => {
    const where = publicLocation(event);
    return `${event.name}: ${formatDateLong(event.date)}, ${formatTime(event.start, data.timeFormat)}${where ? `, ${where}` : ""}`;
  });
  return {
    subject: `You're invited: ${who}'s retirement${when ? `, ${when.split(", ").slice(1).join(", ")}` : ""}`,
    email: [
      `You're invited to the retirement of ${who}.`,
      lines.join("\n"),
      `Times, places, what to wear, and calendar links are all on the invitation page:\n${url}`,
      "If you know someone who should be there, please pass the link along.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    sms: `You're invited to ${who}'s retirement${when ? ` on ${when}` : ""}. Details: ${url}`,
  };
}
