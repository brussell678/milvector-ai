import { redactPII } from "@/lib/redact";
import type { InviteData } from "@/lib/invites/schema";

// An invitation page is public to anyone with the link. These checks keep the
// worst mistakes off it and nudge the member on the rest.

const freeText = (data: InviteData) =>
  [
    data.retiree.rank,
    data.retiree.name,
    data.welcome,
    ...data.events.flatMap((event) => [event.name, event.place, event.address, event.area, event.dressMilitary, event.dressCivilian, event.notes]),
  ].join("\n");

// Hard stop: a Social Security number or a labeled DoD ID never goes on the page.
export function piiProblem(data: InviteData): string | null {
  const text = freeText(data);
  const { counts } = redactPII(text);
  if (counts.ssn > 0) return "Remove the Social Security number. This page is public to anyone with the link.";
  if (/\b(EDIPI|DoD\s*ID)\b/i.test(text) && counts.dodId > 0) return "Remove the DoD ID number. This page is public to anyone with the link.";
  return null;
}

const STREET = /\b\d{1,6}\s+[A-Za-z0-9.' ]{2,40}\s(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Circle|Cir|Boulevard|Blvd|Way|Place|Pl|Trail|Trl|Terrace|Ter|Loop|Highway|Hwy)\b\.?/i;

// Soft warnings shown in the builder. The member decides.
export function opsecWarnings(data: InviteData): string[] {
  const warnings: string[] = [];
  const text = freeText(data);
  if (/\b(TS\/SCI|top secret|secret clearance|SCI eligib|polygraph)\b/i.test(text)) {
    warnings.push("The page mentions a security clearance. Leave clearance details off a public page.");
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
