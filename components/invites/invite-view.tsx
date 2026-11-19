import type { CSSProperties } from "react";
import { CalendarPlus, MapPin } from "lucide-react";
import { BaseAccess } from "@/components/invites/base-access";
import { headingFamily, inviteFontVariables } from "@/components/invites/fonts";
import { RsvpForm } from "@/components/invites/rsvp-form";
import { ShareActions } from "@/components/invites/share-actions";
import { StickyRsvp } from "@/components/invites/sticky-rsvp";
import { BRANCH_NAMES, hasBaseEvent, type InviteData, type InviteEvent } from "@/lib/invites/schema";
import { contrastRatio, inviteColors, readTemplate } from "@/lib/invites/templates";
import { ceremonyOf, directionsUrl, eventIsComplete, formatDateLong, formatTime, formatTimeRange, googleCalendarUrl, publicLocation, sortEvents } from "@/lib/invites/time";

// The dark shade laid over a cover photo so white text reads on any picture.
const SCRIM_TONE = "#141a22";

// Today at the venue, as YYYY-MM-DD, for deadline countdowns.
function todayIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// The guest-facing invitation. Renders the same on the public page and in the
// builder's preview. It sizes itself by its own width (container queries), not
// the browser window, so the preview frame shows exactly what a phone shows.

type Props = {
  data: InviteData;
  slug: string;
  pageUrl: string;
  coverSrc: string | null;
  qrSvg?: string | null;
  // In the builder: no full-screen height, and links that would leave the
  // editor are inert.
  framed?: boolean;
};

export function InviteView({ data, slug, pageUrl, coverSrc, qrSvg, framed = false }: Props) {
  const template = readTemplate(data.template);
  const c = inviteColors(template, data.accent);
  const heading: CSSProperties = { fontFamily: headingFamily(template.heading) };
  const upper = template.heading !== "serif";
  const events = sortEvents(data.events.filter(eventIsComplete));
  const ceremony = ceremonyOf(data);
  const fullName = [data.retiree.rank, data.retiree.name].filter(Boolean).join(" ");
  const onCover = !!coverSrc;
  const heroInk = onCover ? "#ffffff" : c.ink;
  const heroMuted = onCover ? "rgba(255,255,255,0.82)" : c.muted;
  const heroAccent = onCover ? "#ffffff" : c.accentText;
  // On a photo, an accent too dark to stand out against the shade (navy,
  // olive) becomes a white button instead.
  const heroButton: CSSProperties =
    !onCover || contrastRatio(c.accent, SCRIM_TONE) >= 3
      ? { background: c.accent, color: c.onAccent }
      : { background: "#ffffff", color: contrastRatio(c.accent, "#ffffff") >= 4.5 ? c.accent : "#0b1220" };
  // A dark template fades the photo into its own dark background. On a light
  // template that fade passes through a muddy gray, so the shade stays solid
  // and the photo ends on a clean edge.
  const scrim = template.dark
    ? `linear-gradient(180deg, rgba(4,9,16,0.45) 0%, rgba(4,9,16,0.6) 60%, ${c.bg} 100%)`
    : "linear-gradient(180deg, rgba(4,9,16,0.42) 0%, rgba(4,9,16,0.62) 100%)";
  const multiDay = new Set(events.map((event) => event.date)).size > 1;
  // The builder also blocks pointer events on the preview; this keeps keyboard
  // focus out of it.
  const inert = framed ? { tabIndex: -1, "aria-disabled": true } : {};
  const rsvpOpen = data.rsvp.enabled;
  // The template's colors as CSS variables, for the interactive parts (the
  // RSVP form) that style themselves with utility classes.
  const vars = {
    background: c.bg,
    color: c.ink,
    "--iv-bg": c.bg,
    "--iv-surface": c.surface,
    "--iv-ink": c.ink,
    "--iv-muted": c.muted,
    "--iv-line": c.line,
    "--iv-accent": c.accent,
    "--iv-on-accent": c.onAccent,
    "--iv-accent-text": c.accentText,
  } as CSSProperties;

  return (
    <div className={`${inviteFontVariables} @container relative w-full overflow-hidden ${framed ? "" : "min-h-screen"}`} style={vars}>
      {/* ── Cover ─────────────────────────────────────────────── */}
      <header className="relative" id="invite-hero">
        {coverSrc && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- member photo from the invite route or a local preview */}
            <img src={coverSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0" aria-hidden="true" style={{ background: scrim }} />
          </>
        )}
        <div className="relative mx-auto max-w-2xl px-5 pb-12 pt-14 text-center @2xl:pb-16 @2xl:pt-24">
          <p className="text-xs font-bold uppercase tracking-[0.22em]" style={{ color: heroAccent }}>
            {BRANCH_NAMES[data.retiree.branch]}
          </p>
          <h1 className="mt-4 leading-[1.05]" style={{ ...heading, color: heroInk }}>
            {data.retiree.rank && (
              <span className={`block text-base font-semibold tracking-[0.12em] @2xl:text-lg ${upper ? "uppercase" : ""}`} style={{ color: heroMuted }}>
                {data.retiree.rank}
              </span>
            )}
            <span className={`mt-1 block text-4xl font-bold @md:text-5xl @2xl:text-6xl ${upper ? "uppercase tracking-tight" : ""}`}>
              {data.retiree.name || "Your name"}
            </span>
          </h1>
          <div className="mx-auto mt-6 h-0.5 w-16" style={{ background: onCover ? "#ffffff" : c.accent }} aria-hidden="true" />
          {data.welcome && (
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed" style={{ color: heroMuted }}>
              {data.welcome}
            </p>
          )}
          {ceremony && eventIsComplete(ceremony) && (
            <div className="mx-auto mt-8 inline-flex flex-col gap-1 border-y px-2 py-3 text-sm" style={{ borderColor: onCover ? "rgba(255,255,255,0.35)" : c.line, color: heroInk }}>
              <strong className="text-base">{formatDateLong(ceremony.date)}</strong>
              {publicLocation(ceremony) && <span style={{ color: heroMuted }}>{publicLocation(ceremony)}</span>}
            </div>
          )}
          <p className="mt-8">
            <a
              href={rsvpOpen ? "#rsvp" : "#events"}
              className="inline-flex min-h-12 min-w-40 items-center justify-center rounded-xl px-7 text-base font-bold"
              style={heroButton}
              {...inert}
            >
              {rsvpOpen ? "RSVP" : "See the details"}
            </a>
          </p>
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-12 px-5 pb-14">
        {/* ── Events ─────────────────────────────────────────── */}
        <section id="events" className="scroll-mt-4">
          <SectionHead title={events.length > 1 ? "Where and when" : "The ceremony"} accentText={c.accentText} heading={heading} upper={upper} />
          {events.length === 0 ? (
            <p className="mt-4" style={{ color: c.muted }}>
              Event details are on the way.
            </p>
          ) : (
            <div className="mt-5 grid gap-4">
              {events.map((event) => (
                <EventCard key={event.id} event={event} data={data} slug={slug} pageUrl={pageUrl} colors={c} heading={heading} upper={upper} framed={framed} />
              ))}
            </div>
          )}
        </section>

        {/* ── Getting on base ────────────────────────────────── */}
        {hasBaseEvent(data) && (
          <BaseAccess data={data} today={todayIn(data.timeZone)} heading={<SectionHead title="Getting on base" accentText={c.accentText} heading={heading} upper={upper} />} />
        )}

        {/* ── RSVP ───────────────────────────────────────────── */}
        <section id="rsvp" className="scroll-mt-4">
          <SectionHead title="RSVP" accentText={c.accentText} heading={heading} upper={upper} />
          <RsvpForm data={data} slug={slug} pageUrl={pageUrl} framed={framed} />
        </section>

        {/* ── The day at a glance ────────────────────────────── */}
        {events.length > 1 && (
          <section>
            <SectionHead title="The day at a glance" accentText={c.accentText} heading={heading} upper={upper} />
            <ol className="mt-5 border-l-2 pl-5" style={{ borderColor: c.line }}>
              {events.map((event) => (
                <li key={event.id} className="relative pb-5 last:pb-0">
                  <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full" style={{ background: c.accent }} aria-hidden="true" />
                  <p className="text-sm font-bold tabular-nums" style={{ color: c.accentText }}>
                    {multiDay ? `${formatDateLong(event.date).split(",")[0]} ` : ""}
                    {formatTime(event.start, data.timeFormat)}
                  </p>
                  <p className="font-semibold">{event.name}</p>
                  {publicLocation(event) && (
                    <p className="text-sm" style={{ color: c.muted }}>
                      {publicLocation(event)}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ── Pass it on ─────────────────────────────────────── */}
        <section>
          <SectionHead title="Pass it on" accentText={c.accentText} heading={heading} upper={upper} />
          <p className="mt-3" style={{ color: c.muted }}>
            Know someone who should be here? Send them the link, or let them scan the code from your screen.
          </p>
          <div className="mt-5 flex flex-col gap-5 @md:flex-row @md:items-center">
            {qrSvg && (
              <div
                className="h-40 w-40 shrink-0 rounded-xl bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
                role="img"
                aria-label="QR code that opens this invitation"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            )}
            <div className="min-w-0">
              <p className="break-all text-base font-semibold">{pageUrl.replace(/^https:\/\/(www\.)?/, "")}</p>
              <div className="mt-3">
                {framed ? (
                  <p className="text-sm" style={{ color: c.muted }}>
                    Share and copy buttons appear here for guests.
                  </p>
                ) : (
                  <ShareActions url={pageUrl} title={`${fullName}: Retirement`} accent={c.accent} onAccent={c.onAccent} accentText={c.accentText} />
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t px-5 py-8 text-center text-sm" style={{ borderColor: c.line, color: c.muted }}>
        {data.contactEmail && (
          <p>
            Questions?{" "}
            <a href={`mailto:${data.contactEmail}`} className="font-semibold underline" style={{ color: c.accentText }} {...inert}>
              {data.contactEmail}
            </a>
          </p>
        )}
        <p className="mt-3 text-xs">
          Made with{" "}
          <a href="https://www.milvector.org" className="underline" style={{ color: c.muted }} {...inert}>
            MilVector AI
          </a>
          , free for service members
        </p>
      </footer>

      {!framed && rsvpOpen && ceremony && eventIsComplete(ceremony) && <StickyRsvp dateLine={formatDateLong(ceremony.date)} />}
    </div>
  );
}

function SectionHead({ title, accentText, heading, upper }: { title: string; accentText: string; heading: CSSProperties; upper: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-0.5 w-6 shrink-0" style={{ background: accentText }} aria-hidden="true" />
      <h2 className={`text-2xl font-bold @2xl:text-3xl ${upper ? "uppercase tracking-tight" : ""}`} style={heading}>
        {title}
      </h2>
    </div>
  );
}

function EventCard({
  event,
  data,
  slug,
  pageUrl,
  colors: c,
  heading,
  upper,
  framed,
}: {
  event: InviteEvent;
  data: InviteData;
  slug: string;
  pageUrl: string;
  colors: ReturnType<typeof inviteColors>;
  heading: CSSProperties;
  upper: boolean;
  framed: boolean;
}) {
  const directions = directionsUrl(event);
  const inert = framed ? { tabIndex: -1, "aria-disabled": true } : {};
  const where = event.addressPrivate ? event.area : event.address;
  const rows: [string, React.ReactNode][] = [];
  if (event.place || where || event.addressPrivate) {
    rows.push([
      "Location",
      <>
        {event.place && <span className="block font-semibold">{event.place}</span>}
        {where && <span className="block">{where}</span>}
        {event.addressPrivate && (
          <span className="mt-1 block text-sm" style={{ color: c.muted }}>
            Private home. The street address is shared with guests who RSVP.
          </span>
        )}
      </>,
    ]);
  }
  if (event.dressMilitary || event.dressCivilian) {
    rows.push([
      "Dress",
      <>
        {event.dressMilitary && <span className="block">Military: {event.dressMilitary}</span>}
        {event.dressCivilian && <span className="block">Civilian: {event.dressCivilian}</span>}
      </>,
    ]);
  }
  if (event.notes) rows.push(["Good to know", <span key="notes" className="whitespace-pre-line">{event.notes}</span>]);

  const buttonStyle: CSSProperties = { borderColor: c.line, color: c.ink, background: c.bg };

  return (
    <article className="rounded-2xl border p-5" style={{ background: c.surface, borderColor: c.line }}>
      <h3 className={`text-xl font-bold @2xl:text-2xl ${upper ? "uppercase tracking-tight" : ""}`} style={heading}>
        {event.name}
      </h3>
      <p className="mt-1 font-semibold" style={{ color: c.accentText }}>
        {formatDateLong(event.date)}
        <span className="block @md:inline">
          <span className="hidden @md:inline"> · </span>
          {formatTimeRange(event, data.timeFormat)}
        </span>
      </p>

      {rows.length > 0 && (
        <dl className="mt-4 grid gap-3">
          {rows.map(([label, value]) => (
            <div key={label} className="grid gap-0.5 @md:grid-cols-[7.5rem_minmax(0,1fr)] @md:gap-3">
              <dt className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: c.muted }}>
                {label}
              </dt>
              <dd className="leading-relaxed">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {event.onBase && (
        <p className="mt-4 rounded-xl border-l-4 px-4 py-3 text-sm leading-relaxed" style={{ borderColor: c.accent, background: c.bg }}>
          <strong>Aboard a military installation.</strong> Guests without a DoD ID need a visitor pass to get through the gate. See Getting on base
          below.
        </p>
      )}

      <div className="mt-5 grid grid-cols-1 gap-2 @sm:grid-cols-2">
        <a href={`/r/${slug}/calendar/${event.id}`} download className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold" style={buttonStyle} {...inert}>
          <CalendarPlus size={16} aria-hidden="true" />
          Add to calendar
        </a>
        <a
          href={googleCalendarUrl({ data, event, pageUrl })}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold"
          style={buttonStyle}
          {...inert}
        >
          <CalendarPlus size={16} aria-hidden="true" />
          Google Calendar
        </a>
        {directions && (
          <a
            href={directions}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold @sm:col-span-2"
            style={buttonStyle}
            {...inert}
          >
            <MapPin size={16} aria-hidden="true" />
            Directions
          </a>
        )}
      </div>
    </article>
  );
}
