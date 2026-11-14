import type { CardData } from "@/lib/cards/schema";
import { redactPII } from "@/lib/redact";

// A card is public to anyone who has the link. These checks keep the worst
// mistakes off it and nudge the member on the rest.

const freeText = (card: CardData) =>
  [card.title, card.company, card.service, card.headline, card.bio, card.location, ...card.links.map((link) => link.label)].join("\n");

// Hard stop: a Social Security number or a labeled DoD ID never goes on a card.
export function piiProblem(card: CardData): string | null {
  const { counts } = redactPII(freeText(card));
  if (counts.ssn > 0) return "Remove the Social Security number. A card is public to anyone with the link.";
  if (/\b(EDIPI|DoD\s*ID)\b/i.test(freeText(card)) && counts.dodId > 0) {
    return "Remove the DoD ID number. A card is public to anyone with the link.";
  }
  return null;
}

// Soft warnings shown in the editor. The member decides.
export function opsecWarnings(card: CardData): string[] {
  const text = freeText(card);
  const warnings: string[] = [];
  if (/\b(TS\/SCI|top secret|secret clearance|SCI eligib|polygraph|\bTS\b clearance)\b/i.test(text)) {
    warnings.push("Your card mentions a security clearance. A public page is the wrong place for clearance level. Share it with a recruiter directly instead.");
  }
  if (/\b\d{1,5}\s+[A-Za-z0-9.' ]{2,30}\s(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Boulevard|Blvd|Way)\b\.?/i.test(text)) {
    warnings.push("Your card looks like it includes a street address. City and state are enough for a business card.");
  }
  if (/\b(deploy(ed|ing|ment)|currently (stationed|assigned)|duty station)\b/i.test(text)) {
    warnings.push("Your card mentions a deployment or current duty station. Leave current unit locations and movements off a public page.");
  }
  if (/\.mil\b/i.test(card.email)) {
    warnings.push("You are using a .mil email address. It goes away when you separate, so a personal address will keep working.");
  }
  return warnings;
}
