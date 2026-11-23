import type { CardData } from "@/lib/cards/schema";

// A follow-up email to someone who shared their details on a member's card.
// Only what the draft needs reaches the model: the member's name and role,
// the contact's first name and organization, the two notes, and where they
// met. Never the contact's email or phone, and any typed into a note are
// masked first.

export type FollowUpLead = {
  name: string;
  company: string | null;
  note: string | null;
  owner_note?: string | null;
  event_name?: string | null;
  created_at: string;
};

export type FollowUpDraft = { subject: string; body: string };

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const PHONE_RE = /\+?\(?\d[\d\s().-]{6,}\d/g;

export function maskContactDetails(text: string): string {
  // Nine or more digits reads as a phone number; a year range such as
  // "2024 - 2026" (eight digits) is left alone.
  return text.replace(EMAIL_RE, "[email]").replace(PHONE_RE, (match) => ((match.match(/\d/g) ?? []).length >= 9 ? "[phone]" : match));
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

const metOn = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
};

export function promptFollowUp(card: CardData, lead: FollowUpLead): string {
  const sender = [
    `Name: ${card.name}`,
    card.title && `Title or target role: ${card.title}`,
    card.company && `Organization: ${card.company}`,
    card.headline && `Headline: ${card.headline}`,
  ]
    .filter(Boolean)
    .join("\n");
  const contact = [
    `First name: ${firstName(lead.name)}`,
    lead.company && `Organization: ${lead.company}`,
    lead.event_name && `Where they met: ${lead.event_name}`,
    `Date they exchanged details: ${metOn(lead.created_at)}`,
    lead.note && `What the contact wrote when sharing their details: ${maskContactDetails(lead.note)}`,
    lead.owner_note && `The sender's own notes about this contact: ${maskContactDetails(lead.owner_note)}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `Write a short follow-up email from a person who is moving from military service to a civilian career, to someone they recently met who shared their contact details through the sender's digital business card.

SENDER
${sender}

CONTACT
${contact}

Rules:
- 60 to 120 words in the body. Warm, direct, professional. Plain civilian English with no military jargon or acronyms.
- Open by naming where or when they met, using only the facts above.
- Use the notes when they are given: refer back to what was discussed and propose the next step they point to. With no notes, propose one simple next step, such as a 15-minute call in the next week or two.
- Never invent anything: no conversation details, shared interests, job openings, names, or promises that the notes do not state.
- No em dashes or en dashes. No filler such as "I hope this email finds you well" or "I wanted to reach out".
- Address the contact by first name. End with the sender's first name only; no title block, phone, or email (their email signature adds those).
- The subject line is short and specific, under 60 characters.

Return JSON: {"subject": "...", "body": "..."}. The body uses \\n for line breaks between the greeting, paragraphs, and sign-off.`;
}

/** Tidies the model's answer, or returns null when it is unusable. */
export function cleanFollowUp(raw: unknown): FollowUpDraft | null {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const tidy = (text: unknown, max: number) =>
    String(text ?? "")
      .replace(/\s*[\u2014\u2013]\s*/g, ", ")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, max);
  const subject = tidy(value.subject, 120).replace(/\n/g, " ");
  const body = tidy(value.body, 2000);
  if (subject.length < 3 || body.length < 20) return null;
  return { subject, body };
}
