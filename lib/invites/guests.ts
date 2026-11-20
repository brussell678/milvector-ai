import type { InviteData, InviteEvent } from "@/lib/invites/schema";
import { attending, attendingBaseEvent, mealEvent, mealOptions, passPeopleOf, PIPELINE_STEPS, type GuestRecord, type PassPerson } from "@/lib/invites/rsvp";
import { eventIsComplete, sortEvents } from "@/lib/invites/time";

// The host's view of the answers: counts for chairs and food, who still needs
// a base pass, and a spreadsheet to hand the caterer.

export type Tally = { parties: number; adults: number; children: number };
export type EventCount = { event: InviteEvent; yes: Tally; maybe: Tally; no: number };

const empty = (): Tally => ({ parties: 0, adults: 0, children: 0 });

export function headcounts(data: InviteData, guests: GuestRecord[]): EventCount[] {
  return sortEvents(data.events.filter(eventIsComplete)).map((event) => {
    const yes = empty();
    const maybe = empty();
    let no = 0;
    for (const guest of guests) {
      const answer = guest.answers[event.id];
      if (!answer) continue;
      if (answer.status === "no") {
        no += 1;
        continue;
      }
      const bucket = answer.status === "yes" ? yes : maybe;
      bucket.parties += 1;
      bucket.adults += answer.adults;
      bucket.children += answer.children;
    }
    return { event, yes, maybe, no };
  });
}

export type MealTotal = { option: string; yes: number; maybe: number };

/** Meal counts for the meal event, split by sure and maybe. */
export function mealTotals(data: InviteData, guests: GuestRecord[]): { event: InviteEvent; totals: MealTotal[] } | null {
  const event = mealEvent(data);
  if (!event) return null;
  const totals = mealOptions(data).map((option) => ({ option, yes: 0, maybe: 0 }));
  for (const guest of guests) {
    const status = guest.answers[event.id]?.status;
    if (!attending(status)) continue;
    for (const total of totals) {
      const n = guest.meals[total.option] ?? 0;
      if (status === "yes") total.yes += n;
      else total.maybe += n;
    }
  }
  return { event, totals };
}

/** Guests coming aboard an installation who said their party lacks a DoD ID. */
export function needsPass(data: InviteData, guests: GuestRecord[]): GuestRecord[] {
  return guests.filter((guest) => guest.dod_id === "no" && attendingBaseEvent(data, guest.answers));
}

/** Every adult needing a pass across these guests, as the guests wrote them. */
export function passPeopleList(guests: GuestRecord[]): PassPerson[] {
  return guests.flatMap((guest) => passPeopleOf(guest));
}

/** One adult per line, "Full Name, email", ready to paste for the base. */
export function forTheBase(people: PassPerson[]): string {
  return people.map((person) => `${person.name}, ${person.email || "NO EMAIL GIVEN"}`).join("\n");
}

/** Adults the base cannot send its link to yet. */
export function missingEmails(guest: GuestRecord): number {
  return passPeopleOf(guest).filter((person) => !person.email).length;
}

export function passComplete(guest: GuestRecord): boolean {
  return PIPELINE_STEPS.every((step) => guest.pipeline[step.key]);
}

export function withText<K extends "dietary" | "message">(guests: GuestRecord[], key: K): { name: string; text: string }[] {
  return guests.filter((guest) => (guest[key] ?? "").trim()).map((guest) => ({ name: guest.name, text: (guest[key] ?? "").trim() }));
}

// ─── Spreadsheet ──────────────────────────────────────────────────────

// Guests typed these values, so a cell that starts like a formula is
// defused: spreadsheets would otherwise run "=..." as a formula.
function cell(value: string | number | boolean | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function guestsCsv(data: InviteData, guests: GuestRecord[]): string {
  const events = sortEvents(data.events.filter(eventIsComplete));
  const meals = mealEvent(data) ? mealOptions(data) : [];
  const base = data.events.some((event) => event.onBase);
  const header = [
    "Name",
    "Email",
    "Phone",
    ...events.flatMap((event) => [`${event.name}: answer`, `${event.name}: adults`, `${event.name}: children`]),
    ...meals.map((option) => `Meal: ${option}`),
    "Allergies or dietary needs",
    ...(base ? ["Every adult holds a DoD ID", "Adults needing a pass (name and email)", ...PIPELINE_STEPS.map((step) => step.label)] : []),
    "Message",
    "Answered late",
    "Added by",
    "Last updated",
  ];
  const rows = guests.map((guest) => [
    guest.name,
    guest.email ?? "",
    guest.phone ?? "",
    ...events.flatMap((event) => {
      const answer = guest.answers[event.id];
      return [answer?.status ?? "", answer ? answer.adults : "", answer ? answer.children : ""];
    }),
    ...meals.map((option) => guest.meals[option] ?? 0),
    guest.dietary ?? "",
    ...(base
      ? [
          guest.dod_id ?? "",
          passPeopleOf(guest)
            .map((person) => `${person.name} <${person.email || "no email"}>`)
            .join("; "),
          ...PIPELINE_STEPS.map((step) => (guest.pipeline[step.key] ? "yes" : "")),
        ]
      : []),
    guest.message ?? "",
    guest.late ? "yes" : "",
    guest.source === "host" ? "Host" : "Guest",
    guest.updated_at.slice(0, 10),
  ]);
  return [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

// ─── Retention ────────────────────────────────────────────────────────

export const RETENTION_DAYS = 180;
export const RETENTION_WARNING_DAYS = 14;

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Guest answers are deleted 180 days after the ceremony. The host is warned
 * in the two weeks before, so they can download the spreadsheet first.
 */
export function retention(data: InviteData, today: string): { deleteOn: string; warn: boolean } | null {
  const ceremony = data.events[0]?.date;
  if (!ceremony || !/^\d{4}-\d{2}-\d{2}$/.test(ceremony)) return null;
  const deleteOn = addDays(ceremony, RETENTION_DAYS + 1);
  return { deleteOn, warn: today >= addDays(deleteOn, -RETENTION_WARNING_DAYS) };
}
