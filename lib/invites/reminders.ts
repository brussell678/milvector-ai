import { needsPass, passComplete } from "@/lib/invites/guests";
import { attending, passPeopleOf, type GuestRecord } from "@/lib/invites/rsvp";
import type { InviteData } from "@/lib/invites/schema";
import { eventIsComplete, formatDateLong, formatTime, publicLocation, sortEvents } from "@/lib/invites/time";

// Reminders go out from the host's own email or phone. MilVector prepares
// the group, the wording, and the address list; it sends nothing.

export const REMINDER_GROUPS = [
  { id: "all", label: "Everyone who has answered" },
  { id: "attending", label: "Coming to at least one event" },
  { id: "maybe", label: "Down as maybe" },
  { id: "declined", label: "Not coming (the invitation still stands)" },
  { id: "pass", label: "Base pass not finished" },
] as const;
export type ReminderGroup = (typeof REMINDER_GROUPS)[number]["id"];

export function reminderGuests(data: InviteData, guests: GuestRecord[], group: ReminderGroup): GuestRecord[] {
  const statuses = (guest: GuestRecord) => Object.values(guest.answers).map((answer) => answer.status);
  switch (group) {
    case "attending":
      return guests.filter((guest) => statuses(guest).includes("yes"));
    case "maybe":
      return guests.filter((guest) => statuses(guest).includes("maybe"));
    case "declined":
      return guests.filter((guest) => !statuses(guest).some((status) => attending(status)));
    case "pass":
      return needsPass(data, guests).filter((guest) => !passComplete(guest));
    default:
      return guests;
  }
}

/**
 * Who the reminder goes to. For a pass reminder every adult needing a pass is
 * included, since the base writes to each of them.
 */
export function reminderEmails(guests: GuestRecord[], group: ReminderGroup): string[] {
  const all = guests.flatMap((guest) => [guest.email ?? "", ...(group === "pass" ? passPeopleOf(guest).map((person) => person.email) : [])]);
  return [...new Set(all.map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

export function reminderPhones(guests: GuestRecord[]): string[] {
  return [...new Set(guests.map((guest) => (guest.phone ?? "").trim()).filter(Boolean))];
}

export function reminderText(args: { data: InviteData; group: ReminderGroup; note: string; pageUrl: string }): { subject: string; body: string } {
  const { data, group } = args;
  const who = [data.retiree.rank, data.retiree.name].filter(Boolean).join(" ");
  const ceremony = data.events[0];
  const day = ceremony && eventIsComplete(ceremony) ? formatDateLong(ceremony.date) : "";
  const lines = sortEvents(data.events.filter(eventIsComplete)).map(
    (event) => `${event.name}: ${formatDateLong(event.date)}, ${formatTime(event.start, data.timeFormat)}${publicLocation(event) ? `, ${publicLocation(event)}` : ""}`,
  );
  const ask =
    group === "maybe"
      ? `When you know your plans, update your answer on the invitation${data.rsvp.deadline ? ` by ${formatDateLong(data.rsvp.deadline)}` : ""}.`
      : group === "declined"
        ? "If your plans have changed, you are still welcome. You can update your answer on the invitation."
        : group === "pass"
          ? "About your base pass: each adult needing a pass should watch their own inbox for the base's email and fill in its form the day it arrives."
          : "";
  const subject =
    group === "pass"
      ? `Action needed: base pass for ${who}'s retirement`
      : `Reminder: ${who}'s retirement${day ? `, ${day.split(", ").slice(1).join(", ")}` : ""}`;
  return {
    subject,
    body: [args.note.trim(), lines.join("\n"), ask, `Everything is on the invitation: ${args.pageUrl}`].filter(Boolean).join("\n\n"),
  };
}

// Email apps refuse very long links. Past this, the host copies the
// addresses and message instead of using one tap.
export const MAILTO_LIMIT = 1900;

export function reminderMailto(args: { bcc: string[]; subject: string; body: string }): string | null {
  const link = `mailto:?bcc=${encodeURIComponent(args.bcc.join(","))}&subject=${encodeURIComponent(args.subject)}&body=${encodeURIComponent(args.body)}`;
  return link.length <= MAILTO_LIMIT ? link : null;
}
