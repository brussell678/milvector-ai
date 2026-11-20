import type { InviteData, InviteEvent } from "@/lib/invites/schema";

// Dates, times, and calendar files for invitation events. Event times are wall
// clock times at the venue, in the invitation's time zone. Calendar files carry
// UTC so every phone shows the right local time, wherever the guest is.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

/** "Friday, 6 November 2026", the day-month-year order used across the services. */
export function formatDateLong(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const { y, m, d } = parts(date);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAYS[weekday]}, ${d} ${MONTHS[m - 1]} ${y}`;
}

/** "6 November" */
export function formatDateShort(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const { m, d } = parts(date);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "1000" in military time, or "10:00 AM". */
export function formatTime(time: string, format: InviteData["timeFormat"]): string {
  if (!/^\d{2}:\d{2}$/.test(time)) return "";
  const [h, min] = time.split(":").map(Number);
  if (format === "24h") return `${String(h).padStart(2, "0")}${String(min).padStart(2, "0")}`;
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(min).padStart(2, "0")} ${suffix}`;
}

/** "1000 until 1130", or "10:00 AM to 11:30 AM", or just the start. */
export function formatTimeRange(event: Pick<InviteEvent, "start" | "end">, format: InviteData["timeFormat"]): string {
  const start = formatTime(event.start, format);
  if (!event.end) return start;
  return `${start} ${format === "24h" ? "until" : "to"} ${formatTime(event.end, format)}`;
}

/** Events in the order they happen. */
export function sortEvents<T extends Pick<InviteEvent, "date" | "start">>(events: T[]): T[] {
  return [...events].sort((a, b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`));
}

/** The ceremony is always the first event the member entered. */
export function ceremonyOf(data: InviteData): InviteEvent | null {
  return data.events[0] ?? null;
}

// Offset of a time zone from UTC at a given instant, in milliseconds.
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const fields = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(fields.find((f) => f.type === type)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - utcMs;
}

/** The UTC instant for a wall clock date and time in a time zone. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const { y, m, d } = parts(date);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = zoneOffsetMs(guess, timeZone);
  let utc = guess - first;
  // Near a daylight saving change the offset at the answer can differ from
  // the offset at the guess. One correction settles it.
  const second = zoneOffsetMs(utc, timeZone);
  if (second !== first) utc = guess - second;
  return new Date(utc);
}

/**
 * Start and end instants. With no end time the calendar entry runs one hour.
 * An end at or before the start runs past midnight into the next day.
 */
export function eventWindow(event: InviteEvent, timeZone: string): { start: Date; end: Date } {
  const start = zonedToUtc(event.date, event.start, timeZone);
  if (!event.end) return { start, end: new Date(start.getTime() + 60 * 60 * 1000) };
  let end = zonedToUtc(event.date, event.end, timeZone);
  if (end.getTime() <= start.getTime()) {
    const next = new Date(Date.UTC(parts(event.date).y, parts(event.date).m - 1, parts(event.date).d + 1)).toISOString().slice(0, 10);
    end = zonedToUtc(next, event.end, timeZone);
  }
  return { start, end };
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Where an event is, as a guest may see it before they RSVP. */
export function publicLocation(event: InviteEvent): string {
  const where = event.addressPrivate ? event.area : event.address;
  return [event.place, where].filter(Boolean).join(", ");
}

function retireeLine(data: InviteData): string {
  return [data.retiree.rank, data.retiree.name].filter(Boolean).join(" ");
}

function dressLine(event: InviteEvent): string {
  const parts = [event.dressMilitary && `Military: ${event.dressMilitary}`, event.dressCivilian && `Civilian: ${event.dressCivilian}`].filter(Boolean);
  return parts.length ? `Dress. ${parts.join(". ")}.` : "";
}

// Where the calendar entry says the event is. A guest who answered can be
// given the private street address; everyone else gets the town.
function calendarLocation(event: InviteEvent, privateAddress?: string): string {
  if (event.addressPrivate && privateAddress) return [event.place, privateAddress].filter(Boolean).join(", ");
  return publicLocation(event);
}

function calendarDetails(data: InviteData, event: InviteEvent, pageUrl: string, privateAddress?: string): string {
  return [
    `${event.name} for ${retireeLine(data)}.`,
    dressLine(event),
    event.addressPrivate
      ? privateAddress
        ? "A private home. Please do not share the address publicly."
        : "The street address is a private home. It is shared with guests who RSVP."
      : "",
    event.notes,
    `Details: ${pageUrl}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function escapeIcs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Lines longer than 75 bytes are folded onto continuation lines starting with
// a space. Folding by bytes keeps multi-byte characters intact.
function foldLine(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  const encoder = new TextEncoder();
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

/**
 * A calendar file for one event. Carries a private street address only when
 * one is passed in, which the calendar route does for a guest's own link.
 */
export function buildIcs(args: { data: InviteData; event: InviteEvent; slug: string; pageUrl: string; now?: Date; privateAddress?: string }): string {
  const { data, event } = args;
  const location = calendarLocation(event, args.privateAddress);
  const { start, end } = eventWindow(event, data.timeZone);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MilVector AI//Retirement Invitation//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${args.slug}-${event.id}@milvector.org`,
    `DTSTAMP:${stamp(args.now ?? new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeIcs(`${retireeLine(data)}: ${event.name}`)}`,
    location ? `LOCATION:${escapeIcs(location)}` : "",
    `DESCRIPTION:${escapeIcs(calendarDetails(data, event, args.pageUrl, args.privateAddress))}`,
    `URL:${args.pageUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** Android phones do not reliably open calendar files, so offer Google Calendar too. */
export function googleCalendarUrl(args: { data: InviteData; event: InviteEvent; pageUrl: string; privateAddress?: string }): string {
  const { start, end } = eventWindow(args.event, args.data.timeZone);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${retireeLine(args.data)}: ${args.event.name}`,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: calendarDetails(args.data, args.event, args.pageUrl, args.privateAddress),
  });
  const location = calendarLocation(args.event, args.privateAddress);
  if (location) params.set("location", location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Directions, only when the street address is public. */
export function directionsUrl(event: InviteEvent): string | null {
  if (event.addressPrivate || !event.address) return null;
  const query = [event.place, event.address].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Whether an event has the date and time a guest needs. */
export function eventIsComplete(event: InviteEvent): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(event.date) && /^\d{2}:\d{2}$/.test(event.start);
}
