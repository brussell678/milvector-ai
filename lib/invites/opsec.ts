import { redactPII } from "@/lib/redact";
import type { InviteData } from "@/lib/invites/schema";

// An invitation page is public to anyone with the link. These checks keep the
// worst mistakes off it and nudge the member on the rest. They read every
// piece of text a guest can see, so each finding can say where it is.

type Part = { where: string; text: string };

const joined = (values: (string | undefined)[]) => values.filter(Boolean).join("\n");

function parts(data: InviteData): Part[] {
  const p = data.program;
  return [
    { where: "the name and rank", text: joined([data.retiree.rank, data.retiree.name]) },
    { where: "the welcome line", text: data.welcome },
    { where: "the thank-you line", text: data.view.thankYou },
    ...data.events.map((event, index) => ({
      where: `the ${event.name || `event ${index + 1}`} details`,
      text: joined([event.name, event.place, event.address, event.area, event.dressMilitary, event.dressCivilian, event.notes]),
    })),
    { where: "the program", text: joined([p.note, ...p.items.flatMap((item) => [item.title, item.who])]) },
    { where: "the platform party", text: joined(p.people.flatMap((person) => [person.role, person.name, person.line])) },
    { where: "the biographies", text: joined(p.bios.flatMap((bio) => [bio.name, bio.role, bio.short, bio.full])) },
    { where: "the day at a glance", text: joined(data.schedule.flatMap((line) => [line.title, line.note])) },
    { where: "the visit information", text: joined(data.info.flatMap((block) => [block.title, block.body, block.linkLabel])) },
  ].filter((part) => part.text.trim());
}

/** Where a Social Security number or a labeled DoD ID appears, if anywhere. */
function idNumberIn(text: string): "ssn" | "dodId" | null {
  const { counts } = redactPII(text);
  if (counts.ssn > 0) return "ssn";
  if (/\b(EDIPI|DoD\s*ID)\b/i.test(text) && counts.dodId > 0) return "dodId";
  return null;
}

// Hard stop: a Social Security number or a labeled DoD ID never goes on the page.
export function piiProblem(data: InviteData): string | null {
  for (const part of parts(data)) {
    const found = idNumberIn(part.text);
    if (found === "ssn") return `Remove the Social Security number from ${part.where}. This page is public to anyone with the link.`;
    if (found === "dodId") return `Remove the DoD ID number from ${part.where}. This page is public to anyone with the link.`;
  }
  return null;
}

/** The same hard stop for a photo caption, which is saved on its own. */
export function captionProblem(caption: string): string | null {
  const found = idNumberIn(caption);
  if (found === "ssn") return "Remove the Social Security number from the caption. This page is public to anyone with the link.";
  if (found === "dodId") return "Remove the DoD ID number from the caption. This page is public to anyone with the link.";
  return null;
}

const CLEARANCE = /\b(TS\/SCI|top secret|secret clearance|SCI eligib|polygraph)\b/i;
const STREET = /\b\d{1,6}\s+[A-Za-z0-9.' ]{2,40}\s(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Circle|Cir|Boulevard|Blvd|Way|Place|Pl|Trail|Trl|Terrace|Ter|Loop|Highway|Hwy)\b\.?/i;

function list(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// Soft warnings shown in the builder. The member decides.
export function opsecWarnings(data: InviteData): string[] {
  const warnings: string[] = [];
  const clearance = parts(data)
    .filter((part) => CLEARANCE.test(part.text))
    .map((part) => part.where);
  if (clearance.length) {
    warnings.push(`A security clearance is mentioned in ${list(clearance)}. Leave clearance details off a public page.`);
  }
  for (const event of data.events) {
    if (!event.onBase && !event.addressPrivate && STREET.test(event.address)) {
      warnings.push(`If ${event.name || "an event"} is at a private home, turn on "Share the address only after RSVP" so the street address is not public.`);
    }
  }
  if (/\.mil\b/i.test(data.contactEmail)) {
    warnings.push("A .mil address stops working after you retire. Use a personal address for guest questions.");
  }
  return warnings;
}
