"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { ArrowDown, ArrowUp, Camera, Check, Download, ExternalLink, Plus, Trash2 } from "lucide-react";
import { CopyButton, Field, Toggle, download } from "@/components/invites/builder-ui";
import { GuestsTab } from "@/components/invites/guests-tab";
import { InviteView } from "@/components/invites/invite-view";
import { ToolAlert } from "@/components/tools/tool-alert";
import { opsecWarnings } from "@/lib/invites/opsec";
import { NO_SSN_NOTE, passSteps } from "@/lib/invites/rsvp";
import {
  BRANCHES,
  BRANCH_NAMES,
  COVER_MAX_CHARS,
  MAX_BIOS,
  MAX_EVENTS,
  MAX_INFO_BLOCKS,
  MAX_MEAL_OPTIONS,
  MAX_PEOPLE,
  MAX_PHOTOS,
  MAX_PROGRAM_ITEMS,
  MAX_SCHEDULE_EXTRAS,
  STAND_CUES,
  TIME_ZONES,
  blankEvent,
  newEventId,
  standardProgram,
  starterInvite,
  type BaseAccess,
  type InviteData,
  type InviteEvent,
  type InviteViewName,
  type Program,
  type RsvpSettings,
  type Sections,
} from "@/lib/invites/schema";
import { ACCENT_PRESETS, TEMPLATES, TEMPLATE_IDS, inviteColors, readTemplate } from "@/lib/invites/templates";
import { shareText } from "@/lib/invites/share-text";
import { resolveView, youtubeId } from "@/lib/invites/view";
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
const TAB_IDS = ["basics", "events", "base", "rsvp", "program", "info", "look", "preview", "share", "guests"] as const;
type Tab = (typeof TAB_IDS)[number];
type Message = { kind: "ok" | "error"; text: string } | null;
type BuilderPhoto = { id: string; position: number; caption: string; updatedAt: string };

const pageUrlFor = (slug: string) => `${siteUrl}/r/${slug}`;

// Unsaved work is copied to this browser as the host types, so a back
// gesture, a closed tab, or a phone that drops the page loses nothing. The
// copy is offered back only against the same saved version it was made from.
type LocalBackup = { draft: InviteData; slug: string; base: string; at: string };
const backupKey = (id: string) => `mv-invite-draft:${id}`;
function readBackup(id: string): LocalBackup | null {
  try {
    const raw = window.localStorage.getItem(backupKey(id));
    const value = raw ? (JSON.parse(raw) as LocalBackup) : null;
    return value && typeof value.base === "string" && value.draft && typeof value.slug === "string" ? value : null;
  } catch {
    return null;
  }
}
function writeBackup(id: string, value: LocalBackup | null) {
  try {
    if (value) window.localStorage.setItem(backupKey(id), JSON.stringify(value));
    else window.localStorage.removeItem(backupKey(id));
  } catch {
    // Private browsing or storage turned off: the leave warning still applies.
  }
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
  // The result of a save made from the save bar, shown in the bar itself: on a
  // phone the message area above the tabs is a long way off screen.
  const [barNote, setBarNote] = useState<Message>(null);
  const [restore, setRestore] = useState<LocalBackup | null>(null);
  const [photos, setPhotos] = useState<BuilderPhoto[]>([]);
  const [photosReady, setPhotosReady] = useState(true);
  // Which view the preview shows. "auto" follows the calendar like guests see.
  const [previewView, setPreviewView] = useState<"auto" | InviteViewName>("auto");

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
        setPhotos(json.photos ?? []);
        setPhotosReady(json.photosReady !== false);
        if (json.invite) {
          setSaved(json.invite);
          setDraft(json.invite.invite);
          setSlugDraft(json.invite.slug);
          const backup = readBackup(json.invite.id);
          if (backup && backup.base === json.invite.updatedAt && (JSON.stringify(backup.draft) !== JSON.stringify(json.invite.invite) || backup.slug !== json.invite.slug)) {
            setRestore(backup);
          } else if (backup) {
            writeBackup(json.invite.id, null);
          }
          // Timeline tasks link straight to a tab, e.g. ?tab=program.
          const asked = new URLSearchParams(window.location.search).get("tab");
          if (asked && (TAB_IDS as readonly string[]).includes(asked)) setTab(asked as Tab);
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Warn before leaving with unsaved changes: closing or reloading the tab
  // (the browser asks), and links inside MilVector, which change the page
  // without the browser knowing. Captured before the link's own handler runs.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    const guard = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      if (!window.confirm("You have unsaved changes. Leave without saving them?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guard, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guard, true);
    };
  }, [dirty]);

  // Keep the local copy of unsaved work current. Left alone while an older
  // copy is being offered back, so it is never overwritten before the host
  // decides.
  useEffect(() => {
    if (!saved || !draft || restore) return;
    const timer = window.setTimeout(() => {
      writeBackup(saved.id, dirty ? { draft, slug: slugDraft, base: saved.updatedAt, at: new Date().toISOString() } : null);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [saved, draft, slugDraft, dirty, restore]);

  // A "Saved." in the bar fades after a few seconds; an error stays.
  useEffect(() => {
    if (barNote?.kind !== "ok") return;
    const timer = window.setTimeout(() => setBarNote(null), 4000);
    return () => window.clearTimeout(timer);
  }, [barNote]);

  const warnings = useMemo(() => (draft ? opsecWarnings(draft) : []), [draft]);

  function adopt(next: SavedInvite) {
    setSaved(next);
    setDraft(next.invite);
    setSlugDraft(next.slug);
  }

  async function patch(body: Record<string, unknown>, okText: string, where: "top" | "bar" = "top"): Promise<boolean> {
    if (!saved) return false;
    const say = where === "bar" ? setBarNote : setMessage;
    setSaving(true);
    setMessage(null);
    setBarNote(null);
    const res = await fetch(`/api/invites/${saved.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setSaving(false);
    if (!res?.ok || !json.invite) {
      say({ kind: "error", text: json.error ?? "That did not save. Check your connection and try again. Your changes are still here." });
      return false;
    }
    // A cover or publish change must not throw away unsaved typing.
    if (body.invite !== undefined || body.slug !== undefined) adopt(json.invite);
    else setSaved(json.invite);
    say({ kind: "ok", text: json.profileUpdated ? `${okText} Your profile's ceremony date was updated to match.` : okText });
    return true;
  }

  const changes = () => ({ invite: draft, ...(saved && slugDraft !== saved.slug ? { slug: slugDraft } : {}) });
  const save = () => patch(changes(), "Saved.", "bar");

  function putBack() {
    if (!saved || !restore) return;
    // Laid over the saved version, so anything added to the builder since the
    // copy was made keeps its default.
    setDraft({ ...saved.invite, ...restore.draft });
    setSlugDraft(restore.slug);
    setRestore(null);
  }
  function dropBackup() {
    if (saved) writeBackup(saved.id, null);
    setRestore(null);
  }

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
    { id: "base", label: "Base" },
    { id: "rsvp", label: "RSVP" },
    { id: "program", label: "Program" },
    { id: "info", label: "Info" },
    { id: "look", label: "Look" },
    { id: "preview", label: "Preview", phoneOnly: true },
    { id: "share", label: "Share" },
    { id: "guests", label: "Guests" },
  ];
  const coverSrc = saved.cover ? `data:image/jpeg;base64,${saved.cover}` : null;
  // The guest list is a working table, so it gets the full width.
  const wide = tab === "guests";
  const shownView: InviteViewName = previewView === "auto" ? resolveView(draft) : previewView;
  const pagePhotos = photos.map((photo) => ({ id: photo.id, caption: photo.caption, src: `/r/${saved.slug}/photos/${photo.id}?v=${encodeURIComponent(photo.updatedAt)}` }));
  const preview = <InviteView data={draft} slug={saved.slug} pageUrl={pageUrlFor(slugDraft)} coverSrc={coverSrc} view={shownView} photos={pagePhotos} framed />;
  const viewSwitch = <PreviewViewSwitch value={previewView} onChange={setPreviewView} auto={resolveView(draft)} />;

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

      <nav className="grid grid-cols-4 gap-1 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-1 sm:grid-cols-5 lg:grid-cols-9" aria-label="Invitation sections">
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

      {restore && (
        <ToolAlert variant="warn" title="Changes you did not save">
          <p className="text-sm">
            You made changes on this device on {new Date(restore.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} and left before saving
            them. Put them back to keep working on them.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary text-sm" onClick={putBack}>
              Put them back
            </button>
            <button type="button" className="btn btn-secondary text-sm" onClick={dropBackup}>
              Discard them
            </button>
          </div>
        </ToolAlert>
      )}

      <div className={`grid gap-4 lg:items-start ${wide ? "" : "lg:grid-cols-[minmax(0,1fr)_400px]"}`}>
        <div className="flex min-w-0 flex-col gap-4">
          {warnings.length > 0 && tab !== "guests" && (
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
          {tab === "base" && <BaseTab draft={draft} set={set} goToEvents={() => setTab("events")} />}
          {tab === "rsvp" && <RsvpTab draft={draft} set={set} />}
          {tab === "program" && <ProgramTab draft={draft} set={set} />}
          {tab === "info" && <InfoTab draft={draft} set={set} />}
          {tab === "guests" && <GuestsTab inviteId={saved.id} slug={saved.slug} data={saved.invite} published={saved.published} pageUrl={pageUrlFor(saved.slug)} />}
          {tab === "look" && (
            <LookTab
              draft={draft}
              set={set}
              cover={coverSrc}
              onCover={onCover}
              onRemoveCover={() => patch({ cover: null }, "Cover photo removed.")}
              saving={saving}
              photosPanel={<PhotosPanel inviteId={saved.id} slug={saved.slug} photos={photos} setPhotos={setPhotos} ready={photosReady} />}
            />
          )}
          {tab === "preview" && (
            <div className="flex flex-col gap-3 lg:hidden">
              {viewSwitch}
              <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
                <div className="pointer-events-none select-none" aria-hidden="true">
                  {preview}
                </div>
              </div>
            </div>
          )}
          {tab === "share" && <ShareTab saved={saved} draft={draft} set={set} dirty={dirty} onPublish={togglePublish} saving={saving} />}
        </div>

        {/* Live preview beside the editor on wide screens */}
        <aside className={`hidden lg:sticky lg:top-4 ${wide ? "" : "lg:block"}`} aria-label="Preview of the guest page">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">What a guest sees on a phone</p>
          <div className="mb-2">{viewSwitch}</div>
          <div className="h-[720px] overflow-y-auto rounded-[28px] border-[10px] border-[#1a1f1b] bg-[#1a1f1b] shadow-[var(--shadow-lg)]">
            <div className="pointer-events-none select-none overflow-hidden rounded-[18px]" aria-hidden="true">
              {preview}
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">Updates as you type. Guests see the last saved version.</p>
        </aside>
      </div>

      {/* Save bar while there are unsaved changes. Sticky, not fixed: it rides
          the bottom of the screen while the form scrolls and comes to rest
          above the site footer, and the phone menu still opens over it. A
          fixed bar here is covered by the footer, which shares its layer. */}
      {(dirty || barNote) && (
        <div
          className="sticky bottom-0 z-20 -mx-1 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 shadow-[var(--shadow-lg)]"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 text-sm" role={barNote?.kind === "error" ? "alert" : "status"}>
              {barNote?.kind === "error" ? (
                <>
                  <p className="font-semibold text-[var(--warn)]">Not saved</p>
                  <p>{barNote.text}</p>
                </>
              ) : barNote?.kind === "ok" && !dirty ? (
                <p className="flex items-center gap-2 font-semibold">
                  <Check size={16} className="shrink-0 text-[var(--accent)]" aria-hidden="true" />
                  {barNote.text}
                </p>
              ) : (
                <p className="font-semibold">You have unsaved changes</p>
              )}
            </div>
            {dirty && (
              <button type="button" className="btn btn-primary shrink-0 text-sm" onClick={save} disabled={saving}>
                {saving ? "Saving..." : barNote?.kind === "error" ? "Try again" : "Save changes"}
              </button>
            )}
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

// ─── Base access ──────────────────────────────────────────────────────

function BaseTab({ draft, set, goToEvents }: { draft: InviteData; set: <K extends keyof InviteData>(key: K, value: InviteData[K]) => void; goToEvents: () => void }) {
  const baseEvents = draft.events.filter((event) => event.onBase);
  const setBase = (patch: Partial<BaseAccess>) => set("base", { ...draft.base, ...patch });

  if (baseEvents.length === 0) {
    return (
      <section className="tool-section">
        <p className="tool-kicker">BASE ACCESS</p>
        <p className="text-sm">
          None of your events is marked as aboard a military installation, so the page has no base access section. If guests will need a visitor pass,
          turn on &quot;Aboard a military installation&quot; for that event.
        </p>
        <button type="button" className="btn btn-secondary w-full text-sm sm:w-auto" onClick={goToEvents}>
          Go to Events
        </button>
      </section>
    );
  }

  return (
    <>
      <section className="tool-section">
        <p className="tool-kicker">GUESTS WITHOUT A DOD ID</p>
        <p className="section-description">
          The {baseEvents.map((event) => event.name || "event").join(" and the ")} {baseEvents.length === 1 ? "is" : "are"} aboard an installation. The page walks
          guests without a DoD ID through getting a pass, in this order:
        </p>
        <ol className="grid gap-2 text-sm">
          {passSteps(draft).map((step) => (
            <li key={step} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
              {step}
            </li>
          ))}
        </ol>
        <ToolAlert variant="info" title="Only names, never ID numbers">
          <p className="text-sm">
            {NO_SSN_NOTE} The form collects each adult&apos;s full legal name and the guest&apos;s email address, and you send those to the base, which
            emails its own link to collect the rest. Your Guests tab keeps a tick list for each pass.
          </p>
        </ToolAlert>
      </section>

      <section className="tool-section">
        <p className="tool-kicker">PASS DEADLINE</p>
        <Field
          label="RSVP-by date for guests who need a pass"
          hint="Shown on the page with a countdown. Set it a few days before the base's real cutoff, so you have time to send the names in."
        >
          <input className="input" type="date" value={draft.base.passDeadline} onChange={(e) => setBase({ passDeadline: e.target.value })} />
        </Field>
      </section>

      <section className="tool-section">
        <p className="tool-kicker">INSTRUCTIONS FOR GUESTS</p>
        <Field label="Which gate, and when to leave" hint="e.g. Use the main gate and leave by 0900. Some map apps stop giving directions once you are aboard.">
          <textarea className="input min-h-24" value={draft.base.gate} onChange={(e) => setBase({ gate: e.target.value })} maxLength={400} />
        </Field>
        <Field label="What to bring" hint="e.g. A driver's license or passport, plus vehicle registration and proof of insurance if driving.">
          <textarea className="input min-h-24" value={draft.base.bring} onChange={(e) => setBase({ bring: e.target.value })} maxLength={400} />
        </Field>
        <Field label="Collecting your pass" hint="Step 4 on the page. e.g. I will hand out passes at the house the morning of the ceremony.">
          <textarea className="input min-h-24" value={draft.base.pickup} onChange={(e) => setBase({ pickup: e.target.value })} maxLength={400} />
        </Field>
      </section>
    </>
  );
}

// ─── RSVP settings ────────────────────────────────────────────────────

function RsvpTab({ draft, set }: { draft: InviteData; set: <K extends keyof InviteData>(key: K, value: InviteData[K]) => void }) {
  const rsvp = draft.rsvp;
  const setRsvp = (patch: Partial<RsvpSettings>) => set("rsvp", { ...rsvp, ...patch });
  const setMeals = (patch: Partial<RsvpSettings["meals"]>) => setRsvp({ meals: { ...rsvp.meals, ...patch } });
  const privateHome = draft.events.some((event) => event.addressPrivate);
  const lastEvent = draft.events[draft.events.length - 1];

  return (
    <>
      <section className="tool-section">
        <p className="tool-kicker">TAKING RSVPS</p>
        <Toggle
          checked={rsvp.enabled}
          onChange={(enabled) => setRsvp({ enabled })}
          label="Take RSVPs on the page"
          hint="Guests answer without an account. Their answers land on your Guests tab."
        />
        {!rsvp.enabled && privateHome && (
          <ToolAlert variant="warn">Guests get a private home address only by answering. With RSVPs off, nobody can see it.</ToolAlert>
        )}
        <Field label="Please answer by" hint="Shown on the form. Answers after it are still accepted, and marked late on your Guests tab.">
          <input className="input" type="date" value={rsvp.deadline} onChange={(e) => setRsvp({ deadline: e.target.value })} />
        </Field>
      </section>

      <section className="tool-section">
        <p className="tool-kicker">WHAT THE FORM ASKS</p>
        <p className="section-description">
          Always: name, email, an optional mobile number, and yes, maybe, or no for each event with adults and children counted. Guests coming aboard an
          installation are also asked whether everyone holds a DoD ID.
        </p>
        <Toggle
          checked={rsvp.dietary}
          onChange={(dietary) => setRsvp({ dietary })}
          label="Ask about allergies and dietary needs"
          hint="Worth keeping on even with catering: an allergy is what causes real trouble."
        />
        <Toggle
          checked={rsvp.message}
          onChange={(message) => setRsvp({ message })}
          label="Let guests leave you a message"
          hint="Congratulations and sea stories, collected on your Guests tab, ready to copy for your speech."
        />
      </section>

      <section className="tool-section">
        <p className="tool-kicker">MEAL CHOICES</p>
        <Toggle
          checked={rsvp.meals.enabled}
          onChange={(enabled) =>
            setMeals({
              enabled,
              eventId: draft.events.some((event) => event.id === rsvp.meals.eventId) ? rsvp.meals.eventId : (lastEvent?.id ?? ""),
              options: rsvp.meals.options.length ? rsvp.meals.options : ["", ""],
            })
          }
          label="Ask guests to choose meals"
          hint="Leave this off if you are ordering catering and do not need counts."
        />
        {rsvp.meals.enabled && (
          <>
            <Field label="Served at">
              <select className="input" value={rsvp.meals.eventId} onChange={(e) => setMeals({ eventId: e.target.value })}>
                {draft.events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name || "Unnamed event"}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-2">
              <p className="text-sm font-medium">Choices</p>
              {rsvp.meals.options.map((option, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    className="input"
                    value={option}
                    maxLength={40}
                    aria-label={`Meal choice ${index + 1}`}
                    placeholder={["e.g. Chicken", "e.g. Beef", "e.g. Vegetarian"][index] ?? ""}
                    onChange={(e) => setMeals({ options: rsvp.meals.options.map((o, i) => (i === index ? e.target.value : o)) })}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost shrink-0 !px-3"
                    aria-label={`Remove meal choice ${index + 1}`}
                    onClick={() => setMeals({ options: rsvp.meals.options.filter((_, i) => i !== index) })}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              ))}
              {rsvp.meals.options.length < MAX_MEAL_OPTIONS && (
                <button type="button" className="btn btn-secondary w-full text-sm sm:w-auto" onClick={() => setMeals({ options: [...rsvp.meals.options, ""] })}>
                  <Plus size={14} aria-hidden="true" />
                  Add a choice
                </button>
              )}
              <p className="text-xs text-[var(--muted)]">Guests give a count of each, so a family can split it however they like.</p>
            </div>
          </>
        )}
      </section>
    </>
  );
}

// ─── Lists: shared row controls ───────────────────────────────────────

function move<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// Up, down, and remove for one row. Arrows instead of drag and drop: they
// work the same with a thumb, a mouse, and a keyboard.
function RowTools({ index, count, name, onMove, onRemove }: { index: number; count: number; name: string; onMove: (delta: number) => void; onRemove: () => void }) {
  return (
    <div className="flex shrink-0 gap-1">
      <button type="button" className="btn btn-ghost !min-h-10 !px-2.5" aria-label={`Move ${name} up`} onClick={() => onMove(-1)} disabled={index === 0}>
        <ArrowUp size={16} aria-hidden="true" />
      </button>
      <button type="button" className="btn btn-ghost !min-h-10 !px-2.5" aria-label={`Move ${name} down`} onClick={() => onMove(1)} disabled={index === count - 1}>
        <ArrowDown size={16} aria-hidden="true" />
      </button>
      <button type="button" className="btn btn-ghost !min-h-10 !px-2.5" aria-label={`Remove ${name}`} onClick={onRemove}>
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

function Small({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-xs font-medium text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="btn btn-secondary w-full text-sm sm:w-auto" onClick={onClick}>
      <Plus size={14} aria-hidden="true" />
      {children}
    </button>
  );
}

// ─── Program ──────────────────────────────────────────────────────────

const ROLE_HINTS = ["Retiring official", "Master of ceremonies", "Chaplain", "Narrator", "Color guard", "Bugler"];

function ProgramTab({ draft, set }: { draft: InviteData; set: <K extends keyof InviteData>(key: K, value: InviteData[K]) => void }) {
  const program = draft.program;
  const setProgram = (patchValue: Partial<Program>) => set("program", { ...program, ...patchValue });
  const items = program.items;
  const setItem = (id: string, patchValue: Partial<Program["items"][number]>) => setProgram({ items: items.map((item) => (item.id === id ? { ...item, ...patchValue } : item)) });
  const addItem = (kind: "item" | "heading") =>
    items.length < MAX_PROGRAM_ITEMS && setProgram({ items: [...items, { id: newEventId(), kind, title: "", who: "", cue: "" }] });
  const people = program.people;
  const setPerson = (id: string, patchValue: Partial<Program["people"][number]>) => setProgram({ people: people.map((p) => (p.id === id ? { ...p, ...patchValue } : p)) });
  const bios = program.bios;
  const setBio = (id: string, patchValue: Partial<Program["bios"][number]>) => setProgram({ bios: bios.map((b) => (b.id === id ? { ...b, ...patchValue } : b)) });
  const stream = program.streamUrl.trim();
  const streamOk = !stream || /^https:\/\/[^\s]+\.[^\s]+/i.test(stream);
  const sectionsOff = !draft.sections.program;

  return (
    <>
      {sectionsOff && <ToolAlert variant="warn">The program is hidden from guests. Turn it back on under Sections on the page, in the Look tab.</ToolAlert>}
      <section className="tool-section">
        <p className="tool-kicker">THE SEQUENCE OF EVENTS</p>
        <p className="section-description">
          The order of the ceremony. Before the day it gives guests a feel for what to expect. On the day it leads the page, so guests can follow along and
          know when to stand. Blank lines are left off.
        </p>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--line)] p-4">
            <p className="text-sm">Most retirement ceremonies follow the same order. Start from it and change what yours does differently.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary text-sm" onClick={() => setProgram({ items: standardProgram() })}>
                Start from the standard retirement sequence
              </button>
              <button type="button" className="btn btn-secondary text-sm" onClick={() => addItem("item")}>
                <Plus size={14} aria-hidden="true" />
                Start blank
              </button>
            </div>
          </div>
        ) : (
          <ol className="grid gap-2">
            {items.map((item, index) => {
              const name = item.kind === "heading" ? `heading ${index + 1}` : `line ${index + 1}`;
              return (
                <li key={item.id} className={`grid gap-2 rounded-xl border p-3 ${item.kind === "heading" ? "border-[var(--accent)] bg-[var(--surface)]" : "border-[var(--line)]"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                      {index + 1}. {item.kind === "heading" ? "Heading" : "Line"}
                    </span>
                    <RowTools
                      index={index}
                      count={items.length}
                      name={name}
                      onMove={(delta) => setProgram({ items: move(items, index, delta) })}
                      onRemove={() => setProgram({ items: items.filter((other) => other.id !== item.id) })}
                    />
                  </div>
                  <Small label={item.kind === "heading" ? "Heading text" : "What happens"}>
                    <input
                      className="input"
                      value={item.title}
                      maxLength={100}
                      placeholder={item.kind === "heading" ? "e.g. Reception to follow" : "e.g. Presentation of awards"}
                      onChange={(e) => setItem(item.id, { title: e.target.value })}
                    />
                  </Small>
                  {item.kind === "item" && (
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
                      <Small label="Who (optional)">
                        <input className="input" value={item.who} maxLength={160} placeholder="e.g. Chaplain (LCDR) Jane Doe" onChange={(e) => setItem(item.id, { who: e.target.value })} />
                      </Small>
                      <Small label="Audience">
                        <select className="input" value={item.cue} onChange={(e) => setItem(item.id, { cue: e.target.value as (typeof STAND_CUES)[number] })}>
                          {STAND_CUES.map((cue) => (
                            <option key={cue} value={cue}>
                              {cue || "No cue"}
                            </option>
                          ))}
                        </select>
                      </Small>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {items.length > 0 && items.length < MAX_PROGRAM_ITEMS && (
          <div className="flex flex-wrap gap-2">
            <AddButton onClick={() => addItem("item")}>Add a line</AddButton>
            <AddButton onClick={() => addItem("heading")}>Add a heading</AddButton>
          </div>
        )}
        <Field label="A note above the program (optional)" hint="One line, such as a request about photos or phones.">
          <input className="input" value={program.note} maxLength={200} placeholder="e.g. Photography welcome. No flash during the ceremony, please." onChange={(e) => setProgram({ note: e.target.value })} />
        </Field>
      </section>

      <section className="tool-section">
        <p className="tool-kicker">ON THE PLATFORM</p>
        <p className="section-description">The official party, so guests know who is who. Rank and name as you want them printed.</p>
        {people.map((person, index) => (
          <div key={person.id} className="grid gap-2 rounded-xl border border-[var(--line)] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Person {index + 1}</span>
              <RowTools
                index={index}
                count={people.length}
                name={`person ${index + 1}`}
                onMove={(delta) => setProgram({ people: move(people, index, delta) })}
                onRemove={() => setProgram({ people: people.filter((other) => other.id !== person.id) })}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Small label="Role">
                <input className="input" value={person.role} maxLength={60} list="invite-role-hints" placeholder="e.g. Retiring official" onChange={(e) => setPerson(person.id, { role: e.target.value })} />
              </Small>
              <Small label="Rank and name">
                <input className="input" value={person.name} maxLength={80} placeholder="e.g. Colonel John Smith" onChange={(e) => setPerson(person.id, { name: e.target.value })} />
              </Small>
            </div>
            <Small label="One line about them (optional)">
              <input className="input" value={person.line} maxLength={120} placeholder="e.g. Commanding Officer, 2d Light Armored Reconnaissance Battalion" onChange={(e) => setPerson(person.id, { line: e.target.value })} />
            </Small>
          </div>
        ))}
        <datalist id="invite-role-hints">
          {ROLE_HINTS.map((role) => (
            <option key={role} value={role} />
          ))}
        </datalist>
        {people.length < MAX_PEOPLE && (
          <AddButton onClick={() => setProgram({ people: [...people, { id: newEventId(), role: "", name: "", line: "" }] })}>Add a person</AddButton>
        )}
      </section>

      <section className="tool-section">
        <p className="tool-kicker">BIOGRAPHIES</p>
        <p className="section-description">
          Yours, and the retiring official&apos;s if you like. The short version shows on the page; the full one opens with a tap. A program printed on paper
          rarely has room for either.
        </p>
        {bios.map((bio, index) => (
          <div key={bio.id} className="grid gap-2 rounded-xl border border-[var(--line)] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Biography {index + 1}</span>
              <RowTools
                index={index}
                count={bios.length}
                name={`biography ${index + 1}`}
                onMove={(delta) => setProgram({ bios: move(bios, index, delta) })}
                onRemove={() => setProgram({ bios: bios.filter((other) => other.id !== bio.id) })}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Small label="Rank and name">
                <input className="input" value={bio.name} maxLength={80} onChange={(e) => setBio(bio.id, { name: e.target.value })} />
              </Small>
              <Small label="Role (optional)">
                <input className="input" value={bio.role} maxLength={80} placeholder="e.g. Retiree" onChange={(e) => setBio(bio.id, { role: e.target.value })} />
              </Small>
            </div>
            <Small label="Short version">
              <textarea className="input min-h-24" value={bio.short} maxLength={800} placeholder="Two or three sentences." onChange={(e) => setBio(bio.id, { short: e.target.value })} />
            </Small>
            <Small label="Full biography (optional)">
              <textarea className="input min-h-40" value={bio.full} maxLength={4000} placeholder="Paste the official biography here." onChange={(e) => setBio(bio.id, { full: e.target.value })} />
            </Small>
          </div>
        ))}
        {bios.length < MAX_BIOS && (
          <AddButton onClick={() => setProgram({ bios: [...bios, { id: newEventId(), name: bios.length === 0 ? [draft.retiree.rank, draft.retiree.name].filter(Boolean).join(" ") : "", role: bios.length === 0 ? "Retiree" : "", short: "", full: "" }] })}>
            Add a biography
          </AddButton>
        )}
        <p className="text-xs text-[var(--muted)]">A biography is public to anyone with the link. Leave out family details you would not put on a flyer.</p>
      </section>

      <section className="tool-section">
        <p className="tool-kicker">LIVE STREAM</p>
        <p className="section-description">
          For family who cannot travel. Paste the link to a YouTube live stream or recording and it plays right on the page after a tap. A link to anything
          else, such as Facebook Live or Zoom, shows as a button.
        </p>
        <Field label="Stream or recording link (optional)" hint="Set it up ahead of time. YouTube gives you the link when you schedule the stream.">
          <input className="input" type="url" inputMode="url" value={program.streamUrl} maxLength={300} placeholder="https://youtube.com/live/..." onChange={(e) => setProgram({ streamUrl: e.target.value })} />
        </Field>
        {stream && !streamOk && <ToolAlert variant="error">Use the full link, starting with https://</ToolAlert>}
        {stream && streamOk && (
          <p className="text-xs text-[var(--muted)]">
            {youtubeId(stream) ? "YouTube link recognized. It plays on the page." : "Not a YouTube link, so guests get a button that opens it."}
          </p>
        )}
        {!draft.sections.stream && stream && <ToolAlert variant="warn">The stream is hidden from guests. Turn it back on in the Look tab.</ToolAlert>}
      </section>

      <section className="tool-section">
        <p className="tool-kicker">FOR THE UNIT SIDE</p>
        <p className="section-description">
          Your page is for guests. The ceremony itself runs on unit paperwork. These templates come from a Marine Corps retirement; most units use the
          same pieces. Download one, then adapt it to your unit.
        </p>
        <DocList docs={UNIT_PAPERWORK} />
        <a href="/app/library" className="text-sm font-semibold text-[var(--accent)] underline underline-offset-2">
          See every template in My Files
        </a>
      </section>
    </>
  );
}

// Templates already in the MilVector Library (docs/public), served by
// /api/public-docs. Grouped the way a host works through them.
type LibraryDoc = { label: string; files: { file: string; kind: string }[] };

const UNIT_PAPERWORK: LibraryDoc[] = [
  {
    label: "Retirement ceremony checklist",
    files: [
      { file: "2b - Retirement Ceremony Checklist v3.pdf", kind: "PDF" },
      { file: "2c - Retirement Ceremony Checklist Template v3.docx", kind: "Word" },
    ],
  },
  { label: "Letter of instruction", files: [{ file: "3a - Retirement Ceremony  LOI.docx", kind: "Word" }] },
  {
    label: "Its enclosures",
    files: [
      { file: "3b - Retirement Ceremony LOI Encl 1_SOE.docx", kind: "Sequence of events, Word" },
      { file: "3c - Retirement Ceremony LOI Encl 2_Key Personnel.docx", kind: "Key personnel, Word" },
      { file: "3d - Retirement Ceremony LOI Encl 3_Band Request.pdf", kind: "Band request, PDF" },
      { file: "3e - Retirement Ceremony LOI Encl 4_Layout.pptx", kind: "Layout, PowerPoint" },
    ],
  },
  {
    label: "Printed program samples",
    files: [
      { file: "6 - Retirement Ceremony Program Sample_1.pptx", kind: "Sample 1, PowerPoint" },
      { file: "6 - Retirement Ceremony Program Sample_2.pptx", kind: "Sample 2, PowerPoint" },
      { file: "6 - Retirement Ceremony Program Sample_3.pptx", kind: "Sample 3, PowerPoint" },
    ],
  },
  {
    label: "Narration scripts",
    files: [
      { file: "3g - Retirement Ceremony_The Watch Script.docx", kind: "The Watch, Word" },
      { file: "3f - Retirement Ceremony Old Glory - Johnny Cash Version.docx", kind: "Old Glory, Word" },
    ],
  },
  {
    label: "Flag certificate",
    files: [
      { file: "7 - Flag Certificate Template_1.docx", kind: "Word" },
      { file: "7 - Flag Certificate Template_2.pptx", kind: "PowerPoint" },
    ],
  },
  { label: "Certificate of appreciation for family", files: [{ file: "4 - Certificate of Appreciation_Family_Template.pptx", kind: "PowerPoint" }] },
];

const PAPER_INVITES: LibraryDoc[] = [
  {
    label: "Invitation templates",
    files: [
      { file: "5 - Retirement Ceremony Invitation Template.docx", kind: "Word, to print" },
      { file: "5 - Retirement Ceremony Invitation via Email Template.docx", kind: "Word, for email" },
    ],
  },
];

const docHref = (file: string) => `/api/public-docs/${encodeURIComponent(file)}`;

function DocList({ docs }: { docs: LibraryDoc[] }) {
  return (
    <ul className="grid gap-2">
      {docs.map((doc) => (
        <li key={doc.label} className="rounded-xl border border-[var(--line)] p-3 text-sm">
          <p className="font-medium">{doc.label}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {doc.files.map((item) => (
              <a key={item.file} href={docHref(item.file)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary !min-h-10 text-xs">
                <Download size={14} aria-hidden="true" />
                {item.kind}
              </a>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Info ─────────────────────────────────────────────────────────────

const INFO_SUGGESTIONS: { title: string; placeholder: string }[] = [
  { title: "Lodging", placeholder: "e.g. A block of rooms is held at the Hampton Inn under Russell Retirement until May 1. Call the front desk to book." },
  { title: "Getting there", placeholder: "e.g. The closest airport is Jacksonville (OAJ). Wilmington (ILM) is an hour away and has more flights." },
  { title: "Parking", placeholder: "e.g. Park in the lot behind Bldg. 1854. Overflow parking is across the street." },
  { title: "Gifts", placeholder: "e.g. Your presence is the gift. Please, no gifts." },
];

function InfoTab({ draft, set }: { draft: InviteData; set: <K extends keyof InviteData>(key: K, value: InviteData[K]) => void }) {
  const extras = draft.schedule;
  const setExtra = (id: string, patchValue: Partial<InviteData["schedule"][number]>) =>
    set("schedule", extras.map((extra) => (extra.id === id ? { ...extra, ...patchValue } : extra)));
  const blocks = draft.info;
  const setBlock = (id: string, patchValue: Partial<InviteData["info"][number]>) =>
    set("info", blocks.map((block) => (block.id === id ? { ...block, ...patchValue } : block)));
  const addBlock = (title = "") => blocks.length < MAX_INFO_BLOCKS && set("info", [...blocks, { id: newEventId(), title, body: "", linkLabel: "", linkUrl: "" }]);
  const unused = INFO_SUGGESTIONS.filter((s) => !blocks.some((block) => block.title.trim().toLowerCase() === s.title.toLowerCase()));
  const ceremonyDate = draft.events[0]?.date ?? "";

  return (
    <>
      <section className="tool-section">
        <p className="tool-kicker">THE DAY AT A GLANCE</p>
        <p className="section-description">
          Your events are already on it. Add the other times guests need, such as when to leave for the gate, a photo session, or a hotel shuttle. Blank
          lines are left off.
        </p>
        {!draft.sections.schedule && <ToolAlert variant="warn">The day at a glance is hidden from guests. Turn it back on in the Look tab.</ToolAlert>}
        {extras.map((extra, index) => (
          <div key={extra.id} className="grid gap-2 rounded-xl border border-[var(--line)] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Schedule line {index + 1}</span>
              <RowTools
                index={index}
                count={extras.length}
                name={`schedule line ${index + 1}`}
                onMove={(delta) => set("schedule", move(extras, index, delta))}
                onRemove={() => set("schedule", extras.filter((other) => other.id !== extra.id))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[10rem_8rem_minmax(0,1fr)]">
              <Small label="Date">
                <input className="input" type="date" value={extra.date} onChange={(e) => setExtra(extra.id, { date: e.target.value })} />
              </Small>
              <Small label="Time (optional)">
                <input className="input" type="time" value={extra.time} onChange={(e) => setExtra(extra.id, { time: e.target.value })} />
              </Small>
              <Small label="What" className="col-span-2 sm:col-span-1">
                <input className="input" value={extra.title} maxLength={80} placeholder="e.g. Leave the hotel for the main gate" onChange={(e) => setExtra(extra.id, { title: e.target.value })} />
              </Small>
            </div>
            <Small label="Note (optional)">
              <input className="input" value={extra.note} maxLength={200} onChange={(e) => setExtra(extra.id, { note: e.target.value })} />
            </Small>
          </div>
        ))}
        {extras.length < MAX_SCHEDULE_EXTRAS && (
          <AddButton onClick={() => set("schedule", [...extras, { id: newEventId(), date: ceremonyDate, time: "", title: "", note: "" }])}>Add a schedule line</AddButton>
        )}
      </section>

      <section className="tool-section">
        <p className="tool-kicker">FOR YOUR VISIT</p>
        <p className="section-description">
          What out-of-town guests ask about. Each block gets a title, a few lines, and an optional link, such as a hotel booking page.
        </p>
        {!draft.sections.info && <ToolAlert variant="warn">These blocks are hidden from guests. Turn them back on in the Look tab.</ToolAlert>}
        {blocks.map((block, index) => {
          const suggestion = INFO_SUGGESTIONS.find((s) => s.title.toLowerCase() === block.title.trim().toLowerCase());
          const link = block.linkUrl.trim();
          return (
            <div key={block.id} className="grid gap-2 rounded-xl border border-[var(--line)] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Block {index + 1}</span>
                <RowTools
                  index={index}
                  count={blocks.length}
                  name={`block ${index + 1}`}
                  onMove={(delta) => set("info", move(blocks, index, delta))}
                  onRemove={() => set("info", blocks.filter((other) => other.id !== block.id))}
                />
              </div>
              <Small label="Title">
                <input className="input" value={block.title} maxLength={60} onChange={(e) => setBlock(block.id, { title: e.target.value })} />
              </Small>
              <Small label="Details">
                <textarea className="input min-h-24" value={block.body} maxLength={1500} placeholder={suggestion?.placeholder ?? ""} onChange={(e) => setBlock(block.id, { body: e.target.value })} />
              </Small>
              <div className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)]">
                <Small label="Link text (optional)">
                  <input className="input" value={block.linkLabel} maxLength={40} placeholder="e.g. Book a room" onChange={(e) => setBlock(block.id, { linkLabel: e.target.value })} />
                </Small>
                <Small label="Link (optional)">
                  <input className="input" type="url" inputMode="url" value={block.linkUrl} maxLength={300} placeholder="https://" onChange={(e) => setBlock(block.id, { linkUrl: e.target.value })} />
                </Small>
              </div>
              {link && !/^https:\/\/[^\s]+\.[^\s]+/i.test(link) && <ToolAlert variant="error">Use the full link, starting with https://</ToolAlert>}
            </div>
          );
        })}
        {blocks.length < MAX_INFO_BLOCKS && (
          <div className="flex flex-wrap gap-2">
            {unused.map((s) => (
              <AddButton key={s.title} onClick={() => addBlock(s.title)}>
                {s.title}
              </AddButton>
            ))}
            <AddButton onClick={() => addBlock()}>Something else</AddButton>
          </div>
        )}
      </section>
    </>
  );
}

// ─── Look ─────────────────────────────────────────────────────────────

const SECTION_TOGGLES: { key: keyof Sections; label: string; hint: string }[] = [
  { key: "schedule", label: "The day at a glance", hint: "Every event and schedule line in time order." },
  { key: "program", label: "The program", hint: "Sequence of events, the platform party, and biographies." },
  { key: "info", label: "For your visit", hint: "Lodging, getting there, and your other blocks." },
  { key: "photos", label: "Career photos", hint: "The photos you add below." },
  { key: "stream", label: "Live stream", hint: "The stream link from the Program tab." },
  { key: "share", label: "Share and QR code", hint: "Lets guests pass the invitation along." },
];

function LookTab({
  draft,
  set,
  cover,
  onCover,
  onRemoveCover,
  saving,
  photosPanel,
}: {
  draft: InviteData;
  set: <K extends keyof InviteData>(key: K, value: InviteData[K]) => void;
  cover: string | null;
  onCover: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveCover: () => void;
  saving: boolean;
  photosPanel: React.ReactNode;
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

      {photosPanel}

      <section className="tool-section">
        <p className="tool-kicker">SECTIONS ON THE PAGE</p>
        <p className="section-description">
          A section with nothing in it never shows, so most people leave these on. Turn one off to hide it without deleting what you wrote.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SECTION_TOGGLES.map((toggle) => (
            <Toggle
              key={toggle.key}
              checked={draft.sections[toggle.key]}
              onChange={(value) => set("sections", { ...draft.sections, [toggle.key]: value })}
              label={toggle.label}
              hint={toggle.hint}
            />
          ))}
        </div>
      </section>
    </>
  );
}

// Career photos save the moment they are added, like the cover. They are not
// part of the draft, so there is nothing to lose by switching tabs.
function PhotosPanel({
  inviteId,
  slug,
  photos,
  setPhotos,
  ready,
}: {
  inviteId: string;
  slug: string;
  photos: BuilderPhoto[];
  setPhotos: (photos: BuilderPhoto[]) => void;
  ready: boolean;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [captions, setCaptions] = useState<Record<string, string>>({});

  async function add(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])].slice(0, MAX_PHOTOS - photos.length);
    event.target.value = "";
    if (!files.length) return;
    setError("");
    let list = photos;
    for (const [index, file] of files.entries()) {
      setBusy(files.length > 1 ? `Adding photo ${index + 1} of ${files.length}...` : "Adding photo...");
      let jpeg = "";
      try {
        jpeg = await processCover(file);
      } catch {
        setError(`${file.name} could not be used. Try a JPEG or PNG photo.`);
        continue;
      }
      const res = await fetch(`/api/invites/${inviteId}/photos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jpeg }) }).catch(() => null);
      const json = res ? await res.json().catch(() => ({})) : {};
      if (!res?.ok || !json.photo) {
        setError(json.error ?? "A photo did not upload. Check your connection and try again.");
        break;
      }
      list = [...list, json.photo];
      setPhotos(list);
    }
    setBusy("");
  }

  async function saveCaption(photo: BuilderPhoto) {
    const caption = (captions[photo.id] ?? photo.caption).trim();
    if (caption === photo.caption) return;
    const res = await fetch(`/api/invites/${inviteId}/photos/${photo.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caption }) }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok || !json.photo) {
      setError(json.error ?? "The caption did not save. Try again.");
      return;
    }
    setPhotos(photos.map((p) => (p.id === photo.id ? json.photo : p)));
  }

  async function reorder(index: number, delta: number) {
    const next = move(photos, index, delta);
    if (next === photos) return;
    setPhotos(next);
    const res = await fetch(`/api/invites/${inviteId}/photos`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: next.map((p) => p.id) }) }).catch(() => null);
    if (!res?.ok) {
      setPhotos(photos);
      setError("The new order did not save. Try again.");
    }
  }

  async function remove(photo: BuilderPhoto) {
    if (!window.confirm("Remove this photo from the page?")) return;
    const res = await fetch(`/api/invites/${inviteId}/photos/${photo.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setError("The photo could not be removed. Try again.");
      return;
    }
    setPhotos(photos.filter((p) => p.id !== photo.id));
  }

  return (
    <section className="tool-section">
      <p className="tool-kicker">CAREER PHOTOS</p>
      <p className="section-description">
        Up to {MAX_PHOTOS}, from boot camp or commissioning to now. The first one shows largest. Each saves as soon as you add it, shrunk on your device with
        the location data removed. On the page every photo is trimmed to the same shape, keeping the top, where faces usually are; a tap opens the whole
        photo.
      </p>
      {!ready ? (
        <ToolAlert variant="warn">Career photos are not switched on yet. Everything else on this page works. Check back soon.</ToolAlert>
      ) : (
        <>
          {photos.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2">
              {photos.map((photo, index) => (
                <li key={photo.id} className="grid gap-2 rounded-xl border border-[var(--line)] p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the member's own photo, served by the invitation */}
                  <img
                    src={`/r/${slug}/photos/${photo.id}?v=${encodeURIComponent(photo.updatedAt)}`}
                    alt={photo.caption || `Career photo ${index + 1}`}
                    className="aspect-[4/3] w-full rounded-lg bg-[var(--surface)] object-contain"
                    loading="lazy"
                  />
                  <Small label={`Caption, photo ${index + 1}`}>
                    <input
                      className="input"
                      value={captions[photo.id] ?? photo.caption}
                      maxLength={120}
                      placeholder="e.g. Parris Island, 2004"
                      onChange={(e) => setCaptions((prev) => ({ ...prev, [photo.id]: e.target.value }))}
                      onBlur={() => saveCaption(photo)}
                    />
                  </Small>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-[var(--muted)]">{index === 0 ? "Shown first and largest" : `Photo ${index + 1}`}</span>
                    <RowTools index={index} count={photos.length} name={`photo ${index + 1}`} onMove={(delta) => reorder(index, delta)} onRemove={() => remove(photo)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {error && <ToolAlert variant="error">{error}</ToolAlert>}
          {photos.length < MAX_PHOTOS ? (
            <label className={`btn btn-secondary w-full cursor-pointer text-sm sm:w-auto ${busy ? "pointer-events-none opacity-60" : ""}`}>
              <Camera size={14} aria-hidden="true" />
              {busy || (photos.length ? "Add more photos" : "Add career photos")}
              <input type="file" accept="image/*" multiple className="sr-only" onChange={add} disabled={!!busy} />
            </label>
          ) : (
            <p className="text-sm text-[var(--muted)]">That is all {MAX_PHOTOS}. Remove one to add another.</p>
          )}
          <p className="text-xs text-[var(--muted)]">Captions save when you leave the box. Leave out photos showing current operations or people who would not want to be on it.</p>
        </>
      )}
    </section>
  );
}

// Before, on, and after the day. The page switches by itself; this shows
// each version without waiting for the calendar.
function PreviewViewSwitch({ value, onChange, auto }: { value: "auto" | InviteViewName; onChange: (value: "auto" | InviteViewName) => void; auto: InviteViewName }) {
  const options: { id: "auto" | InviteViewName; label: string }[] = [
    { id: "auto", label: "Now" },
    { id: "invite", label: "Before" },
    { id: "eventday", label: "On the day" },
    { id: "memories", label: "After" },
  ];
  return (
    <div className="grid grid-cols-4 gap-1 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-1" role="group" aria-label="Which version of the page to preview">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          aria-pressed={value === option.id}
          title={option.id === "auto" ? `What guests see today: ${VIEW_NAMES[auto]}` : undefined}
          className={`min-h-10 rounded-lg px-1 text-xs font-semibold ${value === option.id ? "bg-[var(--accent)] text-white" : "text-[var(--muted)] hover:bg-[var(--surface)]"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const VIEW_NAMES: Record<InviteViewName, string> = { invite: "the invitation", eventday: "the day-of program", memories: "the thank-you page" };

// ─── Share ────────────────────────────────────────────────────────────

const QR_COLORS = [
  { id: "navy", label: "Navy", hex: "#0a1522" },
  { id: "black", label: "Black", hex: "#000000" },
] as const;

function ShareTab({
  saved,
  draft,
  set,
  dirty,
  onPublish,
  saving,
}: {
  saved: SavedInvite;
  draft: InviteData;
  set: <K extends keyof InviteData>(key: K, value: InviteData[K]) => void;
  dirty: boolean;
  onPublish: () => void;
  saving: boolean;
}) {
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

      <ViewSettings draft={draft} set={set} slug={saved.slug} />

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

      <section className="tool-section">
        <p className="tool-kicker">PAPER INVITATIONS</p>
        <p className="section-description">
          Mailing invitations too, or sending a formal one to the official party? Start from a Word template and put the QR code above on it, so every
          printed card opens this page.
        </p>
        <DocList docs={PAPER_INVITES} />
      </section>
    </>
  );
}

const VIEW_CHOICES: { id: InviteData["view"]["override"]; label: string; hint: string }[] = [
  { id: "auto", label: "Switch by the date (recommended)", hint: "Invitation before the day, program on the day, thank-you after." },
  { id: "invite", label: "Keep it as the invitation", hint: "For a ceremony that moved, until you update the date." },
  { id: "eventday", label: "Show the day-of version now", hint: "The program and where to be lead the page." },
  { id: "memories", label: "Show the thank-you now", hint: "Messages, photos, and the program as a keepsake." },
];

// One link, three versions. The printed QR code never changes, so the page
// does it for the host by the calendar at the venue.
function ViewSettings({ draft, set, slug }: { draft: InviteData; set: <K extends keyof InviteData>(key: K, value: InviteData[K]) => void; slug: string }) {
  const view = draft.view;
  const now = resolveView({ ...draft, view: { ...view, override: "auto" } });
  return (
    <section className="tool-section">
      <p className="tool-kicker">BEFORE, ON, AND AFTER THE DAY</p>
      <p className="section-description">
        The same link and QR code serve three versions of the page. Before the ceremony it is an invitation with the RSVP form. On the day the program leads,
        so a code printed on the program card opens it. Afterward it becomes a thank-you, with a place for guests to leave messages. It switches on its own at
        midnight where the ceremony is held, in the time zone set on the Events tab.
      </p>
      <fieldset className="grid gap-2">
        <legend className="sr-only">Which version guests see</legend>
        {VIEW_CHOICES.map((choice) => (
          <label key={choice.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] p-3 text-sm has-[:checked]:border-[var(--accent)]">
            <input type="radio" name="invite-view" className="mt-1 h-4 w-4 shrink-0" checked={view.override === choice.id} onChange={() => set("view", { ...view, override: choice.id })} />
            <span>
              <span className="font-medium">{choice.label}</span>
              <span className="block text-xs text-[var(--muted)]">{choice.id === "auto" ? `${choice.hint} Today that is ${VIEW_NAMES[now]}.` : choice.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Field label="Thank-you line" hint="Leads the page after the day, in place of the welcome.">
        <textarea className="input min-h-20" value={view.thankYou} maxLength={300} onChange={(e) => set("view", { ...view, thankYou: e.target.value })} />
      </Field>
      <div className="grid gap-2">
        <p className="text-sm font-medium">Open each version, saved, on your own phone</p>
        <div className="flex flex-wrap gap-2">
          {(["invite", "eventday", "memories"] as const).map((name) => (
            <a key={name} href={`/r/${slug}?view=${name}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary text-sm">
              <ExternalLink size={14} aria-hidden="true" />
              {VIEW_LABELS[name]}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

const VIEW_LABELS: Record<InviteViewName, string> = { invite: "Before", eventday: "On the day", memories: "After" };
