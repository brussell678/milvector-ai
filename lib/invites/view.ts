import { VIEWS, type InviteData, type InviteViewName } from "@/lib/invites/schema";
import { eventIsComplete, publicLocation, sortEvents } from "@/lib/invites/time";

// Which version of the page leads right now. The printed QR code never
// changes, so the page does: an invitation before the day, the program on the
// day, a thank-you afterward. Decided by the clock at the venue, so it needs
// nothing from the host and cannot fail to switch. Nothing is lost between
// views; only the order and the wording change.

function venueClock(timeZone: string, now: Date): { date: string; hour: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
  } catch {
    return { date: now.toISOString().slice(0, 10), hour: now.getUTCHours() };
  }
}

function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * "The day" runs from midnight on the ceremony date until 0600 after the last
 * event, so a party that runs late, or one held the next day, still counts.
 * A view asked for in the address (?view=) or pinned by the host wins.
 */
export function resolveView(data: InviteData, now: Date = new Date(), requested?: string | null): InviteViewName {
  if (requested && (VIEWS as readonly string[]).includes(requested)) return requested as InviteViewName;
  if (data.view.override !== "auto") return data.view.override;
  const events = data.events.filter(eventIsComplete);
  const ceremony = data.events[0];
  if (!ceremony || !eventIsComplete(ceremony)) return "invite";
  const last = events.map((event) => event.date).sort().slice(-1)[0] ?? ceremony.date;
  const { date, hour } = venueClock(data.timeZone, now);
  if (date < ceremony.date) return "invite";
  if (date <= last) return "eventday";
  if (date === nextDay(last) && hour < 6) return "eventday";
  return "memories";
}

/** A YouTube video id from the usual link shapes, or null. */
export function youtubeId(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    let id = "";
    if (host === "youtu.be") id = u.pathname.slice(1);
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") id = u.searchParams.get("v") ?? "";
      else {
        const m = /^\/(live|embed|shorts)\/([^/?#]+)/.exec(u.pathname);
        id = m?.[2] ?? "";
      }
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export type GlanceLine = { key: string; date: string; time: string; title: string; detail: string };

/** "The day at a glance": the events themselves plus the host's extra lines. */
export function dayAtAGlance(data: InviteData): GlanceLine[] {
  const ceremonyDate = data.events[0]?.date ?? "";
  const events = sortEvents(data.events.filter(eventIsComplete)).map((event) => ({
    key: event.id,
    date: event.date,
    time: event.start,
    title: event.name,
    detail: publicLocation(event),
  }));
  const extras = data.schedule
    .map((line) => ({ key: line.id, date: line.date || ceremonyDate, time: line.time, title: line.title, detail: line.note }))
    .filter((line) => /^\d{4}-\d{2}-\d{2}$/.test(line.date));
  return [...events, ...extras].sort((a, b) => `${a.date}T${a.time || "00:00"}`.localeCompare(`${b.date}T${b.time || "00:00"}`));
}

/**
 * The content as guests see it once saved. Rows left blank in the builder
 * drop out on save, so the live preview leaves them out too.
 */
export function filledIn(data: InviteData): InviteData {
  const p = data.program;
  return {
    ...data,
    program: {
      ...p,
      items: p.items.filter((item) => item.title.trim()),
      people: p.people.filter((person) => person.name.trim()),
      bios: p.bios.filter((bio) => bio.name.trim() && (bio.short.trim() || bio.full.trim())),
    },
    schedule: data.schedule.filter((line) => line.title.trim()),
    info: data.info.filter((block) => block.title.trim()),
  };
}
