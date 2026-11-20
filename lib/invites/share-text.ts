import { hasBaseEvent, type InviteData } from "@/lib/invites/schema";
import { ceremonyOf, eventIsComplete, formatDateLong, formatTime, publicLocation, sortEvents } from "@/lib/invites/time";

// Plain wording a host can paste anywhere: an email and a text message. Built
// from the saved invitation, which is what guests see when they open the link.

const withoutWeekday = (date: string) => formatDateLong(date).split(", ").slice(1).join(", ");

export function shareText(data: InviteData, url: string): { subject: string; email: string; sms: string } {
  const who = [data.retiree.rank, data.retiree.name].filter(Boolean).join(" ") || "the retiree";
  const events = sortEvents(data.events.filter(eventIsComplete));
  const ceremony = ceremonyOf(data);
  const when = ceremony && eventIsComplete(ceremony) ? formatDateLong(ceremony.date) : "";
  const lines = events.map((event) => {
    const where = publicLocation(event);
    return `${event.name}: ${formatDateLong(event.date)}, ${formatTime(event.start, data.timeFormat)}${where ? `, ${where}` : ""}`;
  });
  const rsvpOpen = data.rsvp.enabled;
  const deadline = rsvpOpen && data.rsvp.deadline ? formatDateLong(data.rsvp.deadline) : "";
  const passDeadline = data.base.passDeadline ? formatDateLong(data.base.passDeadline) : "";
  // A private home address goes to anyone who answers, so the host's own
  // message does not ask guests to forward the link.
  const privateHome = data.events.some((event) => event.addressPrivate);

  const ask = rsvpOpen ? (deadline ? `Please RSVP on the page by ${deadline}.` : "Please RSVP on the page.") : "";
  const onBase = events.filter((event) => event.onBase).map((event) => event.name.replace(/^the\s+/i, ""));
  const pass =
    rsvpOpen && hasBaseEvent(data) && onBase.length
      ? `The ${onBase.join(" and the ")} ${onBase.length === 1 ? "is" : "are"} aboard a military installation. Guests without a DoD ID need a visitor pass, so please answer ${passDeadline ? `by ${passDeadline}` : "early"} to leave time to arrange it.`
      : "";

  return {
    subject: `You're invited: ${who}'s retirement${when ? `, ${withoutWeekday(ceremony!.date)}` : ""}`,
    email: [
      `You're invited to the retirement of ${who}.`,
      lines.join("\n"),
      [ask, pass].filter(Boolean).join(" "),
      `Times, places, what to wear, and calendar links are all on the invitation page:\n${url}`,
      privateHome ? "" : "If you know someone who should be there, please pass the link along.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    sms: `You're invited to ${who}'s retirement${when ? ` on ${when}` : ""}.${deadline ? ` Please RSVP by ${withoutWeekday(data.rsvp.deadline)}.` : ""} Details: ${url}`,
  };
}
