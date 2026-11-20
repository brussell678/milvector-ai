"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { useLinkToken, useRememberedAnswer } from "@/lib/invites/guest-memory";
import { attending, partyLine, type GuestAnswers } from "@/lib/invites/rsvp";
import type { InviteData } from "@/lib/invites/schema";
import { eventIsComplete, formatTimeRange, publicLocation, sortEvents } from "@/lib/invites/time";

// On the day the RSVP form has become a message form, but a guest who
// answered still needs what their answer gave them, above all a private home
// address for the party that evening. Their personal link, or this phone's
// memory of their answer, brings it up here at the top of the page.

type Loaded = { name: string; answers: GuestAnswers; addresses: Record<string, string> };

export function YourAnswer({ data, slug }: { data: InviteData; slug: string }) {
  const fromLink = useLinkToken();
  const remembered = useRememberedAnswer(slug);
  const token = fromLink ?? remembered?.token ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/r/${slug}/rsvp?token=${token}`).catch(() => null);
      const json = res ? await res.json().catch(() => ({})) : {};
      if (cancelled || !res?.ok || !json.rsvp) return;
      setLoaded({ name: json.rsvp.name ?? "", answers: json.rsvp.answers ?? {}, addresses: json.rsvp.addresses ?? {} });
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, token]);

  if (!token || !loaded) return null;
  const coming = sortEvents(data.events.filter(eventIsComplete)).filter((event) => attending(loaded.answers[event.id]?.status));
  if (coming.length === 0) return null;

  return (
    <section id="your-answer" className="scroll-mt-4 rounded-2xl border-l-4 border-[var(--iv-accent)] bg-[var(--iv-surface)] p-5" aria-label="Your answer">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--iv-muted)]">Your answer{loaded.name ? `, ${loaded.name.split(" ")[0]}` : ""}</p>
      <div className="mt-3 grid gap-4">
        {coming.map((event) => {
          const address = loaded.addresses[event.id];
          return (
            <div key={event.id}>
              <p className="text-lg font-bold">{event.name}</p>
              <p className="text-sm font-semibold text-[var(--iv-accent-text)]">
                {formatTimeRange(event, data.timeFormat)}. {partyLine(loaded.answers[event.id])}
              </p>
              {address ? (
                <>
                  <p className="mt-2 font-semibold">
                    {event.place ? `${event.place}, ` : ""}
                    {address}
                  </p>
                  <p className="text-xs text-[var(--iv-muted)]">A private home. Please do not post it publicly.</p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--iv-line)] bg-[var(--iv-bg)] px-4 text-sm font-semibold"
                  >
                    <MapPin size={16} aria-hidden="true" />
                    Directions
                  </a>
                </>
              ) : (
                publicLocation(event) && <p className="mt-1 text-sm">{publicLocation(event)}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
