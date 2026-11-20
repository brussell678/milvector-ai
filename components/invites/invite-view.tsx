import type { CSSProperties, ReactNode } from "react";
import { CalendarPlus, MapPin } from "lucide-react";
import { BaseAccess } from "@/components/invites/base-access";
import { headingFamily, inviteFontVariables } from "@/components/invites/fonts";
import { MessageForm, RsvpForm } from "@/components/invites/rsvp-form";
import { GlanceSection, InfoSection, PhotosSection, ProgramSection, SectionHead, hasProgram, type PagePhoto, type SectionStyle } from "@/components/invites/sections";
import { ShareActions } from "@/components/invites/share-actions";
import { StickyAction } from "@/components/invites/sticky-rsvp";
import { StreamPlayer } from "@/components/invites/stream-player";
import { YourAnswer } from "@/components/invites/your-answer";
import { BRANCH_NAMES, hasBaseEvent, type InviteData, type InviteEvent, type InviteViewName } from "@/lib/invites/schema";
import { contrastRatio, inviteColors, readTemplate } from "@/lib/invites/templates";
import { ceremonyOf, directionsUrl, eventIsComplete, formatDateLong, formatTimeRange, googleCalendarUrl, publicLocation, sortEvents } from "@/lib/invites/time";
import { filledIn } from "@/lib/invites/view";

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
//
// Three views, one address: an invitation before the day, the program on the
// day, a thank-you afterward. The views reorder and reword the same sections.

type Props = {
  data: InviteData;
  slug: string;
  pageUrl: string;
  coverSrc: string | null;
  qrSvg?: string | null;
  view?: InviteViewName;
  photos?: PagePhoto[];
  // In the builder: no full-screen height, and links that would leave the
  // editor are inert.
  framed?: boolean;
};

export function InviteView({ data: given, slug, pageUrl, coverSrc, qrSvg, view = "invite", photos = [], framed = false }: Props) {
  const data = filledIn(given);
  const template = readTemplate(data.template);
  const c = inviteColors(template, data.accent);
  const heading: CSSProperties = { fontFamily: headingFamily(template.heading) };
  const upper = template.heading !== "serif";
  const style: SectionStyle = { colors: c, heading, upper };
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
  // The builder also blocks pointer events on the preview; this keeps keyboard
  // focus out of it.
  const inert = framed ? { tabIndex: -1, "aria-disabled": true } : {};
  const rsvpOpen = data.rsvp.enabled;
  const messagesOpen = data.rsvp.message;
  const program = hasProgram(data);
  const stream = data.sections.stream && !!data.program.streamUrl;
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

  // The one thing each view asks of a guest.
  const action =
    view === "invite"
      ? rsvpOpen
        ? { label: "RSVP", target: "rsvp" }
        : { label: "See the details", target: "events" }
      : view === "eventday"
        ? program && data.program.items.length > 0
          ? { label: "See the program", target: "program" }
          : { label: "Where to be", target: "events" }
        : messagesOpen
          ? { label: "Leave a message", target: "rsvp" }
          : photos.length && data.sections.photos
            ? { label: "See the photos", target: "photos" }
            : { label: "See the day", target: "events" };

  // ── Sections, each built once and placed by view ──
  const eventsTitle = view === "invite" ? (events.length > 1 ? "Where and when" : "The ceremony") : view === "eventday" ? "Where to be" : "The day";
  const eventsSection = (
    <section id="events" className="scroll-mt-4" key="events">
      <SectionHead title={eventsTitle} style={style} />
      {events.length === 0 ? (
        <p className="mt-4" style={{ color: c.muted }}>
          Event details are on the way.
        </p>
      ) : (
        <div className="mt-5 grid gap-4">
          {events.map((event) => (
            <EventCard key={event.id} event={event} data={data} slug={slug} pageUrl={pageUrl} colors={c} heading={heading} upper={upper} framed={framed} view={view} />
          ))}
        </div>
      )}
    </section>
  );
  const baseSection = hasBaseEvent(data) ? (
    <BaseAccess
      key="base"
      data={data}
      today={todayIn(data.timeZone)}
      dayOf={view === "eventday"}
      heading={<SectionHead title={view === "eventday" ? "Getting through the gate" : "Getting on base"} style={style} />}
    />
  ) : null;
  const rsvpSection =
    view === "invite" ? (
      <section id="rsvp" className="scroll-mt-4" key="rsvp">
        <SectionHead title="RSVP" style={style} />
        <RsvpForm data={data} slug={slug} pageUrl={pageUrl} framed={framed} />
      </section>
    ) : messagesOpen ? (
      <section id="rsvp" className="scroll-mt-4" key="rsvp">
        <SectionHead title="Leave a message" style={style} />
        <p className="mt-3 leading-relaxed" style={{ color: c.muted }}>
          {view === "eventday" ? "RSVPs are closed. A message still reaches " : "The day has come and gone. A message still reaches "}
          {data.retiree.name.split(" ")[0] || "the retiree"}.
        </p>
        <MessageForm data={data} slug={slug} framed={framed} />
      </section>
    ) : null;
  const programSection = <ProgramSection key="program" data={data} view={view} style={style} />;
  const streamSection = stream ? <StreamPlayer key="stream" url={data.program.streamUrl} view={view} framed={framed} heading={<SectionHead title={view === "invite" ? "Watching from somewhere else" : view === "eventday" ? "Watch it live" : "Watch the recording"} style={style} />} /> : null;
  const glanceSection = data.sections.schedule ? <GlanceSection key="glance" data={data} style={style} /> : null;
  const infoSection = <InfoSection key="info" data={data} style={style} framed={framed} />;
  const photosSection = <PhotosSection key="photos" data={data} photos={photos} style={style} framed={framed} />;
  const shareSection = data.sections.share ? (
    <section key="share">
      <SectionHead title="Pass it on" style={style} />
      <p className="mt-3" style={{ color: c.muted }}>
        Know someone who should see this? Send them the link, or let them scan the code from your screen.
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
  ) : null;

  const order: ReactNode[] =
    view === "invite"
      ? [eventsSection, baseSection, rsvpSection, glanceSection, infoSection, programSection, streamSection, photosSection, shareSection]
      : view === "eventday"
        ? [framed ? null : <YourAnswer key="your-answer" data={data} slug={slug} />, programSection, streamSection, eventsSection, baseSection, glanceSection, infoSection, rsvpSection, photosSection, shareSection]
        : // Afterward the getting-there logistics are history and drop off.
          [rsvpSection, programSection, streamSection, photosSection, eventsSection, shareSection];

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
          {(view === "memories" ? data.view.thankYou : data.welcome) && (
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed" style={{ color: heroMuted }}>
              {view === "memories" ? data.view.thankYou : data.welcome}
            </p>
          )}
          {ceremony && eventIsComplete(ceremony) && (
            <div className="mx-auto mt-8 inline-flex flex-col gap-1 border-y px-2 py-3 text-sm" style={{ borderColor: onCover ? "rgba(255,255,255,0.35)" : c.line, color: heroInk }}>
              <strong className="text-base">{view === "eventday" ? `Today, ${formatDateLong(ceremony.date)}` : formatDateLong(ceremony.date)}</strong>
              {publicLocation(ceremony) && <span style={{ color: heroMuted }}>{publicLocation(ceremony)}</span>}
            </div>
          )}
          <p className="mt-8">
            <a href={`#${action.target}`} className="inline-flex min-h-12 min-w-40 items-center justify-center rounded-xl px-7 text-base font-bold" style={heroButton} {...inert}>
              {action.label}
            </a>
          </p>
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-12 px-5 pb-14">{order.filter(Boolean)}</main>

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

      {!framed && ceremony && eventIsComplete(ceremony) && (
        <StickyAction
          dateLine={formatDateLong(ceremony.date)}
          label={action.label}
          target={action.target}
          slug={slug}
          answeredLabel={view === "invite" && rsvpOpen ? "Your answer" : undefined}
        />
      )}
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
  view,
}: {
  event: InviteEvent;
  data: InviteData;
  slug: string;
  pageUrl: string;
  colors: ReturnType<typeof inviteColors>;
  heading: CSSProperties;
  upper: boolean;
  framed: boolean;
  view: InviteViewName;
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
        {event.addressPrivate && view !== "memories" && (
          <span className="mt-1 block text-sm" style={{ color: c.muted }}>
            {view === "eventday"
              ? "Private home. Guests who answered have the street address in their confirmation, and at the top of this page when they open their personal link."
              : "Private home. The street address is shared with guests who RSVP."}
          </span>
        )}
      </>,
    ]);
  }
  if ((event.dressMilitary || event.dressCivilian) && view !== "memories") {
    rows.push([
      "Dress",
      <>
        {event.dressMilitary && <span className="block">Military: {event.dressMilitary}</span>}
        {event.dressCivilian && <span className="block">Civilian: {event.dressCivilian}</span>}
      </>,
    ]);
  }
  if (event.notes && view !== "memories") rows.push(["Good to know", <span key="notes" className="whitespace-pre-line">{event.notes}</span>]);

  const buttonStyle: CSSProperties = { borderColor: c.line, color: c.ink, background: c.bg };
  // Calendar buttons only before the day; directions until it is over.
  const showCalendar = view === "invite";
  const showDirections = view !== "memories" && !!directions;

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

      {event.onBase && view !== "memories" && (
        <p className="mt-4 rounded-xl border-l-4 px-4 py-3 text-sm leading-relaxed" style={{ borderColor: c.accent, background: c.bg }}>
          <strong>Aboard a military installation.</strong> Guests without a DoD ID need a visitor pass to get through the gate. See{" "}
          {view === "eventday" ? "Getting through the gate" : "Getting on base"} below.
        </p>
      )}

      {(showCalendar || showDirections) && (
        <div className="mt-5 grid grid-cols-1 gap-2 @sm:grid-cols-2">
          {showCalendar && (
            <>
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
            </>
          )}
          {showDirections && (
            <a
              href={directions!}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold ${showCalendar ? "@sm:col-span-2" : ""}`}
              style={buttonStyle}
              {...inert}
            >
              <MapPin size={16} aria-hidden="true" />
              Directions
            </a>
          )}
        </div>
      )}
    </article>
  );
}
