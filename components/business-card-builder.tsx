"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { ArrowDown, ArrowUp, Camera, Check, Copy, Download, ExternalLink, ImageIcon, Mail, Plus, Printer, Sparkles, Trash2 } from "lucide-react";
import { bitmapFrom, lockScreen, videoBackground } from "@/components/cards/card-graphics";
import { CardView } from "@/components/cards/card-view";
import { ToolAlert } from "@/components/tools/tool-alert";
import { leadsCsv, type Insights } from "@/lib/cards/insights";
import { opsecWarnings } from "@/lib/cards/opsec";
import type { ResumeOption } from "@/lib/cards/resume";
import {
  ACCENT_PRESETS,
  BANNER_HEIGHT,
  BANNER_WIDTH,
  CARD_STYLES,
  EMPTY_CARD,
  EVENT_DURATIONS,
  LINK_TYPES,
  LINK_TYPE_LABELS,
  MAX_LINKS,
  SOURCE_LABELS,
  activeEvent,
  displayPhone,
  qrColor,
  type CardData,
  type CardStyle,
  type EventSource,
  type LinkType,
} from "@/lib/cards/schema";

type AttachedResume = { name: string; isPdf: boolean; updatedAt: string | null };
type CardEvent = { name: string; until: string };
type SavedCard = {
  id: string;
  slug: string;
  card: CardData;
  photo: string | null;
  published: boolean;
  suspended: boolean;
  updatedAt: string;
  resume: AttachedResume | null;
  // When the card has a banner, the time it last changed; null without one.
  bannerVersion: string | null;
  event: CardEvent | null;
};
type LinkedinBanner = { id: string; label: string; createdAt: string; url: string };
type Lead = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  note: string | null;
  source: string;
  created_at: string;
  event_name?: string | null;
  owner_note?: string | null;
};
type Defaults = { name: string; email: string; phone: string; location: string; linkedin: string };
type Tab = "edit" | "share" | "insights" | "contacts";

const SITE = "https://www.milvector.org";
const STYLE_LABELS: Record<CardStyle, string> = { band: "Color band", dark: "Dark", clean: "Clean" };

const shareUrl = (slug: string, source?: EventSource) => `${SITE}/c/${slug}${source ? `?s=${source}` : ""}`;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-[var(--muted)]">{hint}</span> : null}
    </label>
  );
}

// Center-crops to a square and returns a JPEG for the page and contact file
// plus a small PNG for the Apple Wallet pass. Runs entirely in the browser.
async function processPhoto(file: File): Promise<{ jpeg: string; png: string }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const render = (size: number, type: string, quality?: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
    return canvas.toDataURL(type, quality).split(",")[1] ?? "";
  };
  return { jpeg: render(400, "image/jpeg", 0.85), png: render(180, "image/png") };
}

// Center-crops to LinkedIn's 4:1 banner shape at 1584 x 396 and returns a JPEG.
// The server re-encodes it again (and drops any location data in the file).
async function processBanner(file: File): Promise<{ jpeg: string; small: boolean }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const target = BANNER_WIDTH / BANNER_HEIGHT;
  const tall = bitmap.width / bitmap.height < target;
  const sw = tall ? bitmap.width : bitmap.height * target;
  const sh = tall ? bitmap.width / target : bitmap.height;
  const canvas = document.createElement("canvas");
  canvas.width = BANNER_WIDTH;
  canvas.height = BANNER_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, BANNER_WIDTH, BANNER_HEIGHT);
  return { jpeg: canvas.toDataURL("image/jpeg", 0.9).split(",")[1] ?? "", small: sw < 1000 };
}

const bannerUrl = (slug: string, version: string) => `/c/${slug}/banner?t=${encodeURIComponent(version)}`;

function download(filename: string, content: string | Blob, type = "text/plain") {
  const blob = typeof content === "string" ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

export function BusinessCardBuilder() {
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [defaults, setDefaults] = useState<Defaults | null>(null);
  const [maxCards, setMaxCards] = useState(3);
  const [wallet, setWallet] = useState({ apple: false, google: false });
  const [resumeChoices, setResumeChoices] = useState<ResumeOption[]>([]);
  const [resumeReady, setResumeReady] = useState(true);
  const [resumePick, setResumePick] = useState("");
  const [upgradesReady, setUpgradesReady] = useState(true);
  const [linkedinBanners, setLinkedinBanners] = useState<LinkedinBanner[]>([]);
  const [pickingBanner, setPickingBanner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CardData>(EMPTY_CARD);
  const [slugDraft, setSlugDraft] = useState("");
  const [tab, setTab] = useState<Tab>("edit");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const active = cards.find((card) => card.id === activeId) ?? null;
  const dirty = !!active && (JSON.stringify(active.card) !== JSON.stringify(draft) || active.slug !== slugDraft);

  const open = useCallback((card: SavedCard) => {
    setActiveId(card.id);
    setDraft(card.card);
    setSlugDraft(card.slug);
    setMessage(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/cards").catch(() => null);
      const json = res ? await res.json().catch(() => ({})) : {};
      if (cancelled) return;
      if (!res?.ok) {
        setLoadError(json.error ?? "Your cards could not be loaded. Refresh the page to try again.");
      } else {
        setCards(json.cards ?? []);
        setDefaults(json.defaults ?? null);
        setMaxCards(json.maxCards ?? 3);
        setWallet(json.wallet ?? { apple: false, google: false });
        setResumeChoices(json.resumeOptions ?? []);
        setResumeReady(json.resumeReady !== false);
        setUpgradesReady(json.upgradesReady !== false);
        setLinkedinBanners(json.linkedinBanners ?? []);
        if (json.cards?.[0]) open(json.cards[0]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const set = <K extends keyof CardData>(key: K, value: CardData[K]) => setDraft((prev) => ({ ...prev, [key]: value }));

  // A save returns the card without its resume, banner, or event unless that
  // save changed them; the others carry over.
  function replaceCard(
    next: Omit<SavedCard, "resume" | "bannerVersion" | "event">,
    changed: { resume?: AttachedResume | null; bannerVersion?: string | null; event?: CardEvent | null } = {},
  ) {
    setCards((prev) =>
      prev.map((card) =>
        card.id === next.id
          ? {
              ...next,
              resume: changed.resume !== undefined ? changed.resume : card.resume,
              bannerVersion: changed.bannerVersion !== undefined ? changed.bannerVersion : card.bannerVersion,
              event: changed.event !== undefined ? changed.event : card.event,
            }
          : card,
      ),
    );
  }

  async function createCard() {
    setSaving(true);
    setMessage(null);
    const starter: CardData = {
      ...EMPTY_CARD,
      name: defaults?.name || "Your Name",
      email: defaults?.email ?? "",
      phone: defaults?.phone ?? "",
      location: defaults?.location ?? "",
      links: defaults?.linkedin ? [{ type: "linkedin", label: "LinkedIn", url: defaults.linkedin }] : [],
    };
    let res = await fetch("/api/cards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ card: starter }) }).catch(
      () => null,
    );
    // Profile values are free text. If one fails the card rules, start blank instead of blocking.
    if (res && res.status === 400) {
      res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card: { ...EMPTY_CARD, name: defaults?.name || "Your Name" } }),
      }).catch(() => null);
    }
    const json = res ? await res.json().catch(() => ({})) : {};
    setSaving(false);
    if (!res?.ok || !json.card) {
      setMessage({ kind: "error", text: json.error ?? "The card could not be created. Try again." });
      return;
    }
    setCards((prev) => [...prev, json.card]);
    open(json.card);
    setTab("edit");
  }

  async function patch(body: Record<string, unknown>, okText: string) {
    if (!active) return false;
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/cards/${active.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(
      () => null,
    );
    const json = res ? await res.json().catch(() => ({})) : {};
    setSaving(false);
    if (!res?.ok || !json.card) {
      setMessage({ kind: "error", text: json.error ?? "That did not save. Check your connection and try again." });
      return false;
    }
    replaceCard(json.card, { resume: json.resume, bannerVersion: json.bannerVersion, event: json.event });
    if (body.card !== undefined) setDraft(json.card.card);
    if (body.slug !== undefined) setSlugDraft(json.card.slug);
    setMessage({ kind: "ok", text: okText });
    return true;
  }

  const save = () => patch({ card: draft, ...(active && slugDraft !== active.slug ? { slug: slugDraft } : {}) }, "Saved.");

  async function togglePublish() {
    if (!active) return;
    if (!active.published && dirty) {
      const saved = await patch({ card: draft, ...(slugDraft !== active.slug ? { slug: slugDraft } : {}), published: true }, "Saved and published. Your card is live.");
      if (saved) setTab("share");
      return;
    }
    const next = !active.published;
    const done = await patch({ published: next }, next ? "Published. Your card is live." : "Unpublished. Visitors can no longer see this card.");
    if (done && next) setTab("share");
  }

  async function onPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const photo = await processPhoto(file);
      await patch({ photo }, "Photo saved.");
    } catch {
      setMessage({ kind: "error", text: "That image could not be read. Try a JPEG or PNG photo." });
    }
  }

  async function onBanner(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const { jpeg, small } = await processBanner(file);
      await patch(
        { banner: { jpeg } },
        small
          ? "Banner saved. That image is small, so it may look soft on large screens; 1584 x 396 pixels is the best size."
          : "Banner saved.",
      );
    } catch {
      setMessage({ kind: "error", text: "That image could not be read. Try a JPEG or PNG." });
    }
  }

  async function applyLinkedinBanner(id: string) {
    if (await patch({ banner: { linkedinId: id } }, "Banner saved. It is the same image as your LinkedIn banner.")) setPickingBanner(false);
  }

  async function removeCard() {
    if (!active) return;
    if (!window.confirm("Delete this card? Its link, QR code, and wallet passes will stop working, and its contacts and view counts will be removed.")) return;
    setSaving(true);
    const res = await fetch(`/api/cards/${active.id}`, { method: "DELETE" }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setMessage({ kind: "error", text: "The card could not be deleted. Try again." });
      return;
    }
    const rest = cards.filter((card) => card.id !== active.id);
    setCards(rest);
    if (rest[0]) open(rest[0]);
    else setActiveId(null);
  }

  const warnings = useMemo(() => opsecWarnings(draft), [draft]);

  if (loading) return <p className="section-card text-sm text-[var(--muted)]">Loading your cards...</p>;
  if (loadError) return <ToolAlert variant="error">{loadError}</ToolAlert>;

  if (!active) {
    return (
      <section className="section-card">
        <p className="section-kicker">START HERE</p>
        <h2 className="section-title">Make your first card</h2>
        <p className="section-description">
          It starts with the name and contact details from your profile. Nothing is visible to anyone until you publish it.
        </p>
        {message && (
          <div className="mt-4">
            <ToolAlert variant="error">{message.text}</ToolAlert>
          </div>
        )}
        <button type="button" className="btn btn-primary mt-5" onClick={createCard} disabled={saving}>
          <Plus size={16} aria-hidden="true" />
          {saving ? "Creating..." : "Create My Card"}
        </button>
      </section>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "edit", label: "Design" },
    { id: "share", label: "Share" },
    { id: "insights", label: "Insights" },
    { id: "contacts", label: "Contacts" },
  ];
  const status = active.suspended ? "Suspended" : active.published ? "Live" : "Draft";

  return (
    <div className="flex flex-col gap-4">
      {/* Card switcher */}
      <section className="section-card flex flex-wrap items-center gap-2 !p-4">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => {
              if (card.id !== active.id && dirty && !window.confirm("You have unsaved changes on this card. Switch anyway?")) return;
              open(card);
            }}
            aria-pressed={card.id === active.id}
            className={`btn text-sm ${card.id === active.id ? "btn-primary" : "btn-secondary"}`}
          >
            {card.card.name || "Untitled"}
            {card.card.company ? ` · ${card.card.company}` : ""}
          </button>
        ))}
        {cards.length < maxCards && (
          <button type="button" className="btn btn-ghost text-sm" onClick={createCard} disabled={saving}>
            <Plus size={14} aria-hidden="true" />
            New card
          </button>
        )}
        <span className="ml-auto flex items-center gap-2">
          <span className={`tool-badge ${active.published && !active.suspended ? "tool-badge-success" : "tool-badge-warn"}`}>{status}</span>
          {!active.suspended && (
            <button type="button" className="btn btn-secondary text-sm" onClick={togglePublish} disabled={saving}>
              {active.published ? "Unpublish" : dirty ? "Save and Publish" : "Publish"}
            </button>
          )}
        </span>
      </section>

      {active.suspended && (
        <ToolAlert variant="stop" title="This card was taken down">
          MilVector suspended this card after a report. Visitors cannot see it. Open a support request if you think this is a mistake.
        </ToolAlert>
      )}

      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--panel)] p-1" aria-label="Card sections">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? "page" : undefined}
            className={`grow basis-0 whitespace-nowrap rounded-lg px-2 py-2 text-center text-sm font-semibold transition-colors [overflow-wrap:normal] sm:px-3 ${
              tab === item.id ? "bg-[var(--accent)] text-white shadow-[var(--shadow-sm)]" : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div aria-live="polite">
        {message && <ToolAlert variant={message.kind === "ok" ? "info" : "error"}>{message.text}</ToolAlert>}
      </div>

      {tab === "edit" && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex flex-col gap-4">
            <ToolAlert variant="warn" title="This card is public to anyone who has the link">
              Put on it only what you would print on a paper card and hand to a stranger. Leave off your clearance level, unit movements, home
              address, and any ID numbers. Search engines are told not to list it.
            </ToolAlert>
            {warnings.map((warning) => (
              <ToolAlert key={warning} variant="warn">
                {warning}
              </ToolAlert>
            ))}

            <section className="section-card space-y-4">
              <h2 className="section-title">Who you are</h2>
              <div className="flex flex-wrap items-center gap-4">
                {active.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local base64 preview
                  <img src={`data:image/jpeg;base64,${active.photo}`} alt="" className="h-20 w-20 rounded-full object-cover" />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-[var(--line)] text-[var(--muted)]">
                    <Camera size={22} aria-hidden="true" />
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <label className="btn btn-secondary cursor-pointer text-sm">
                    {active.photo ? "Change Photo" : "Add Photo"}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onPhoto} disabled={saving} />
                  </label>
                  {active.photo && (
                    <button type="button" className="btn btn-ghost text-sm" onClick={() => patch({ photo: null }, "Photo removed.")} disabled={saving}>
                      Remove
                    </button>
                  )}
                </div>
                <p className="w-full text-xs text-[var(--muted)]">A head-and-shoulders photo in civilian attire works best. It is cropped to a square.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name">
                  <input className="input" value={draft.name} maxLength={80} onChange={(e) => set("name", e.target.value)} autoComplete="name" />
                </Field>
                <Field label="Title or target role" hint="What you do, or the role you are pursuing.">
                  <input className="input" value={draft.title} maxLength={80} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Operations Manager" />
                </Field>
                <Field label="Organization" hint="Optional. Leave blank if you are between roles.">
                  <input className="input" value={draft.company} maxLength={80} onChange={(e) => set("company", e.target.value)} />
                </Field>
                <Field label="Service line" hint="Optional. Shown as a small badge.">
                  <input className="input" value={draft.service} maxLength={60} onChange={(e) => set("service", e.target.value)} placeholder="e.g. U.S. Marine Corps Veteran" />
                </Field>
              </div>
              <Field label="Headline" hint={`One line on what you bring. ${draft.headline.length}/140`}>
                <input
                  className="input"
                  value={draft.headline}
                  maxLength={140}
                  onChange={(e) => set("headline", e.target.value)}
                  placeholder="e.g. 20 years leading logistics teams. PMP. Open to operations roles in Raleigh."
                />
              </Field>
              <Field label="About" hint={`Optional. A short paragraph. ${draft.bio.length}/500`}>
                <textarea className="input" rows={4} value={draft.bio} maxLength={500} onChange={(e) => set("bio", e.target.value)} />
              </Field>
            </section>

            <section className="section-card space-y-4">
              <h2 className="section-title">How to reach you</h2>
              <p className="section-description">Every field is optional. Leave one blank and it will not appear.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email">
                  <input className="input" type="email" value={draft.email} maxLength={120} onChange={(e) => set("email", e.target.value)} autoComplete="email" />
                </Field>
                <Field label="Phone">
                  <input className="input" type="tel" value={draft.phone} maxLength={30} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" />
                </Field>
                <Field label="Website">
                  <input className="input" value={draft.website} maxLength={300} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
                </Field>
                <Field label="City and state">
                  <input className="input" value={draft.location} maxLength={80} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Jacksonville, NC" />
                </Field>
              </div>
            </section>

            <section className="section-card space-y-4">
              <h2 className="section-title">Links</h2>
              <p className="section-description">LinkedIn, a meeting scheduler, your resume, a portfolio. Up to {MAX_LINKS}.</p>
              {draft.links.map((link, index) => {
                const update = (changes: Partial<CardData["links"][number]>) =>
                  set(
                    "links",
                    draft.links.map((item, i) => (i === index ? { ...item, ...changes } : item)),
                  );
                const move = (delta: number) => {
                  const next = [...draft.links];
                  const [item] = next.splice(index, 1);
                  next.splice(index + delta, 0, item);
                  set("links", next);
                };
                return (
                  <div key={index} className="subtle-panel grid gap-3 p-3 sm:grid-cols-[150px_1fr]">
                    <Field label="Type">
                      <select
                        className="input"
                        value={link.type}
                        onChange={(e) => {
                          const type = e.target.value as LinkType;
                          const autoLabel = !link.label || link.label === LINK_TYPE_LABELS[link.type];
                          update({ type, ...(autoLabel ? { label: LINK_TYPE_LABELS[type] } : {}) });
                        }}
                      >
                        {LINK_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {LINK_TYPE_LABELS[type]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Button text">
                      <input className="input" value={link.label} maxLength={40} onChange={(e) => update({ label: e.target.value })} />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Address">
                        <input className="input" value={link.url} maxLength={300} onChange={(e) => update({ url: e.target.value })} placeholder="https://" />
                      </Field>
                    </div>
                    <div className="flex gap-2 sm:col-span-2">
                      <button type="button" className="btn btn-ghost text-sm" onClick={() => move(-1)} disabled={index === 0} aria-label="Move link up">
                        <ArrowUp size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost text-sm"
                        onClick={() => move(1)}
                        disabled={index === draft.links.length - 1}
                        aria-label="Move link down"
                      >
                        <ArrowDown size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost ml-auto text-sm"
                        onClick={() =>
                          set(
                            "links",
                            draft.links.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Trash2 size={14} aria-hidden="true" />
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
              {draft.links.length < MAX_LINKS && (
                <button
                  type="button"
                  className="btn btn-secondary text-sm"
                  onClick={() => set("links", [...draft.links, { type: "linkedin", label: LINK_TYPE_LABELS.linkedin, url: "" }])}
                >
                  <Plus size={14} aria-hidden="true" />
                  Add a link
                </button>
              )}
            </section>

            <section className="section-card space-y-4">
              <h2 className="section-title">Resume</h2>
              <p className="section-description">
                Put one of your resumes from My Files on the card. Visitors get a &quot;Download my resume&quot; button.
              </p>
              {!resumeReady ? (
                <ToolAlert variant="warn">
                  Resume attachments are not set up yet. Run migration 0030_business_card_resume.sql in the Supabase SQL editor.
                </ToolAlert>
              ) : (
                <>
                  {active.resume && (
                    <div className="subtle-panel flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                      <div>
                        <p className="font-bold">On your card now: {active.resume.name}</p>
                        <p className="text-[var(--muted)]">
                          {active.resume.isPdf ? "PDF" : "Word document"}
                          {active.resume.updatedAt ? `, added ${new Date(active.resume.updatedAt).toLocaleDateString()}` : ""}. This is a copy: changes
                          to the file in My Files do not reach the card until you attach it again.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <a href={`/c/${active.slug}/resume`} className="btn btn-secondary text-sm">
                          <Download size={14} aria-hidden="true" />
                          Check It
                        </a>
                        <button type="button" className="btn btn-ghost text-sm" onClick={() => patch({ resume: null }, "Resume removed from the card.")} disabled={saving}>
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                  {active.resume && !active.resume.isPdf && (
                    <ToolAlert variant="warn" title="This resume is a Word file">
                      Recruiters and phones open a PDF more reliably, and a PDF keeps your layout exactly as you made it. In Word, choose File, Save As,
                      PDF, upload that file to My Files as a Master Resume, then attach it here.
                    </ToolAlert>
                  )}
                  {resumeChoices.length === 0 ? (
                    <ToolAlert variant="info" title="No resume files in My Files yet">
                      Upload your finished resume to My Files as a Master Resume, saved as a PDF, and it will appear here. PDF is the format to use for
                      a card: it opens on any phone and keeps your layout.{" "}
                      <a href="/app/documents" className="font-bold underline">
                        Go to My Files
                      </a>
                    </ToolAlert>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="grow basis-[240px]">
                          <Field label={active.resume ? "Replace it with" : "Choose a resume"}>
                            <select className="input" value={resumePick} onChange={(e) => setResumePick(e.target.value)}>
                              <option value="">Select a file from My Files</option>
                              {resumeChoices.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.isPdf ? "PDF" : "Word"} · {option.kind === "targeted" ? "Targeted" : "Master"} · {option.filename}
                                </option>
                              ))}
                            </select>
                          </Field>
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary text-sm"
                          disabled={saving || !resumePick}
                          onClick={async () => {
                            if (await patch({ resume: { documentId: resumePick } }, "Resume attached to your card.")) setResumePick("");
                          }}
                        >
                          {saving ? "Attaching..." : "Attach to Card"}
                        </button>
                      </div>
                      {(() => {
                        const picked = resumeChoices.find((option) => option.id === resumePick);
                        if (!picked) return null;
                        return (
                          <>
                            {!picked.isPdf && (
                              <ToolAlert variant="warn" title="This is a Word file. A PDF is the better choice.">
                                A Word file can look different on the reader&apos;s device and may not open on a phone at all. Save the resume as a PDF
                                (in Word: File, Save As, PDF), upload the PDF to My Files as a Master Resume, and pick that one instead.
                              </ToolAlert>
                            )}
                            {picked.kind === "targeted" && (
                              <ToolAlert variant="warn" title="This resume was written for one job">
                                Everyone who opens your card can download it. A general master resume is usually the better one to hand out.
                              </ToolAlert>
                            )}
                          </>
                        );
                      })()}
                      {!resumeChoices.some((option) => option.isPdf) && (
                        <p className="text-sm text-[var(--muted)]">
                          None of your saved resumes is a PDF. For the best result, save your resume as a PDF and upload it to{" "}
                          <a href="/app/documents" className="font-bold underline">
                            My Files
                          </a>{" "}
                          as a Master Resume.
                        </p>
                      )}
                    </>
                  )}
                  <p className="text-xs text-[var(--muted)]">
                    Anyone with your card link can download this file, including the phone number and email in its header. Files up to 3 MB.
                  </p>
                </>
              )}
            </section>

            <section className="section-card space-y-4">
              <h2 className="section-title">Look</h2>
              <div className="space-y-3">
                <p className="text-sm font-medium">Banner</p>
                {!upgradesReady ? (
                  <ToolAlert variant="warn">
                    Banners are not set up yet. Run migration 0041_business_card_upgrades.sql in the Supabase SQL editor.
                  </ToolAlert>
                ) : (
                  <>
                    {active.bannerVersion ? (
                      // eslint-disable-next-line @next/next/no-img-element -- the member's own banner from its card route
                      <img
                        src={bannerUrl(active.slug, active.bannerVersion)}
                        alt="Your card banner"
                        className="block w-full rounded-lg border border-[var(--line)] object-cover"
                        style={{ aspectRatio: "4 / 1" }}
                      />
                    ) : (
                      <div
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--line)] text-sm text-[var(--muted)]"
                        style={{ aspectRatio: "4 / 1" }}
                      >
                        <ImageIcon size={18} aria-hidden="true" />
                        No banner. Your card shows the color band.
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <label className="btn btn-secondary cursor-pointer text-sm">
                        {active.bannerVersion ? "Upload a Different Banner" : "Upload a Banner"}
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onBanner} disabled={saving} />
                      </label>
                      {linkedinBanners.length > 0 && (
                        <button type="button" className="btn btn-secondary text-sm" onClick={() => setPickingBanner((open) => !open)} disabled={saving}>
                          Use My LinkedIn Builder Banner
                        </button>
                      )}
                      {active.bannerVersion && (
                        <button type="button" className="btn btn-ghost text-sm" onClick={() => patch({ banner: null }, "Banner removed. Your card shows the color band.")} disabled={saving}>
                          Remove
                        </button>
                      )}
                    </div>
                    {pickingBanner && linkedinBanners.length > 0 && (
                      <div className="subtle-panel space-y-2 p-3">
                        <p className="text-sm font-medium">Banners you made in the LinkedIn Builder</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {linkedinBanners.map((banner) => (
                            <button
                              key={banner.id}
                              type="button"
                              onClick={() => applyLinkedinBanner(banner.id)}
                              disabled={saving}
                              className="overflow-hidden rounded-lg border border-[var(--line)] text-left hover:border-[var(--accent)]"
                              aria-label={`Use the banner from ${banner.label}, made ${new Date(banner.createdAt).toLocaleDateString()}`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed link to the member's own banner */}
                              <img src={banner.url} alt="" className="block w-full object-cover" style={{ aspectRatio: "4 / 1" }} />
                              <span className="block px-2 py-1 text-xs text-[var(--muted)]">
                                {banner.label} · {new Date(banner.createdAt).toLocaleDateString()}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-[var(--muted)]">
                      Best fit: 1584 x 396 pixels, the LinkedIn banner size, so your LinkedIn banner fits with nothing cut off. Other images are
                      trimmed from the center to that shape. Your banner replaces the color band and appears on your printed cards, video call
                      background, and Google Wallet pass.
                    </p>
                  </>
                )}
              </div>
              <div>
                <p className="text-sm font-medium">Color</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {ACCENT_PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => set("accent", color)}
                      aria-label={`Use color ${color}`}
                      aria-pressed={draft.accent.toLowerCase() === color}
                      className="h-10 w-10 rounded-full"
                      style={{
                        background: color,
                        outline: draft.accent.toLowerCase() === color ? "3px solid var(--accent-focus)" : "1px solid var(--line)",
                        outlineOffset: 2,
                      }}
                    />
                  ))}
                  <label className="flex items-center gap-2 text-sm">
                    <span className="sr-only">Custom color</span>
                    <input type="color" value={draft.accent} onChange={(e) => set("accent", e.target.value)} className="h-10 w-12 cursor-pointer rounded border border-[var(--line)]" />
                    Custom
                  </label>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">Style</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CARD_STYLES.map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => set("style", style)}
                      aria-pressed={draft.style === style}
                      className={`btn text-sm ${draft.style === style ? "btn-primary" : "btn-secondary"}`}
                    >
                      {STYLE_LABELS[style]}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="section-card space-y-3">
              <h2 className="section-title">Contact exchange</h2>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={draft.leadCapture} onChange={(e) => set("leadCapture", e.target.checked)} />
                <span>
                  <span className="font-medium">Let visitors send their details back to me</span>
                  <span className="block text-[var(--muted)]">Adds a &quot;Share your info&quot; button. What they send lands in your Contacts tab.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={draft.notifyLeads}
                  disabled={!draft.leadCapture}
                  onChange={(e) => set("notifyLeads", e.target.checked)}
                />
                <span>
                  <span className="font-medium">Email me when someone does</span>
                  <span className="block text-[var(--muted)]">Sent to the address you sign in with.</span>
                </span>
              </label>
            </section>

            <section className="section-card space-y-3">
              <h2 className="section-title">Wallet pass</h2>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={draft.passShowPhone && !!draft.phone.trim()}
                  disabled={!draft.phone.trim()}
                  onChange={(e) => set("passShowPhone", e.target.checked)}
                />
                <span>
                  <span className="font-medium">Show my phone number on the pass</span>
                  <span className="block text-[var(--muted)]">
                    {draft.phone.trim()
                      ? "Puts your number on the front, under your name, for someone who would rather write it down than scan. Your phone and email are in the pass details either way, where a tap calls or emails you."
                      : "Add a phone number above to use this."}
                  </span>
                </span>
              </label>
              <p className="text-xs text-[var(--muted)]">After you save, add the pass to your wallet again from the Share tab to update it.</p>
            </section>

            <section className="section-card space-y-3">
              <h2 className="section-title">Card address</h2>
              <Field label="Your link" hint="Lowercase letters, numbers, and hyphens. Changing it breaks QR codes and wallet passes you already shared.">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-sm text-[var(--muted)]">milvector.org/c/</span>
                  <input className="input" value={slugDraft} maxLength={40} onChange={(e) => setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
                </div>
              </Field>
              <button type="button" className="btn btn-ghost text-sm" onClick={removeCard} disabled={saving}>
                <Trash2 size={14} aria-hidden="true" />
                Delete This Card
              </button>
            </section>

            <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 shadow-[var(--shadow-sm)]">
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
                {saving ? "Saving..." : dirty ? "Save Changes" : "Saved"}
              </button>
              <a href={`/c/${active.slug}`} target="_blank" rel="noreferrer" className="btn btn-secondary text-sm">
                <ExternalLink size={14} aria-hidden="true" />
                {active.published ? "Open Live Card" : "Preview Saved Draft"}
              </a>
            </div>
          </div>

          <aside className="lg:sticky lg:top-4 lg:self-start">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Live preview</p>
            <CardView
              card={draft}
              photoSrc={active.photo ? `data:image/jpeg;base64,${active.photo}` : null}
              bannerSrc={active.bannerVersion ? bannerUrl(active.slug, active.bannerVersion) : null}
              resume={active.resume ? { isPdf: active.resume.isPdf } : null}
            >
              <div
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-base font-extrabold"
                style={{ background: "var(--card-accent)", color: "var(--card-on-accent)" }}
              >
                <Download size={18} aria-hidden="true" />
                Save Contact
              </div>
            </CardView>
          </aside>
        </div>
      )}

      {tab === "share" && <SharePanel card={active} wallet={wallet} />}
      {tab === "insights" && <InsightsPanel cardId={active.id} view="insights" />}
      {tab === "contacts" && (
        <>
          <EventModePanel
            event={activeEvent(active.event?.name, active.event?.until)}
            ready={upgradesReady}
            saving={saving}
            onStart={(name, hours) => patch({ event: { name, hours } }, `Event mode is on. Contacts you get now are tagged "${name}".`)}
            onStop={() => patch({ event: null }, "Event mode is off.")}
          />
          <InsightsPanel cardId={active.id} view="contacts" cardName={active.card.name} />
        </>
      )}
    </div>
  );
}

// ─── Event mode ───────────────────────────────────────────────────────

function EventModePanel({
  event,
  ready,
  saving,
  onStart,
  onStop,
}: {
  event: CardEvent | null;
  ready: boolean;
  saving: boolean;
  onStart: (name: string, hours: number) => void;
  onStop: () => void;
}) {
  const [name, setName] = useState("");
  const [hours, setHours] = useState<number>(EVENT_DURATIONS[0].hours);

  return (
    <section className="section-card space-y-3">
      <h2 className="section-title">Event mode</h2>
      <p className="section-description">
        At a career fair or a networking event? Turn this on and everyone who shares their details with you is tagged with the event, so you
        know where you met them. Only you see the tag.
      </p>
      {!ready ? (
        <ToolAlert variant="warn">Event mode is not set up yet. Run migration 0041_business_card_upgrades.sql in the Supabase SQL editor.</ToolAlert>
      ) : event ? (
        <div className="subtle-panel flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
          <p>
            <span className="tool-badge tool-badge-success">On</span> Tagging contacts as <strong>{event.name}</strong> until{" "}
            {new Date(event.until).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}.
          </p>
          <button type="button" className="btn btn-secondary text-sm" onClick={onStop} disabled={saving}>
            Turn Off
          </button>
        </div>
      ) : (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2) onStart(name.trim(), hours);
          }}
        >
          <div className="grow basis-[220px]">
            <Field label="Event name">
              <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Hiring Our Heroes, Camp Lejeune" />
            </Field>
          </div>
          <Field label="Stays on for">
            <select className="input" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {EVENT_DURATIONS.map((option) => (
                <option key={option.hours} value={option.hours}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <button type="submit" className="btn btn-primary text-sm" disabled={saving || name.trim().length < 2}>
            Turn On
          </button>
        </form>
      )}
    </section>
  );
}

// ─── Share ────────────────────────────────────────────────────────────

function SharePanel({ card, wallet }: { card: SavedCard; wallet: { apple: boolean; google: boolean } }) {
  const [qr, setQr] = useState("");
  const [nfc, setNfc] = useState<"idle" | "waiting" | "done" | "error">("idle");
  const nfcSupported = typeof window !== "undefined" && "NDEFReader" in window;
  const link = shareUrl(card.slug);
  const qrLink = shareUrl(card.slug, "qr");
  const color = qrColor(card.card.accent);
  const live = card.published && !card.suspended;

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(qrLink, { width: 720, margin: 2, errorCorrectionLevel: "M", color: { dark: color, light: "#ffffff" } })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [qrLink, color]);

  // The video call background and lock screen, drawn from the saved card.
  const [graphics, setGraphics] = useState<{ video: string; lock: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    let urls: string[] = [];
    (async () => {
      try {
        const [banner, photo] = await Promise.all([
          card.bannerVersion ? bitmapFrom({ url: bannerUrl(card.slug, card.bannerVersion) }) : Promise.resolve(null),
          card.photo ? bitmapFrom({ base64Jpeg: card.photo }) : Promise.resolve(null),
        ]);
        const shortUrl = shareUrl(card.slug).replace(/^https?:\/\/(www\.)?/, "");
        const [video, lock] = await Promise.all([
          videoBackground({ card: card.card, url: shareUrl(card.slug, "video"), shortUrl, banner, photo }),
          lockScreen({ card: card.card, url: shareUrl(card.slug, "lock"), shortUrl, banner, photo }),
        ]);
        if (cancelled) return;
        urls = [URL.createObjectURL(video), URL.createObjectURL(lock)];
        setGraphics({ video: urls[0], lock: urls[1] });
      } catch {
        // The images are optional; the rest of the panel still works.
      }
    })();
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [card.card, card.slug, card.photo, card.bannerVersion]);

  const { card: data } = card;
  const signatureHtml = useMemo(() => {
    const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const line = [data.title, data.company].filter(Boolean).map(esc).join(" | ");
    const contact = [data.phone && esc(displayPhone(data.phone)), data.email && `<a href="mailto:${esc(data.email)}" style="color:${data.accent};">${esc(data.email)}</a>`]
      .filter(Boolean)
      .join(" &nbsp;|&nbsp; ");
    return [
      `<table cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1f2937;border-left:3px solid ${data.accent};">`,
      `<tr><td style="padding:2px 0 2px 12px;">`,
      `<div style="font-size:15px;font-weight:bold;color:#0f172a;">${esc(data.name)}</div>`,
      line ? `<div>${line}</div>` : "",
      contact ? `<div style="margin-top:4px;">${contact}</div>` : "",
      `<div style="margin-top:4px;"><a href="${shareUrl(card.slug, "sig")}" style="color:${data.accent};font-weight:bold;">My digital business card</a></div>`,
      `</td></tr></table>`,
    ].join("");
  }, [data, card.slug]);

  async function copySignature() {
    const plain = [data.name, [data.title, data.company].filter(Boolean).join(" | "), data.phone && displayPhone(data.phone), data.email, shareUrl(card.slug, "sig")].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": new Blob([signatureHtml], { type: "text/html" }), "text/plain": new Blob([plain], { type: "text/plain" }) }),
      ]);
    } catch {
      await navigator.clipboard.writeText(plain).catch(() => {});
    }
  }

  async function writeNfc() {
    setNfc("waiting");
    try {
      // Web NFC: Chrome on Android only.
      const Reader = (window as unknown as { NDEFReader: new () => { write: (message: unknown) => Promise<void> } }).NDEFReader;
      await new Reader().write({ records: [{ recordType: "url", data: shareUrl(card.slug, "nfc") }] });
      setNfc("done");
    } catch {
      setNfc("error");
    }
  }

  async function downloadSvg() {
    const svg = await QRCode.toString(qrLink, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: color, light: "#ffffff" } });
    download(`${card.slug}-qr.svg`, svg, "image/svg+xml");
  }

  return (
    <div className="flex flex-col gap-4">
      {!live && (
        <ToolAlert variant="warn" title="This card is not live yet">
          The link and QR code below will not work for other people until you publish the card.
        </ToolAlert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="section-card space-y-3">
          <h2 className="section-title">Your link</h2>
          <p className="break-all rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 font-mono text-sm">{link}</p>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={link} label="Copy Link" />
            <a href={`/c/${card.slug}`} target="_blank" rel="noreferrer" className="btn btn-secondary text-sm">
              <ExternalLink size={14} aria-hidden="true" />
              Open Card
            </a>
          </div>
          <p className="text-sm text-[var(--muted)]">Put it in your LinkedIn contact info, your resume header, or a text message.</p>
        </section>

        <section className="section-card space-y-3">
          <h2 className="section-title">QR code</h2>
          <div className="flex flex-wrap items-start gap-4">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element -- generated data URL
              <img src={qr} alt="QR code that opens your card" className="h-40 w-40 rounded-lg border border-[var(--line)] bg-white p-1" />
            ) : (
              <div className="h-40 w-40 rounded-lg border border-[var(--line)]" />
            )}
            <div className="flex flex-col gap-2">
              <a href={qr || undefined} download={`${card.slug}-qr.png`} className="btn btn-secondary text-sm" aria-disabled={!qr}>
                <Download size={14} aria-hidden="true" />
                PNG for screens
              </a>
              <button type="button" className="btn btn-secondary text-sm" onClick={downloadSvg}>
                <Download size={14} aria-hidden="true" />
                SVG for print
              </button>
            </div>
          </div>
          <p className="text-sm text-[var(--muted)]">
            It uses your card color and always points to the current version of your card, so you never need to reprint it after an edit.
          </p>
        </section>

        <section className="section-card space-y-3">
          <h2 className="section-title">Phone wallet</h2>
          <p className="text-sm text-[var(--muted)]">
            Keep your card in Apple Wallet or Google Wallet. Double-click the side button and someone can scan it from your lock screen, with no app
            and no signal needed on your end.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {wallet.apple ? (
              <a href={`/c/${card.slug}/apple-pass`} className="btn btn-primary text-sm" aria-disabled={!live}>
                Add to Apple Wallet
              </a>
            ) : (
              <span className="tool-badge tool-badge-warn">Apple Wallet: not set up yet</span>
            )}
            {wallet.google ? (
              // Google's own button, unaltered and at its full size: its brand rules allow no
              // restyling or rescaling, a 48 px minimum height, and 8 px of clear space
              // (the padding here) on every side.
              <a
                href={`/c/${card.slug}/google-pass`}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!live}
                className="inline-block rounded-full p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Google's official SVG, served as is */}
                <img src="/assets/wallet/add-to-google-wallet.svg" alt="Add to Google Wallet" width={283} height={50} className="block h-[50px] w-[283px] max-w-none" />
              </a>
            ) : (
              <span className="tool-badge tool-badge-warn">Google Wallet: not set up yet</span>
            )}
          </div>
          <p className="text-xs text-[var(--muted)]">
            Open this page on the phone itself to add the pass. The front shows your name, title, and QR code
            {card.card.passShowPhone && card.card.phone ? ", plus your phone number" : ""}; your phone and email are in the pass details, where a tap
            calls or emails you. To change what the front shows, use Wallet pass on the Design tab. The QR code always opens your current card; if you
            change your name, title, or phone, add the pass again.
          </p>
        </section>

        <section className="section-card space-y-3">
          <h2 className="section-title">Email signature</h2>
          <div className="rounded-md border border-[var(--line)] bg-white p-3" dangerouslySetInnerHTML={{ __html: signatureHtml }} />
          <button type="button" className="btn btn-secondary text-sm" onClick={copySignature}>
            <Copy size={14} aria-hidden="true" />
            Copy Signature
          </button>
          <p className="text-sm text-[var(--muted)]">Paste it into the signature box in Gmail or Outlook settings.</p>
        </section>

        <section className="section-card space-y-3">
          <h2 className="section-title">Video call background</h2>
          {graphics ? (
            // eslint-disable-next-line @next/next/no-img-element -- generated in the browser
            <img
              src={graphics.video}
              alt="Your video call background: your name on the left and your QR code on the right"
              className="block w-full rounded-lg border border-[var(--line)]"
              style={{ aspectRatio: "16 / 9" }}
            />
          ) : (
            <div className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)]" style={{ aspectRatio: "16 / 9" }} aria-hidden="true" />
          )}
          <a href={graphics?.video} download={`${card.slug}-video-background.png`} className="btn btn-secondary text-sm" aria-disabled={!graphics}>
            <Download size={14} aria-hidden="true" />
            Download Background
          </a>
          <p className="text-sm text-[var(--muted)]">
            For Zoom, Teams, and Google Meet. Zoom: Settings, Background and Effects, then the plus sign. Teams: Effects, then Add new. Meet: Apply
            visual effects, then upload. If your camera view is mirrored, the text looks reversed to you, but everyone else sees it the right way.
          </p>
        </section>

        <section className="section-card space-y-3">
          <h2 className="section-title">Lock screen</h2>
          <div className="flex flex-wrap items-start gap-4">
            {graphics ? (
              // eslint-disable-next-line @next/next/no-img-element -- generated in the browser
              <img
                src={graphics.lock}
                alt="Your lock screen: your card with a large QR code"
                className="block h-72 rounded-xl border border-[var(--line)]"
                style={{ aspectRatio: "1170 / 2532" }}
              />
            ) : (
              <div className="h-72 rounded-xl border border-[var(--line)] bg-[var(--surface)]" style={{ aspectRatio: "1170 / 2532" }} aria-hidden="true" />
            )}
            <div className="grow basis-[180px] space-y-3">
              <a href={graphics?.lock} download={`${card.slug}-lock-screen.png`} className="btn btn-secondary text-sm" aria-disabled={!graphics}>
                <Download size={14} aria-hidden="true" />
                Download Lock Screen
              </a>
              <p className="text-sm text-[var(--muted)]">
                Save it to your photos and set it as your lock screen wallpaper. At a booth, wake your phone and let them scan it, with no unlocking
                and no app. Sized for iPhone; other phones trim the edges a little.
              </p>
            </div>
          </div>
        </section>

        <section className="section-card space-y-3 lg:col-span-2">
          <h2 className="section-title">Printed cards</h2>
          <p className="text-sm text-[var(--muted)]">
            Paper cards with your banner and photo on the front and your QR code on the back. Print ten to a sheet on standard 3.5 x 2 inch business
            card stock (Avery 8371 and similar), or save a file any print shop can print. The QR code opens your card as it is when someone scans it, so
            you never reprint after an edit.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={`/c/${card.slug}/print?layout=sheet`} target="_blank" rel="noreferrer" className="btn btn-secondary text-sm">
              <Printer size={14} aria-hidden="true" />
              Card Sheets, 10 per Page
            </a>
            <a href={`/c/${card.slug}/print?layout=shop`} target="_blank" rel="noreferrer" className="btn btn-secondary text-sm">
              <Printer size={14} aria-hidden="true" />
              Print Shop File
            </a>
          </div>
        </section>

        <section className="section-card space-y-3 lg:col-span-2">
          <h2 className="section-title">NFC tap</h2>
          <p className="text-sm text-[var(--muted)]">
            Any blank NFC sticker or card (a few dollars for a pack) can open your card when someone taps it with their phone. No special product is
            needed.
          </p>
          {nfcSupported ? (
            <>
              <button type="button" className="btn btn-secondary text-sm" onClick={writeNfc} disabled={nfc === "waiting"}>
                {nfc === "waiting" ? "Hold the tag to the back of your phone..." : "Write My Card to an NFC Tag"}
              </button>
              <p aria-live="polite" className="text-sm">
                {nfc === "done" && "Done. Tap the tag with another phone to test it."}
                {nfc === "error" && "The tag was not written. Turn on NFC, allow the permission, and try again."}
              </p>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm">
                This browser cannot write tags. Use Chrome on an Android phone, or a free NFC writing app on iPhone, and write this address as a URL:
              </p>
              <CopyButton text={shareUrl(card.slug, "nfc")} label="Copy NFC Address" />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ─── Insights and contacts ────────────────────────────────────────────

// One contact: their details, the event they came from, the owner's private
// note, and an AI-drafted follow-up email the owner edits and sends themselves.
function LeadItem({
  cardId,
  lead,
  notesReady,
  onRemove,
  onChange,
}: {
  cardId: string;
  lead: Lead;
  notesReady: boolean;
  onRemove: () => void;
  onChange: (next: Lead) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(lead.owner_note ?? "");
  const [busy, setBusy] = useState<"" | "note" | "draft">("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function saveNote() {
    setBusy("note");
    setError("");
    const res = await fetch(`/api/cards/${cardId}/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerNote: note }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy("");
    if (!res?.ok) {
      setError(json.error ?? "The note did not save. Try again.");
      return;
    }
    onChange({ ...lead, owner_note: json.lead?.owner_note ?? null });
    setEditing(false);
  }

  async function writeDraft() {
    setBusy("draft");
    setError("");
    const res = await fetch(`/api/cards/${cardId}/leads/${lead.id}/follow-up`, { method: "POST" }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy("");
    if (!res?.ok || !json.draft) {
      setError(json.error ?? "The draft could not be written. Try again in a moment.");
      return;
    }
    setDraft(json.draft);
  }

  const mailto =
    lead.email && draft ? `mailto:${lead.email}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}` : null;

  return (
    <li className="subtle-panel space-y-3 p-4" data-lead={lead.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1 text-sm">
          <p className="font-bold">
            {lead.name}
            {lead.company ? <span className="font-normal text-[var(--muted)]"> · {lead.company}</span> : null}
          </p>
          {lead.email && (
            <p>
              <a href={`mailto:${lead.email}`} className="underline">
                {lead.email}
              </a>
            </p>
          )}
          {lead.phone && (
            <p>
              <a href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`} className="underline">
                {lead.phone}
              </a>
            </p>
          )}
          {lead.note && <p className="text-[var(--muted)]">&quot;{lead.note}&quot;</p>}
          <p className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
            {new Date(lead.created_at).toLocaleDateString()} · {SOURCE_LABELS[lead.source as EventSource] ?? "Shared link"}
            {lead.event_name && (
              <span className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 font-semibold text-[var(--foreground)]">
                {lead.event_name}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {notesReady && (
            <button type="button" className="btn btn-secondary text-sm" onClick={writeDraft} disabled={busy !== ""}>
              <Sparkles size={14} aria-hidden="true" />
              {busy === "draft" ? "Writing..." : draft ? "Write Another" : "Draft Follow-up"}
            </button>
          )}
          <button type="button" className="btn btn-ghost text-sm" onClick={onRemove} aria-label={`Remove ${lead.name}`}>
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      {notesReady &&
        (editing ? (
          <div className="space-y-2">
            <Field label="My notes" hint={`Only you see these. ${note.length}/500`}>
              <textarea
                className="input min-h-20"
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What you talked about, what to send them, when to follow up."
              />
            </Field>
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary text-sm" onClick={saveNote} disabled={busy !== ""}>
                {busy === "note" ? "Saving..." : "Save Note"}
              </button>
              <button
                type="button"
                className="btn btn-ghost text-sm"
                onClick={() => {
                  setNote(lead.owner_note ?? "");
                  setEditing(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : lead.owner_note ? (
          <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
            <p className="min-w-0 whitespace-pre-line">
              <span className="font-semibold">My notes: </span>
              {lead.owner_note}
            </p>
            <button type="button" className="btn btn-ghost text-sm" onClick={() => setEditing(true)}>
              Edit Note
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-ghost text-sm" onClick={() => setEditing(true)}>
            Add a Note
          </button>
        ))}

      {error && <ToolAlert variant="error">{error}</ToolAlert>}

      {draft && (
        <div className="space-y-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3">
          <p className="text-xs text-[var(--muted)]">A draft for you to edit. Nothing is sent until you send it from your own email.</p>
          <Field label="Subject">
            <input className="input" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          </Field>
          <Field label="Message">
            <textarea className="input min-h-48" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {mailto && (
              <a href={mailto} className="btn btn-primary text-sm">
                <Mail size={14} aria-hidden="true" />
                Open in My Email
              </a>
            )}
            <button
              type="button"
              className="btn btn-secondary text-sm"
              onClick={async () => {
                await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
            >
              {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" className="btn btn-ghost text-sm" onClick={() => setDraft(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function InsightsPanel({ cardId, view, cardName }: { cardId: string; view: "insights" | "contacts"; cardName?: string }) {
  const [data, setData] = useState<{ insights: Insights; leads: Lead[]; notesReady?: boolean } | null>(null);
  const [error, setError] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const events = useMemo(() => [...new Set((data?.leads ?? []).map((lead) => lead.event_name).filter((name): name is string => !!name))], [data]);
  const shown = useMemo(() => (data?.leads ?? []).filter((lead) => !eventFilter || lead.event_name === eventFilter), [data, eventFilter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/cards/${cardId}`).catch(() => null);
      const json = res ? await res.json().catch(() => ({})) : {};
      if (cancelled) return;
      if (!res?.ok) setError(json.error ?? "This could not be loaded. Refresh the page to try again.");
      else setData(json);
    })();
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  async function removeLead(id: string) {
    if (!window.confirm("Remove this contact?")) return;
    const res = await fetch(`/api/cards/${cardId}?lead=${id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setData((prev) => (prev ? { ...prev, leads: prev.leads.filter((lead) => lead.id !== id) } : prev));
  }

  if (error) return <ToolAlert variant="error">{error}</ToolAlert>;
  if (!data) return <p className="section-card text-sm text-[var(--muted)]">Loading...</p>;

  if (view === "contacts") {
    return (
      <section className="section-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">Contacts</h2>
            <p className="section-description">People who shared their details with you from this card.</p>
          </div>
          {data.leads.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary text-sm"
              onClick={() => download(`${(cardName || "card").replace(/[^A-Za-z0-9]+/g, "-")}-contacts.csv`, leadsCsv(shown), "text/csv")}
            >
              <Download size={14} aria-hidden="true" />
              Download Spreadsheet
            </button>
          )}
        </div>
        {events.length > 0 && (
          <div className="max-w-sm">
            <Field label="Show">
              <select className="input" value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
                <option value="">Everyone ({data.leads.length})</option>
                {events.map((name) => (
                  <option key={name} value={name}>
                    {name} ({data.leads.filter((lead) => lead.event_name === name).length})
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        {data.leads.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No one yet. When someone taps &quot;Share your info&quot; on your card, they show up here.
          </p>
        ) : (
          <ul className="space-y-2">
            {shown.map((lead) => (
              <LeadItem
                key={lead.id}
                cardId={cardId}
                lead={lead}
                notesReady={data.notesReady !== false}
                onRemove={() => removeLead(lead.id)}
                onChange={(next) => setData((prev) => (prev ? { ...prev, leads: prev.leads.map((item) => (item.id === next.id ? next : item)) } : prev))}
              />
            ))}
          </ul>
        )}
      </section>
    );
  }

  const { insights } = data;
  const peak = Math.max(1, ...insights.daily.map((day) => day.views));
  const tiles = [
    { label: "Views", value: insights.views },
    { label: "Contact saves", value: insights.saves },
    { label: "Link taps", value: insights.linkTaps },
    { label: "Resume downloads", value: insights.resumeDownloads },
    { label: "Wallet adds", value: insights.walletAdds },
    { label: "Contacts received", value: data.leads.length },
  ];

  return (
    <div className="flex flex-col gap-4">
      <section className="section-card">
        <h2 className="section-title">Last 90 days</h2>
        <p className="section-description">Counts only. MilVector does not record who viewed your card or anything about their device.</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {tiles.map((tile) => (
            <div key={tile.label} className="subtle-panel p-4">
              <dt className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--muted)]">{tile.label}</dt>
              <dd className="mt-1 text-2xl font-extrabold tabular-nums">{tile.value.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
        {insights.saveRate !== null && (
          <p className="mt-3 text-sm text-[var(--muted)]">
            About {insights.saveRate} of every 100 views ended with someone saving your contact.
          </p>
        )}
      </section>

      <section className="section-card">
        <h2 className="section-title">Views by day, last 30 days</h2>
        {insights.daily.every((day) => day.views === 0) ? (
          <p className="mt-3 text-sm text-[var(--muted)]">No views in the last 30 days. Your own visits are not counted.</p>
        ) : (
          <>
            <div className="mt-4 flex h-32 items-end gap-[3px]" role="img" aria-label={`Daily views for the last 30 days. Highest day: ${peak}.`}>
              {insights.daily.map((day) => (
                <div
                  key={day.day}
                  title={`${day.day}: ${day.views} views, ${day.saves} saves`}
                  className="flex-1 rounded-t bg-[var(--accent)]"
                  style={{ height: `${Math.max(day.views > 0 ? 6 : 1, (day.views / peak) * 100)}%`, opacity: day.views > 0 ? 1 : 0.25 }}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs text-[var(--muted)]">
              <span>{insights.daily[0].day}</span>
              <span>Today</span>
            </div>
          </>
        )}
      </section>

      <section className="section-card">
        <h2 className="section-title">How people reached your card</h2>
        {insights.viewsBySource.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">Nothing to show yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {insights.viewsBySource.map((entry) => (
              <li key={entry.source} className="grid grid-cols-[130px_1fr_48px] items-center gap-3 text-sm">
                <span>{SOURCE_LABELS[entry.source]}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-[var(--surface)]">
                  <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${(entry.count / Math.max(1, insights.views)) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums">{entry.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
