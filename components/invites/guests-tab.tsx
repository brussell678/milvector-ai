"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Mail, Plus, RefreshCw, Trash2 } from "lucide-react";
import { CopyButton, Field, download } from "@/components/invites/builder-ui";
import { ToolAlert } from "@/components/tools/tool-alert";
import { forTheBase, guestsCsv, headcounts, mealTotals, needsPass, passComplete, passPeopleList, retention, withText } from "@/lib/invites/guests";
import { REMINDER_GROUPS, reminderEmails, reminderGuests, reminderMailto, reminderPhones, reminderText, type ReminderGroup } from "@/lib/invites/reminders";
import {
  MAX_PASS_PEOPLE,
  PIPELINE_STEPS,
  attending,
  partyLine,
  passPeopleOf,
  type DayMessage,
  type EventAnswer,
  type GuestRecord,
  type PassPerson,
  type PipelineKey,
  type RsvpStatus,
} from "@/lib/invites/rsvp";
import { hasBaseEvent, type InviteData } from "@/lib/invites/schema";
import { eventIsComplete, formatDateLong, sortEvents } from "@/lib/invites/time";

// The host's dashboard: chairs, food, base passes, and messages.

const seenKey = (inviteId: string) => `mv-invite-guests-seen-${inviteId}`;
const readSeen = (inviteId: string): string | null => {
  try {
    return window.localStorage.getItem(seenKey(inviteId));
  } catch {
    return null;
  }
};
const writeSeen = (inviteId: string, value: string) => {
  try {
    window.localStorage.setItem(seenKey(inviteId), value);
  } catch {
    // Private browsing; the "new" count simply does not persist.
  }
};

const STATUS_SHORT: Record<RsvpStatus, string> = { yes: "Yes", maybe: "Maybe", no: "No" };
// An outlined badge for plain facts (a no, a guest added by hand).
const NEUTRAL_BADGE = "border border-[var(--line)] text-[var(--muted)]";

export function GuestsTab({ inviteId, slug, data, published, pageUrl }: { inviteId: string; slug: string; data: InviteData; published: boolean; pageUrl: string }) {
  const [guests, setGuests] = useState<GuestRecord[] | null>(null);
  const [dayMessages, setDayMessages] = useState<DayMessage[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // What counts as new is measured from the previous visit. This tab only
  // renders in the browser, after the builder has loaded.
  const [seenAt] = useState<string | null>(() => (typeof window === "undefined" ? null : readSeen(inviteId)));
  const [filter, setFilter] = useState("");
  // Removing several at once, for clearing out junk answers.
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

  // State is only set after the request returns, so the first load can run
  // from an effect. Refresh marks itself busy first.
  const load = useCallback(async () => {
    const res = await fetch(`/api/invites/${inviteId}/guests`, { cache: "no-store" }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setLoading(false);
    if (!res?.ok) {
      setError(json.error ?? "The guest list could not be loaded. Check your connection and try again.");
      return;
    }
    setError("");
    setGuests(json.guests ?? []);
    setDayMessages(json.messages ?? []);
  }, [inviteId]);

  const refresh = () => {
    setLoading(true);
    void load();
  };

  useEffect(() => {
    // Remember this visit for next time, then load.
    writeSeen(inviteId, new Date().toISOString());
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/invites/${inviteId}/guests`, { cache: "no-store" }).catch(() => null);
      const json = res ? await res.json().catch(() => ({})) : {};
      if (cancelled) return;
      if (!res?.ok) setError(json.error ?? "The guest list could not be loaded. Check your connection and try again.");
      else {
        setGuests(json.guests ?? []);
        setDayMessages(json.messages ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteId]);

  const list = guests ?? [];
  const counts = headcounts(data, list);
  const meals = mealTotals(data, list);
  const passGuests = needsPass(data, list);
  const allAdults = passPeopleList(passGuests);
  const allergies = withText(list, "dietary");
  const messages = withText(list, "message");
  const today = new Date().toISOString().slice(0, 10);
  const keep = retention(data, today);
  const newCount = seenAt ? list.filter((guest) => guest.updated_at > seenAt).length : 0;
  const shown = list.filter((guest) => `${guest.name} ${guest.email ?? ""}`.toLowerCase().includes(filter.trim().toLowerCase()));

  async function tick(guest: GuestRecord, key: PipelineKey, value: boolean) {
    const before = list;
    setGuests(list.map((g) => (g.id === guest.id ? { ...g, pipeline: { ...g.pipeline, [key]: value } } : g)));
    // keepalive: a tick tapped just before leaving the page still saves.
    const res = await fetch(`/api/invites/${inviteId}/guests/${guest.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline: { [key]: value } }),
      keepalive: true,
    }).catch(() => null);
    if (!res?.ok) {
      setGuests(before);
      setError("That tick did not save. Check your connection and try again.");
    }
  }

  async function remove(guest: GuestRecord) {
    if (!window.confirm(`Remove ${guest.name} from the list? This cannot be undone.`)) return;
    const res = await fetch(`/api/invites/${inviteId}/guests/${guest.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setError("That guest could not be removed. Try again.");
      return;
    }
    setGuests(list.filter((g) => g.id !== guest.id));
  }

  function pick(guest: GuestRecord, on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(guest.id);
      else next.delete(guest.id);
      return next;
    });
  }

  function stopPicking() {
    setPicking(false);
    setPicked(new Set());
  }

  async function removePicked() {
    const ids = list.filter((guest) => picked.has(guest.id)).map((guest) => guest.id);
    if (ids.length === 0) return;
    if (!window.confirm(`Remove ${ids.length} ${ids.length === 1 ? "reply" : "replies"} from the list? This cannot be undone.`)) return;
    const res = await fetch(`/api/invites/${inviteId}/guests`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok || !Array.isArray(json.removed)) {
      setError(json.error ?? "Those replies could not be removed. Try again.");
      return;
    }
    const gone = new Set<string>(json.removed);
    setGuests(list.filter((guest) => !gone.has(guest.id)));
    stopPicking();
  }

  async function removeMessage(message: DayMessage) {
    if (!window.confirm(`Delete the message from ${message.name}? This cannot be undone.`)) return;
    const res = await fetch(`/api/invites/${inviteId}/messages/${message.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setError("That message could not be deleted. Try again.");
      return;
    }
    setDayMessages(dayMessages.filter((m) => m.id !== message.id));
  }

  if (guests === null) {
    return error ? <ToolAlert variant="error">{error}</ToolAlert> : <p className="section-card text-sm text-[var(--muted)]">Loading your guest list...</p>;
  }

  // Answers from the RSVP form and messages left on or after the day, as
  // one list to read and copy for a speech.
  const allMessages = [
    ...messages.map((item, index) => ({ key: `rsvp-${index}`, name: item.name, text: item.text, day: null as DayMessage | null })),
    ...dayMessages.map((m) => ({ key: m.id, name: m.name, text: m.message, day: m })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <section className="tool-section">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="tool-kicker">WHO IS COMING</p>
            <p className="section-title mt-0.5">
              {list.length} {list.length === 1 ? "reply" : "replies"}
            </p>
            {newCount > 0 && <span className="tool-badge tool-badge-success mt-1">{newCount} new or changed since your last visit</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary text-sm" onClick={refresh} disabled={loading}>
              <RefreshCw size={14} aria-hidden="true" />
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button type="button" className="btn btn-secondary text-sm" onClick={() => download(`${slug}-guests.csv`, guestsCsv(data, list), "text/csv")} disabled={list.length === 0}>
              <Download size={14} aria-hidden="true" />
              Spreadsheet
            </button>
          </div>
        </div>
        {error && <ToolAlert variant="error">{error}</ToolAlert>}
        {!published && <ToolAlert variant="info">Guests can answer once your page is published.</ToolAlert>}
        {keep &&
          (keep.warn ? (
            <ToolAlert variant="warn" title="Guest answers are deleted soon">
              <p className="text-sm">
                Answers are kept for 180 days after the ceremony, for your guests&apos; privacy. Every answer here is deleted on{" "}
                {formatDateLong(keep.deleteOn)}. Download the spreadsheet if you want to keep a copy.
              </p>
            </ToolAlert>
          ) : (
            <p className="text-xs text-[var(--muted)]">For your guests&apos; privacy, answers are kept for 180 days after the ceremony and deleted on {formatDateLong(keep.deleteOn)}.</p>
          ))}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {counts.map(({ event, yes, maybe, no }) => (
            <div key={event.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <p className="text-sm font-bold">{event.name}</p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums">{yes.adults + yes.children}</p>
              <p className="text-sm text-[var(--muted)]">
                coming: {yes.adults} adult{yes.adults === 1 ? "" : "s"}, {yes.children} child{yes.children === 1 ? "" : "ren"}
              </p>
              <dl className="mt-3 grid gap-1 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--muted)]">Maybe</dt>
                  <dd className="tabular-nums">
                    {maybe.adults + maybe.children} {maybe.adults + maybe.children === 1 ? "person" : "people"}, {maybe.parties} {maybe.parties === 1 ? "reply" : "replies"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--muted)]">Can&apos;t make it</dt>
                  <dd className="tabular-nums">{no}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </section>

      {meals && (
        <section className="tool-section">
          <p className="tool-kicker">MEALS AT THE {meals.event.name.toUpperCase()}</p>
          <dl className="grid gap-1.5 text-sm">
            {meals.totals.map((total) => (
              <div key={total.option} className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] pb-1.5">
                <dt className="font-medium">{total.option}</dt>
                <dd className="tabular-nums">
                  <span className="font-bold">{total.yes}</span>
                  {total.maybe ? <span className="text-[var(--muted)]"> + {total.maybe} maybe</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {allergies.length > 0 && (
        <section className="tool-section">
          <p className="tool-kicker">ALLERGIES AND DIETARY NEEDS</p>
          <ul className="grid gap-2 text-sm">
            {allergies.map((item, index) => (
              <li key={index}>
                <span className="font-semibold">{item.name}:</span> {item.text}
              </li>
            ))}
          </ul>
          <div>
            <CopyButton text={allergies.map((item) => `${item.name}: ${item.text}`).join("\n")} label="Copy for the caterer" />
          </div>
        </section>
      )}

      {hasBaseEvent(data) && (
        <section className="tool-section">
          <p className="tool-kicker">BASE PASSES</p>
          <p className="section-description">
            Guests coming aboard who said someone in their party has no DoD ID. Tick each step as it happens. Ticks stay put when a guest changes their
            answer.
          </p>
          {passGuests.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Nobody needs a pass yet.</p>
          ) : (
            <>
              <p className="text-sm">
                <span className="font-bold">{passGuests.filter(passComplete).length}</span> of {passGuests.length} {passGuests.length === 1 ? "party has" : "parties have"} a pass in
                hand. {allAdults.length} {allAdults.length === 1 ? "adult" : "adults"} in all.
              </p>
              {allAdults.some((person) => !person.email) && (
                <p className="text-sm font-semibold text-[var(--warn)]">Some adults have no email address yet. The base needs one for each adult to send its link.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <CopyButton text={forTheBase(allAdults)} label="Copy names and emails for the base" />
                <CopyButton text={[...new Set(allAdults.map((person) => person.email).filter(Boolean))].join(", ")} label="Copy just the emails" />
              </div>
              <ul className="grid gap-3">
                {passGuests.map((guest) => (
                  <li key={guest.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                    <p className="font-semibold">{guest.name}&apos;s party</p>
                    <ul className="mt-2 grid gap-1.5 text-sm">
                      {passPeopleOf(guest).map((person, index) => (
                        <li key={index}>
                          <span className="font-medium">{person.name}</span>{" "}
                          {person.email ? (
                            <span className="break-words text-[var(--muted)]">{person.email}</span>
                          ) : (
                            <span className="font-semibold text-[var(--warn)]">no email yet</span>
                          )}
                        </li>
                      ))}
                      {passPeopleOf(guest).length === 0 && <li className="text-[var(--muted)]">No adults listed yet</li>}
                    </ul>
                    <div className="mt-3 grid gap-2">
                      {PIPELINE_STEPS.map((step) => (
                        <label key={step.key} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                          <input type="checkbox" className="h-5 w-5" checked={!!guest.pipeline[step.key]} onChange={(e) => void tick(guest, step.key, e.target.checked)} />
                          {step.label}
                        </label>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {list.length > 0 && (
        <Reminders
          inviteId={inviteId}
          data={data}
          guests={list}
          pageUrl={pageUrl}
          onMarked={(ids, at) => setGuests(list.map((g) => (ids.includes(g.id) ? { ...g, last_reminded_at: at } : g)))}
        />
      )}

      {allMessages.length > 0 && (
        <section className="tool-section">
          <p className="tool-kicker">MESSAGES FOR YOU</p>
          <ul className="grid gap-3">
            {allMessages.map((item) => (
              <li key={item.key} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-sm">
                <p className="whitespace-pre-line leading-relaxed">{item.text}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[var(--muted)]">
                    {item.name}
                    {item.day && <span className="font-normal"> · left on the page {new Date(item.day.created_at).toLocaleDateString()}</span>}
                  </p>
                  {item.day && (
                    <button type="button" className="btn btn-ghost !min-h-10 text-xs" onClick={() => void removeMessage(item.day as DayMessage)}>
                      <Trash2 size={14} aria-hidden="true" />
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div>
            <CopyButton text={allMessages.map((item) => `${item.text}\n(${item.name})`).join("\n\n")} label="Copy all messages" />
          </div>
        </section>
      )}

      <section className="tool-section">
        <p className="tool-kicker">EVERYONE</p>
        {list.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No replies yet. Share your link from the Share tab.</p>
        ) : (
          <>
            <input className="input" type="search" placeholder="Filter by name or email" aria-label="Filter guests" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <div className="flex flex-wrap items-center gap-2">
              {picking ? (
                <>
                  <button type="button" className="btn btn-secondary text-sm" onClick={() => setPicked(new Set(shown.map((guest) => guest.id)))}>
                    Select all {shown.length} shown
                  </button>
                  <button type="button" className="btn btn-primary text-sm" onClick={() => void removePicked()} disabled={picked.size === 0}>
                    <Trash2 size={14} aria-hidden="true" />
                    Remove {picked.size || ""} selected
                  </button>
                  <button type="button" className="btn btn-ghost text-sm" onClick={stopPicking}>
                    Done
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-ghost text-sm" onClick={() => setPicking(true)}>
                  <Trash2 size={14} aria-hidden="true" />
                  Remove several
                </button>
              )}
            </div>
            {picking && (
              <p className="text-xs text-[var(--muted)]">
                Tick the replies to remove. To clear out answers you do not recognize, type something they share into the filter, then select all shown.
              </p>
            )}
            <ul className="grid gap-2">
              {shown.map((guest) => (
                <GuestRow
                  key={guest.id}
                  guest={guest}
                  data={data}
                  onRemove={() => void remove(guest)}
                  picking={picking}
                  picked={picked.has(guest.id)}
                  onPick={(on) => pick(guest, on)}
                />
              ))}
            </ul>
          </>
        )}
      </section>

      <AddGuest inviteId={inviteId} data={data} onAdded={(guest) => setGuests([guest, ...list])} />
    </div>
  );
}

// Reminders go out from the host's own email app, so replies reach the host
// and nothing is sent in MilVector's name. MilVector picks the group, writes
// the message, and keeps track of who was reminded when.
function Reminders({
  inviteId,
  data,
  guests,
  pageUrl,
  onMarked,
}: {
  inviteId: string;
  data: InviteData;
  guests: GuestRecord[];
  pageUrl: string;
  onMarked: (ids: string[], at: string) => void;
}) {
  const [group, setGroup] = useState<ReminderGroup>("attending");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const counts = Object.fromEntries(REMINDER_GROUPS.map((g) => [g.id, reminderGuests(data, guests, g.id).length])) as Record<ReminderGroup, number>;
  const groups = REMINDER_GROUPS.filter((g) => g.id !== "pass" || hasBaseEvent(data));
  const chosen = reminderGuests(data, guests, group);
  const emails = reminderEmails(chosen, group);
  const phones = reminderPhones(chosen);
  const noEmail = chosen.filter((guest) => !guest.email).length;
  const text = reminderText({ data, group, note, pageUrl });
  const mailto = emails.length ? reminderMailto({ bcc: emails, subject: text.subject, body: text.body }) : null;
  const sms = `${text.subject}. ${pageUrl}`;
  const lastSent = chosen
    .map((guest) => guest.last_reminded_at)
    .filter((at): at is string => !!at)
    .sort()
    .slice(-1)[0];

  async function markSent() {
    setBusy(true);
    setStatus(null);
    const ids = chosen.map((guest) => guest.id);
    const res = await fetch(`/api/invites/${inviteId}/guests/reminded`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok || !json.at) {
      setStatus({ kind: "error", text: json.error ?? "That did not save. Try again." });
      return;
    }
    onMarked(ids, json.at);
    setStatus({ kind: "ok", text: `Marked ${ids.length} ${ids.length === 1 ? "guest" : "guests"} as reminded today.` });
  }

  return (
    <section className="tool-section">
      <p className="tool-kicker">REMINDERS</p>
      <p className="section-description">
        Sent from your own email, so replies come straight to you. MilVector writes the message and lists the addresses; it does not send anything.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Who to remind">
          <select
            className="input"
            value={group}
            onChange={(e) => {
              setGroup(e.target.value as ReminderGroup);
              setStatus(null);
            }}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label} ({counts[g.id]})
              </option>
            ))}
          </select>
        </Field>
        <Field label="A line of your own (optional)" hint="Goes at the top of the message.">
          <textarea className="input min-h-11" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Two weeks out. Can't wait to see you there." />
        </Field>
      </div>

      {chosen.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Nobody in this group right now.</p>
      ) : (
        <>
          <p className="text-sm">
            <span className="font-bold">{emails.length}</span> {emails.length === 1 ? "email address" : "email addresses"}
            {group === "pass" ? ", including each adult the base writes to" : ""}.
            {noEmail > 0 && (
              <span className="text-[var(--muted)]">
                {" "}
                {noEmail} {noEmail === 1 ? "guest has" : "guests have"} no email{phones.length ? "; text them instead" : ""}.
              </span>
            )}
            {lastSent && <span className="text-[var(--muted)]"> Last reminder marked {new Date(lastSent).toLocaleDateString()}.</span>}
          </p>
          <div className="rounded-xl border border-[var(--line)] p-3 text-sm">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Subject</p>
            <p className="mt-1">{text.subject}</p>
            <p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Message</p>
            <p className="mt-1 whitespace-pre-line">{text.body}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {mailto && (
              <a href={mailto} className="btn btn-primary text-sm">
                <Mail size={14} aria-hidden="true" />
                Open in my email
              </a>
            )}
            <CopyButton text={emails.join(", ")} label="Copy addresses for BCC" disabled={emails.length === 0} />
            <CopyButton text={text.subject} label="Copy subject" />
            <CopyButton text={text.body} label="Copy message" />
            {phones.length > 0 && <CopyButton text={phones.join(", ")} label={`Copy ${phones.length} mobile ${phones.length === 1 ? "number" : "numbers"}`} />}
            {phones.length > 0 && <CopyButton text={sms} label="Copy a text message" />}
          </div>
          {emails.length > 0 && !mailto && (
            <p className="text-xs text-[var(--muted)]">Too many addresses for one tap. Copy the addresses into BCC, then the subject and message.</p>
          )}
          <p className="text-xs text-[var(--muted)]">Put the addresses in BCC, not To, so guests do not see each other&apos;s email.</p>
          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-3">
            <button type="button" className="btn btn-secondary text-sm" onClick={() => void markSent()} disabled={busy}>
              {busy ? "Saving..." : "Mark as sent"}
            </button>
            <span className="text-xs text-[var(--muted)]">After you send it. Each guest&apos;s card shows the date.</span>
          </div>
          {status && <ToolAlert variant={status.kind === "ok" ? "info" : "error"}>{status.text}</ToolAlert>}
        </>
      )}
    </section>
  );
}

function GuestRow({
  guest,
  data,
  onRemove,
  picking = false,
  picked = false,
  onPick,
}: {
  guest: GuestRecord;
  data: InviteData;
  onRemove: () => void;
  picking?: boolean;
  picked?: boolean;
  onPick?: (on: boolean) => void;
}) {
  const events = sortEvents(data.events.filter(eventIsComplete));
  const changed = !!guest.previous?.answers;
  return (
    <li className={`flex items-start rounded-xl border bg-[var(--panel)] ${picked ? "border-[var(--accent)]" : "border-[var(--line)]"}`}>
      {picking && (
        <label className="flex min-h-12 shrink-0 cursor-pointer items-center pl-4">
          <input type="checkbox" className="h-5 w-5" checked={picked} onChange={(e) => onPick?.(e.target.checked)} aria-label={`Select ${guest.name}`} />
        </label>
      )}
      <details className="min-w-0 flex-1">
        <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
          <span className="font-semibold">{guest.name}</span>
          <span className="flex flex-wrap gap-1">
            {events.map((event) => {
              const status = guest.answers[event.id]?.status;
              return status ? (
                <span key={event.id} className={`tool-badge ${attending(status) ? "tool-badge-success" : NEUTRAL_BADGE}`} title={event.name}>
                  {event.name.split(" ").slice(-1)[0]}: {STATUS_SHORT[status]}
                </span>
              ) : null;
            })}
            {changed && <span className="tool-badge tool-badge-warn">Changed</span>}
            {guest.late && <span className="tool-badge tool-badge-warn">Late</span>}
            {guest.source === "host" && <span className={`tool-badge ${NEUTRAL_BADGE}`}>Added by you</span>}
          </span>
        </summary>
        <div className="grid gap-2 border-t border-[var(--line)] px-4 py-3 text-sm">
          {guest.email && <p className="break-all">{guest.email}</p>}
          {guest.phone && <p>{guest.phone}</p>}
          {events.map((event) =>
            guest.answers[event.id] ? (
              <p key={event.id}>
                <span className="text-[var(--muted)]">{event.name}:</span> {partyLine(guest.answers[event.id])}
              </p>
            ) : null,
          )}
          {Object.keys(guest.meals ?? {}).length > 0 && (
            <p>
              <span className="text-[var(--muted)]">Meals:</span>{" "}
              {Object.entries(guest.meals)
                .map(([option, n]) => `${n} ${option}`)
                .join(", ")}
            </p>
          )}
          {guest.dietary && (
            <p>
              <span className="text-[var(--muted)]">Dietary:</span> {guest.dietary}
            </p>
          )}
          {guest.dod_id && (
            <p>
              <span className="text-[var(--muted)]">Everyone holds a DoD ID:</span> {guest.dod_id === "yes" ? "Yes" : "No"}
            </p>
          )}
          {guest.message && <p className="whitespace-pre-line rounded-lg bg-[var(--surface)] p-3">{guest.message}</p>}
          {changed && (
            <p className="text-xs text-[var(--muted)]">
              Before the change:{" "}
              {events
                .map((event) => {
                  const before = guest.previous?.answers?.[event.id] as EventAnswer | undefined;
                  return before ? `${event.name}: ${partyLine(before)}` : "";
                })
                .filter(Boolean)
                .join("; ")}
            </p>
          )}
          <p className="text-xs text-[var(--muted)]">
            Last updated {new Date(guest.updated_at).toLocaleString()}
            {guest.last_reminded_at && <>. Reminded {new Date(guest.last_reminded_at).toLocaleDateString()}</>}
          </p>
          <div>
            <button type="button" className="btn btn-ghost text-sm" onClick={onRemove}>
              <Trash2 size={14} aria-hidden="true" />
              Remove
            </button>
          </div>
        </div>
      </details>
    </li>
  );
}

function AddGuest({ inviteId, data, onAdded }: { inviteId: string; data: InviteData; onAdded: (guest: GuestRecord) => void }) {
  const events = sortEvents(data.events.filter(eventIsComplete));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, EventAnswer>>({});
  const [dodId, setDodId] = useState<"" | "yes" | "no">("");
  const [passPeople, setPassPeople] = useState<PassPerson[]>([{ name: "", email: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const comingAboard = data.events.some((event) => event.onBase && attending(answers[event.id]?.status));
  const updatePerson = (index: number, patch: Partial<PassPerson>) => setPassPeople((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const adults = passPeople.map((p) => ({ name: p.name.trim(), email: p.email.trim() })).filter((p) => p.name || p.email);
    const res = await fetch(`/api/invites/${inviteId}/guests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, answers, dodId: comingAboard ? dodId : "", passPeople: comingAboard && dodId === "no" ? adults : [] }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok || !json.guest) {
      setError(json.error ?? "That guest could not be added. Try again.");
      return;
    }
    onAdded(json.guest);
    setName("");
    setEmail("");
    setAnswers({});
    setDodId("");
    setPassPeople([{ name: "", email: "" }]);
  }

  return (
    <details className="section-card">
      <summary className="cursor-pointer text-sm font-semibold">
        <Plus size={14} className="mr-1 inline" aria-hidden="true" />
        Add someone by hand
      </summary>
      <form className="mt-4 grid gap-4" onSubmit={add}>
        <p className="text-sm text-[var(--muted)]">For someone who answered by phone or in person, so your counts stay right.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} />
          </Field>
          <Field label="Email (optional)">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
          </Field>
        </div>
        {events.map((ev) => {
          const answer = answers[ev.id];
          return (
            <div key={ev.id} className="grid gap-2 rounded-xl border border-[var(--line)] p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
              <Field label={ev.name}>
                <select
                  className="input"
                  value={answer?.status ?? ""}
                  onChange={(e) =>
                    setAnswers((prev) => {
                      const next = { ...prev };
                      if (!e.target.value) delete next[ev.id];
                      else {
                        const status = e.target.value as RsvpStatus;
                        next[ev.id] = prev[ev.id] ? { ...prev[ev.id], status } : { status, adults: 1, children: 0 };
                      }
                      return next;
                    })
                  }
                >
                  <option value="">No answer</option>
                  <option value="yes">Yes</option>
                  <option value="maybe">Maybe</option>
                  <option value="no">No</option>
                </select>
              </Field>
              {answer && attending(answer.status) && (
                <>
                  <Field label="Adults">
                    <input
                      className="input sm:w-24"
                      inputMode="numeric"
                      value={answer.adults}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [ev.id]: { ...answer, adults: Math.min(30, Number(e.target.value.replace(/\D/g, "")) || 0) } }))}
                    />
                  </Field>
                  <Field label="Children">
                    <input
                      className="input sm:w-24"
                      inputMode="numeric"
                      value={answer.children}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [ev.id]: { ...answer, children: Math.min(30, Number(e.target.value.replace(/\D/g, "")) || 0) } }))}
                    />
                  </Field>
                </>
              )}
            </div>
          );
        })}
        {comingAboard && (
          <div className="grid gap-3">
            <Field label="Does every adult in their party hold a DoD ID?">
              <select className="input" value={dodId} onChange={(e) => setDodId(e.target.value as "" | "yes" | "no")}>
                <option value="">Not asked</option>
                <option value="yes">Yes</option>
                <option value="no">No, they need a pass</option>
              </select>
            </Field>
            {dodId === "no" && (
              <div className="grid gap-3">
                <p className="text-xs text-[var(--muted)]">
                  Each adult who needs a pass, with their own email: the base sends each of them a link. Children do not need a pass. Missing an email? Add
                  them now and fill it in later; the pass list flags it.
                </p>
                {passPeople.map((person, index) => (
                  <div key={index} className="grid gap-2 rounded-xl border border-[var(--line)] p-3 sm:grid-cols-2">
                    <Field label={`Adult ${index + 1}: full legal name`}>
                      <input className="input" value={person.name} onChange={(e) => updatePerson(index, { name: e.target.value })} maxLength={80} />
                    </Field>
                    <Field label="Their email">
                      <input className="input" type="email" value={person.email} onChange={(e) => updatePerson(index, { email: e.target.value })} maxLength={120} />
                    </Field>
                  </div>
                ))}
                {passPeople.length < MAX_PASS_PEOPLE && (
                  <button type="button" className="btn btn-secondary w-full text-sm sm:w-auto" onClick={() => setPassPeople((prev) => [...prev, { name: "", email: "" }])}>
                    <Plus size={14} aria-hidden="true" />
                    Add another adult
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {error && <ToolAlert variant="error">{error}</ToolAlert>}
        <div>
          <button type="submit" className="btn btn-primary w-full text-sm sm:w-auto" disabled={busy}>
            {busy ? "Adding..." : "Add to the list"}
          </button>
        </div>
      </form>
    </details>
  );
}
