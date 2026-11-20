"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Check, Copy, Mail, MapPin, Minus, Plus, X } from "lucide-react";
import {
  MAX_PARTY,
  MAX_PASS_PEOPLE,
  NO_SSN_NOTE,
  attending,
  attendingBaseEvent,
  confirmationText,
  mealEvent,
  mealOptions,
  partyLine,
  passPeopleOf,
  passSteps,
  type EventAnswer,
  type GuestAnswers,
  type PassPerson,
  type RsvpStatus,
} from "@/lib/invites/rsvp";
import type { InviteData, InviteEvent } from "@/lib/invites/schema";
import { eventIsComplete, formatDateLong, formatTimeRange, googleCalendarUrl, sortEvents } from "@/lib/invites/time";

// The RSVP form on the guest page, and the confirmation that replaces it.
// Colors come from the template through CSS variables set on the page.

type Saved = { token: string | null; addresses: Record<string, string>; late: boolean; passPeople: PassPerson[] };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const input =
  "w-full rounded-xl border border-[var(--iv-line)] bg-[var(--iv-bg)] px-3 py-3 text-base text-[var(--iv-ink)] outline-none focus:border-[var(--iv-accent)] focus:ring-2 focus:ring-[var(--iv-accent)]/30 disabled:opacity-60";
const labelText = "block text-sm font-semibold";
const hint = "block text-xs text-[var(--iv-muted)]";

function Stepper({ label, value, onChange, disabled, id }: { label: string; value: number; onChange: (n: number) => void; disabled?: boolean; id: string }) {
  const set = (n: number) => onChange(Math.max(0, Math.min(MAX_PARTY, n)));
  const button = "flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--iv-line)] bg-[var(--iv-bg)] disabled:opacity-40";
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <button type="button" className={button} onClick={() => set(value - 1)} disabled={disabled || value <= 0} aria-label={`One fewer: ${label}`}>
          <Minus size={16} aria-hidden="true" />
        </button>
        <input
          id={id}
          className="h-11 w-14 rounded-xl border border-[var(--iv-line)] bg-[var(--iv-bg)] text-center text-base font-semibold text-[var(--iv-ink)] tabular-nums"
          inputMode="numeric"
          value={value}
          onChange={(e) => set(Number(e.target.value.replace(/\D/g, "")) || 0)}
          disabled={disabled}
        />
        <button type="button" className={button} onClick={() => set(value + 1)} disabled={disabled || value >= MAX_PARTY} aria-label={`One more: ${label}`}>
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function Choices<T extends string>({ name, value, options, onChange, disabled }: { name: string; value: T | ""; options: [T, string][]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-2" role="radiogroup" aria-label={name}>
      {options.map(([option, text]) => {
        const on = value === option;
        return (
          <label
            key={option}
            className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 text-base font-semibold ${disabled ? "cursor-default opacity-70" : ""}`}
            style={{ borderColor: on ? "var(--iv-accent)" : "var(--iv-line)", background: on ? "var(--iv-surface)" : "var(--iv-bg)", boxShadow: on ? "inset 0 0 0 1px var(--iv-accent)" : undefined }}
          >
            <input type="radio" name={name} className="sr-only" checked={on} onChange={() => onChange(option)} disabled={disabled} />
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
              style={{ borderColor: on ? "var(--iv-accent)" : "var(--iv-muted)", background: on ? "var(--iv-accent)" : "transparent" }}
              aria-hidden="true"
            >
              {on && <Check size={12} strokeWidth={3} style={{ color: "var(--iv-on-accent)" }} />}
            </span>
            {text}
          </label>
        );
      })}
    </div>
  );
}

// One row per adult who needs a visitor pass: full legal name and their own
// email, because the base sends each adult a link of their own.
function PassPeopleFields({
  people,
  onChange,
  self,
  deadline,
  disabled,
}: {
  people: PassPerson[];
  onChange: (next: PassPerson[]) => void;
  self: PassPerson | null;
  deadline: string;
  disabled?: boolean;
}) {
  const update = (index: number, patch: Partial<PassPerson>) => onChange(people.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  const remove = (index: number) => onChange(people.length === 1 ? [{ name: "", email: "" }] : people.filter((_, i) => i !== index));
  const selfListed = !!self && people.some((p) => p.email.trim().toLowerCase() === self.email.toLowerCase());
  const addSelf = () => {
    if (!self) return;
    const blank = people.findIndex((p) => !p.name.trim() && !p.email.trim());
    onChange(blank >= 0 ? people.map((p, i) => (i === blank ? self : p)) : [...people, self]);
  };

  return (
    <div className="grid gap-3">
      <p className="rounded-xl border-l-4 border-[var(--iv-accent)] bg-[var(--iv-bg)] px-4 py-3 text-sm leading-relaxed">
        List every adult who needs a pass, each with their own email address. The base sends each of them a link to enter their information, so use
        addresses they check. Children do not need a pass.
      </p>
      {people.map((person, index) => (
        <div key={index} className="grid gap-2 rounded-xl border border-[var(--iv-line)] bg-[var(--iv-bg)] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--iv-muted)]">Adult {index + 1}</p>
            {(people.length > 1 || person.name || person.email) && (
              <button
                type="button"
                onClick={() => remove(index)}
                disabled={disabled}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--iv-line)]"
                aria-label={`Remove adult ${index + 1}`}
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          <label className="grid gap-1">
            <span className={labelText}>Full legal name</span>
            <span className={hint}>Exactly as on their driver&apos;s license or passport.</span>
            <input className={input} value={person.name} onChange={(e) => update(index, { name: e.target.value })} maxLength={80} autoComplete="off" disabled={disabled} />
          </label>
          <label className="grid gap-1">
            <span className={labelText}>Their email</span>
            <input
              className={input}
              type="email"
              value={person.email}
              onChange={(e) => update(index, { email: e.target.value })}
              maxLength={120}
              autoComplete="off"
              autoCapitalize="none"
              disabled={disabled}
            />
          </label>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {people.length < MAX_PASS_PEOPLE && (
          <button
            type="button"
            onClick={() => onChange([...people, { name: "", email: "" }])}
            disabled={disabled}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--iv-line)] bg-[var(--iv-bg)] px-4 text-sm font-semibold"
          >
            <Plus size={16} aria-hidden="true" />
            Add another adult
          </button>
        )}
        {self && !selfListed && (
          <button
            type="button"
            onClick={addSelf}
            disabled={disabled}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--iv-line)] bg-[var(--iv-bg)] px-4 text-sm font-semibold"
          >
            <Plus size={16} aria-hidden="true" />I need one too: add me
          </button>
        )}
      </div>
      <p className="text-xs text-[var(--iv-muted)]">
        {deadline ? `Answer by ${formatDateLong(deadline)} so there is time to arrange passes. ` : ""}
        {NO_SSN_NOTE}
      </p>
    </div>
  );
}

// On the day and afterward the RSVP form becomes a message form: people who
// were there still want to leave something.
export function MessageForm({ data, slug, framed = false }: { data: InviteData; slug: string; framed?: boolean }) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const first = data.retiree.name.split(" ")[0] || "the retiree";

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (framed) return;
    setError("");
    setBusy(true);
    const res = await fetch(`/r/${slug}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, message, website }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok || !json.ok) {
      setError(json.error ?? "That did not go through. Check your connection and try again. Your message is still here.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="mt-5" role="status">
        <p className="text-2xl font-bold">Thank you, {name.split(" ")[0]}.</p>
        <p className="mt-1 text-[var(--iv-muted)]">Your message is with {first}.</p>
        <button
          type="button"
          className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-[var(--iv-line)] bg-[var(--iv-bg)] px-4 text-sm font-semibold"
          onClick={() => {
            setSent(false);
            setMessage("");
          }}
        >
          Leave another message
        </button>
      </div>
    );
  }

  return (
    <form className="mt-5 grid gap-4" onSubmit={send}>
      <label className="grid gap-1">
        <span className={labelText}>Your name</span>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={80} disabled={framed} />
      </label>
      <label className="grid gap-1">
        <span className={labelText}>Your message for {first}</span>
        <span className={hint}>Congratulations, a story, the thing you would have said in person.</span>
        <textarea className={`${input} min-h-32`} value={message} onChange={(e) => setMessage(e.target.value)} required maxLength={1500} disabled={framed} />
      </label>
      <div className="hidden" aria-hidden="true">
        <label>
          Leave this blank
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>
      {error && (
        <p className="rounded-xl border-l-4 border-[#b42318] bg-[var(--iv-surface)] px-4 py-3 text-sm" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="min-h-12 w-full rounded-xl px-6 text-base font-bold disabled:opacity-60"
        style={{ background: "var(--iv-accent)", color: "var(--iv-on-accent)" }}
        disabled={busy || framed}
      >
        {busy ? "Sending..." : "Send my message"}
      </button>
    </form>
  );
}

export function RsvpForm({ data, slug, pageUrl, framed = false }: { data: InviteData; slug: string; pageUrl: string; framed?: boolean }) {
  const events = useMemo(() => sortEvents(data.events.filter(eventIsComplete)), [data.events]);
  const meal = mealEvent(data);
  const meals = mealOptions(data);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [answers, setAnswers] = useState<Record<string, Partial<EventAnswer>>>({});
  const [mealCounts, setMealCounts] = useState<Record<string, number>>({});
  const [dietary, setDietary] = useState("");
  const [dodId, setDodId] = useState<"yes" | "no" | "">("");
  const [passPeople, setPassPeople] = useState<PassPerson[]>([{ name: "", email: "" }]);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [token, setToken] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState<Saved | null>(null);

  // A guest returning from their personal link sees their answer filled in.
  useEffect(() => {
    if (framed) return;
    const linkToken = new URLSearchParams(window.location.search).get("rsvp");
    if (!linkToken || !/^[a-f0-9]{32,80}$/.test(linkToken)) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/r/${slug}/rsvp?token=${linkToken}`).catch(() => null);
      const json = res ? await res.json().catch(() => ({})) : {};
      if (cancelled) return;
      if (!res?.ok || !json.rsvp) {
        setNotice(json.error ?? "That link no longer works. Answer again with the same email to update your RSVP.");
        return;
      }
      const r = json.rsvp;
      setToken(linkToken);
      setName(r.name ?? "");
      setEmail(r.email ?? "");
      setPhone(r.phone ?? "");
      setAnswers(r.answers ?? {});
      setMealCounts(r.meals ?? {});
      setDietary(r.dietary ?? "");
      setDodId(r.dodId ?? "");
      const people = passPeopleOf({ pass_people: r.passPeople ?? null, pass_names: r.passNames ?? null });
      setPassPeople(people.length ? people : [{ name: "", email: "" }]);
      setMessage(r.message ?? "");
      setNotice("Welcome back. Your answer is filled in below. Change anything and save it again.");
      document.getElementById("rsvp")?.scrollIntoView({ block: "start" });
    })();
    return () => {
      cancelled = true;
    };
  }, [framed, slug]);

  const complete: GuestAnswers = Object.fromEntries(
    Object.entries(answers)
      .filter(([, a]) => a.status)
      .map(([id, a]) => [id, { status: a.status as RsvpStatus, adults: a.status === "no" ? 0 : (a.adults ?? 1), children: a.status === "no" ? 0 : (a.children ?? 0) }]),
  );
  const comingAboard = attendingBaseEvent(data, complete);
  const atMeal = meal ? attending(complete[meal.id]?.status) : false;
  const anyAttending = Object.values(complete).some((a) => attending(a.status));
  const mealHeadcount = meal && atMeal ? (complete[meal.id].adults ?? 0) + (complete[meal.id].children ?? 0) : 0;
  const mealTotal = Object.values(mealCounts).reduce((sum, n) => sum + n, 0);

  const setAnswer = (id: string, patch: Partial<EventAnswer>) => setAnswers((prev) => ({ ...prev, [id]: { adults: 1, children: 0, ...prev[id], ...patch } }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (framed) return;
    setError("");
    if (Object.keys(complete).length === 0) {
      setError("Answer yes, maybe, or no for at least one event.");
      return;
    }
    const needsPass = comingAboard && dodId === "no";
    const adults = passPeople.map((p) => ({ name: p.name.trim(), email: p.email.trim() })).filter((p) => p.name || p.email);
    if (needsPass) {
      if (adults.length === 0) {
        setError("Add each adult who needs a visitor pass, with their own email address.");
        return;
      }
      if (adults.some((p) => p.name.length < 2)) {
        setError("Enter the full legal name of each adult who needs a pass.");
        return;
      }
      if (adults.some((p) => !EMAIL_RE.test(p.email))) {
        setError("Enter an email address for each adult who needs a pass. The base sends each of them a link.");
        return;
      }
    }
    setBusy(true);
    const res = await fetch(`/r/${slug}/rsvp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        name,
        email,
        phone,
        answers: complete,
        meals: atMeal ? mealCounts : {},
        dietary: data.rsvp.dietary && anyAttending ? dietary : "",
        dodId: comingAboard ? dodId : "",
        passPeople: needsPass ? adults : [],
        message: data.rsvp.message ? message : "",
        website,
      }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok || !json.ok) {
      setError(json.error ?? "That did not go through. Check your connection and try again. Your answers are still here.");
      return;
    }
    if (json.token) setToken(json.token);
    setSaved({ token: json.token ?? token, addresses: json.addresses ?? {}, late: !!json.late, passPeople: needsPass ? adults : [] });
    setNotice("");
    document.getElementById("rsvp")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  if (!data.rsvp.enabled) {
    return (
      <p className="mt-4 text-[var(--iv-muted)]">
        RSVPs are closed.
        {data.contactEmail ? (
          <>
            {" "}
            Questions?{" "}
            <a href={`mailto:${data.contactEmail}`} className="font-semibold text-[var(--iv-accent-text)] underline">
              {data.contactEmail}
            </a>
          </>
        ) : null}
      </p>
    );
  }

  if (saved) {
    return (
      <Confirmation
        data={data}
        slug={slug}
        pageUrl={pageUrl}
        events={events}
        name={name}
        email={email}
        answers={complete}
        dodId={dodId}
        saved={saved}
        onChange={() => setSaved(null)}
      />
    );
  }

  return (
    <form className="mt-5 flex flex-col gap-5" onSubmit={submit} noValidate={false}>
      {notice && (
        <p className="rounded-xl border-l-4 border-[var(--iv-accent)] bg-[var(--iv-surface)] px-4 py-3 text-sm" role="status">
          {notice}
        </p>
      )}
      <p className="text-[var(--iv-muted)]">
        {data.rsvp.deadline ? `Please answer by ${formatDateLong(data.rsvp.deadline)}. ` : ""}
        Plans change. You can come back and change your answer any time.
      </p>

      <fieldset className="grid gap-4 rounded-2xl border border-[var(--iv-line)] bg-[var(--iv-surface)] p-5">
        <legend className="px-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--iv-muted)]">Who you are</legend>
        <label className="grid gap-1">
          <span className={labelText}>Your name</span>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={80} disabled={framed} />
        </label>
        <label className="grid gap-1">
          <span className={labelText}>Email</span>
          <span className={hint}>So you can change your answer later. Your confirmation shows on this screen; nothing is sold or shared.</span>
          <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required maxLength={120} disabled={framed} />
        </label>
        <label className="grid gap-1">
          <span className={labelText}>Mobile number (optional)</span>
          <span className={hint}>Only if the host needs to reach you on the day.</span>
          <input className={input} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" maxLength={30} disabled={framed} />
        </label>
      </fieldset>

      {events.map((event) => {
        const answer = answers[event.id];
        const coming = answer?.status === "yes" || answer?.status === "maybe";
        return (
          <fieldset key={event.id} className="grid gap-4 rounded-2xl border border-[var(--iv-line)] bg-[var(--iv-surface)] p-5">
            <legend className="px-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--iv-muted)]">{event.name}</legend>
            <p className="-mt-1 text-sm text-[var(--iv-muted)]">
              {formatDateLong(event.date)}, {formatTimeRange(event, data.timeFormat)}
            </p>
            <Choices
              name={`Attending ${event.name}`}
              value={answer?.status ?? ""}
              onChange={(status) => setAnswer(event.id, { status })}
              options={[
                ["yes", "Yes, I'll be there"],
                ["maybe", "Maybe, I can't commit yet"],
                ["no", "No, I can't make it"],
              ]}
              disabled={framed}
            />
            {coming && (
              <div className="grid gap-3 border-t border-[var(--iv-line)] pt-4">
                {answer?.status === "maybe" && <p className={hint}>Give your best guess. An estimate helps more than a blank, and you can change it.</p>}
                <Stepper id={`adults-${event.id}`} label="Adults, including you" value={answer?.adults ?? 1} onChange={(adults) => setAnswer(event.id, { adults })} disabled={framed} />
                <Stepper id={`children-${event.id}`} label="Children" value={answer?.children ?? 0} onChange={(children) => setAnswer(event.id, { children })} disabled={framed} />
              </div>
            )}
          </fieldset>
        );
      })}

      {comingAboard && (
        <fieldset className="grid gap-4 rounded-2xl border border-[var(--iv-line)] bg-[var(--iv-surface)] p-5">
          <legend className="px-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--iv-muted)]">Getting on base</legend>
          <p className="-mt-1 text-sm">
            Does every adult in your party hold a DoD ID?
            <span className={hint}>Retired, active duty, dependent, and civilian employee IDs all count. Children do not need a pass.</span>
          </p>
          <Choices
            name="Every adult holds a DoD ID"
            value={dodId}
            onChange={setDodId}
            options={[
              ["yes", "Yes, we can get ourselves on base"],
              ["no", "No, one or more adults need a visitor pass"],
            ]}
            disabled={framed}
          />
          {dodId === "no" && (
            <PassPeopleFields
              people={passPeople}
              onChange={setPassPeople}
              self={name.trim().length >= 2 && EMAIL_RE.test(email.trim()) ? { name: name.trim(), email: email.trim() } : null}
              deadline={data.base.passDeadline}
              disabled={framed}
            />
          )}
        </fieldset>
      )}

      {meal && atMeal && meals.length > 0 && (
        <fieldset className="grid gap-3 rounded-2xl border border-[var(--iv-line)] bg-[var(--iv-surface)] p-5">
          <legend className="px-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--iv-muted)]">Meals at the {meal.name.toLowerCase()}</legend>
          <p className={hint}>A count of each, so a family can split it however they like.</p>
          {meals.map((option, index) => (
            <Stepper
              key={option}
              id={`meal-${index}`}
              label={option}
              value={mealCounts[option] ?? 0}
              onChange={(n) => setMealCounts((prev) => ({ ...prev, [option]: n }))}
              disabled={framed}
            />
          ))}
          <p className="text-sm" style={{ color: mealTotal === mealHeadcount ? "var(--iv-muted)" : "var(--iv-accent-text)" }} aria-live="polite">
            {mealTotal} meal{mealTotal === 1 ? "" : "s"} for {mealHeadcount} {mealHeadcount === 1 ? "person" : "people"}
          </p>
        </fieldset>
      )}

      {data.rsvp.dietary && anyAttending && (
        <label className="grid gap-1">
          <span className={labelText}>Allergies or dietary needs</span>
          <span className={hint}>Anything the host should know, like a shellfish allergy.</span>
          <textarea className={`${input} min-h-20`} value={dietary} onChange={(e) => setDietary(e.target.value)} maxLength={300} disabled={framed} />
        </label>
      )}

      {data.rsvp.message && (
        <label className="grid gap-1">
          <span className={labelText}>Leave a message for {data.retiree.name.split(" ")[0] || "the retiree"} (optional)</span>
          <span className={hint}>Congratulations, a story, the thing you would have said in person. It may be read aloud, so keep it fit for the family.</span>
          <textarea className={`${input} min-h-28`} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1500} disabled={framed} />
        </label>
      )}

      {/* Honeypot. People never see this; bots fill it in. */}
      <div className="hidden" aria-hidden="true">
        <label>
          Leave this blank
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      {error && (
        <p className="rounded-xl border-l-4 border-[#b42318] bg-[var(--iv-surface)] px-4 py-3 text-sm" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="min-h-12 w-full rounded-xl px-6 text-base font-bold disabled:opacity-60"
        style={{ background: "var(--iv-accent)", color: "var(--iv-on-accent)" }}
        disabled={busy || framed}
      >
        {busy ? "Sending..." : token ? "Save my changes" : "Send my RSVP"}
      </button>
    </form>
  );
}

function Confirmation({
  data,
  slug,
  pageUrl,
  events,
  name,
  email,
  answers,
  dodId,
  saved,
  onChange,
}: {
  data: InviteData;
  slug: string;
  pageUrl: string;
  events: InviteEvent[];
  name: string;
  email: string;
  answers: GuestAnswers;
  dodId: string;
  saved: Saved;
  onChange: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const personalUrl = saved.token ? `${pageUrl}?rsvp=${saved.token}#rsvp` : pageUrl;
  const text = confirmationText({ data, name, answers, addresses: saved.addresses, dodId, passPeople: saved.passPeople, pageUrl, personalUrl });
  const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(text.subject)}&body=${encodeURIComponent(text.body)}`;
  const needsPass = dodId === "no" && attendingBaseEvent(data, answers);
  const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--iv-line)] bg-[var(--iv-bg)] px-4 text-sm font-semibold";

  return (
    <div className="mt-5 flex flex-col gap-5" role="status">
      <div>
        <p className="text-2xl font-bold">Thank you, {name.split(" ")[0]}.</p>
        <p className="mt-1 text-[var(--iv-muted)]">
          Your answer is saved. Keep this screen, or use the buttons below to keep a copy.
          {saved.late ? " It came in after the RSVP date, and the host can still see it." : ""}
        </p>
      </div>

      {events
        .filter((event) => answers[event.id])
        .map((event) => {
          const answer = answers[event.id];
          const coming = attending(answer.status);
          const privateAddress = saved.addresses[event.id];
          return (
            <article key={event.id} className="rounded-2xl border border-[var(--iv-line)] bg-[var(--iv-surface)] p-5">
              <p className="text-lg font-bold">{event.name}</p>
              <p className="text-sm font-semibold text-[var(--iv-accent-text)]">{partyLine(answer)}</p>
              {coming && (
                <>
                  <p className="mt-2 text-sm">
                    {formatDateLong(event.date)}, {formatTimeRange(event, data.timeFormat)}
                  </p>
                  {privateAddress ? (
                    <div className="mt-3 rounded-xl border-l-4 border-[var(--iv-accent)] bg-[var(--iv-bg)] px-4 py-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--iv-muted)]">The address</p>
                      <p className="mt-1 font-semibold">
                        {event.place ? `${event.place}, ` : ""}
                        {privateAddress}
                      </p>
                      <p className="mt-1 text-xs text-[var(--iv-muted)]">A private home. Please do not post it publicly.</p>
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={`/r/${slug}/calendar/${event.id}`} download className={button}>
                      <CalendarPlus size={16} aria-hidden="true" />
                      Add to calendar
                    </a>
                    <a href={googleCalendarUrl({ data, event, pageUrl })} target="_blank" rel="noopener noreferrer" className={button}>
                      <CalendarPlus size={16} aria-hidden="true" />
                      Google Calendar
                    </a>
                    {privateAddress && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(privateAddress)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={button}
                      >
                        <MapPin size={16} aria-hidden="true" />
                        Directions
                      </a>
                    )}
                  </div>
                </>
              )}
            </article>
          );
        })}

      {needsPass && (
        <article className="rounded-2xl border-l-4 border-[var(--iv-accent)] bg-[var(--iv-surface)] p-5">
          <p className="text-lg font-bold">About your visitor passes</p>
          {saved.passPeople.length > 0 && (
            <>
              <p className="mt-2 text-sm text-[var(--iv-muted)]">The base will email each of these adults a link:</p>
              <ul className="mt-1 grid gap-1 text-sm">
                {saved.passPeople.map((person) => (
                  <li key={`${person.name}-${person.email}`}>
                    <span className="font-semibold">{person.name}</span> <span className="break-words text-[var(--iv-muted)]">{person.email}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <ol className="mt-3 grid gap-2 text-sm">
            {passSteps(data).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-[var(--iv-muted)]">{NO_SSN_NOTE}</p>
        </article>
      )}

      <article className="rounded-2xl border border-[var(--iv-line)] bg-[var(--iv-surface)] p-5">
        <p className="text-lg font-bold">Keep a copy</p>
        <p className="mt-1 text-sm text-[var(--iv-muted)]">
          This page does not email you. Send yourself the details from your own email, and save your personal link to change your answer later.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <a href={mailto} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold" style={{ background: "var(--iv-accent)", color: "var(--iv-on-accent)" }}>
            <Mail size={16} aria-hidden="true" />
            Email this to myself
          </a>
          {saved.token && (
            <button
              type="button"
              className={button}
              onClick={async () => {
                await navigator.clipboard.writeText(personalUrl).catch(() => {});
                setCopied(true);
              }}
            >
              {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              {copied ? "Link copied" : "Copy my personal link"}
            </button>
          )}
        </div>
      </article>

      <button type="button" className={`${button} w-full`} onClick={onChange}>
        Change my answer
      </button>
    </div>
  );
}
