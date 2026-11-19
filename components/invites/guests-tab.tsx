"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Plus, RefreshCw, Trash2 } from "lucide-react";
import { CopyButton, Field, download } from "@/components/invites/builder-ui";
import { ToolAlert } from "@/components/tools/tool-alert";
import { guestsCsv, headcounts, mealTotals, needsPass, passComplete, passNameList, retention, withText } from "@/lib/invites/guests";
import { PIPELINE_STEPS, attending, partyLine, type EventAnswer, type GuestRecord, type PipelineKey, type RsvpStatus } from "@/lib/invites/rsvp";
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

export function GuestsTab({ inviteId, slug, data, published }: { inviteId: string; slug: string; data: InviteData; published: boolean }) {
  const [guests, setGuests] = useState<GuestRecord[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // What counts as new is measured from the previous visit. This tab only
  // renders in the browser, after the builder has loaded.
  const [seenAt] = useState<string | null>(() => (typeof window === "undefined" ? null : readSeen(inviteId)));
  const [filter, setFilter] = useState("");

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
      else setGuests(json.guests ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteId]);

  const list = guests ?? [];
  const counts = headcounts(data, list);
  const meals = mealTotals(data, list);
  const passGuests = needsPass(data, list);
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

  if (guests === null) {
    return error ? <ToolAlert variant="error">{error}</ToolAlert> : <p className="section-card text-sm text-[var(--muted)]">Loading your guest list...</p>;
  }

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
                hand. {passNameList(passGuests).length} names in all.
              </p>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={passGuests.map((g) => g.email).filter(Boolean).join(", ")} label="Copy their emails" />
                <CopyButton text={passNameList(passGuests).join("\n")} label="Copy all names" />
              </div>
              <ul className="grid gap-3">
                {passGuests.map((guest) => (
                  <li key={guest.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                    <p className="font-semibold">{guest.name}</p>
                    {guest.email && <p className="break-all text-xs text-[var(--muted)]">{guest.email}</p>}
                    <p className="mt-2 whitespace-pre-line text-sm">{guest.pass_names || "No names given yet"}</p>
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

      {messages.length > 0 && (
        <section className="tool-section">
          <p className="tool-kicker">MESSAGES FOR YOU</p>
          <ul className="grid gap-3">
            {messages.map((item, index) => (
              <li key={index} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-sm">
                <p className="whitespace-pre-line leading-relaxed">{item.text}</p>
                <p className="mt-2 text-xs font-semibold text-[var(--muted)]">{item.name}</p>
              </li>
            ))}
          </ul>
          <div>
            <CopyButton text={messages.map((item) => `${item.text}\n(${item.name})`).join("\n\n")} label="Copy all messages" />
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
            <ul className="grid gap-2">
              {shown.map((guest) => (
                <GuestRow key={guest.id} guest={guest} data={data} onRemove={() => void remove(guest)} />
              ))}
            </ul>
          </>
        )}
      </section>

      <AddGuest inviteId={inviteId} data={data} onAdded={(guest) => setGuests([guest, ...list])} />
    </div>
  );
}

function GuestRow({ guest, data, onRemove }: { guest: GuestRecord; data: InviteData; onRemove: () => void }) {
  const events = sortEvents(data.events.filter(eventIsComplete));
  const changed = !!guest.previous?.answers;
  return (
    <li className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
      <details>
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
          <p className="text-xs text-[var(--muted)]">Last updated {new Date(guest.updated_at).toLocaleString()}</p>
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
  const [passNames, setPassNames] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const comingAboard = data.events.some((event) => event.onBase && attending(answers[event.id]?.status));

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch(`/api/invites/${inviteId}/guests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, answers, dodId: comingAboard ? dodId : "", passNames: comingAboard && dodId === "no" ? passNames : "" }),
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
    setPassNames("");
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
            <Field label="Does everyone in their party hold a DoD ID?">
              <select className="input" value={dodId} onChange={(e) => setDodId(e.target.value as "" | "yes" | "no")}>
                <option value="">Not asked</option>
                <option value="yes">Yes</option>
                <option value="no">No, they need a pass</option>
              </select>
            </Field>
            {dodId === "no" && (
              <Field label="Full legal names for passes" hint="One per line, as on their ID.">
                <textarea className="input min-h-20" value={passNames} onChange={(e) => setPassNames(e.target.value)} maxLength={600} />
              </Field>
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
