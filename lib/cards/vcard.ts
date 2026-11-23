import type { CardData } from "@/lib/cards/schema";

// vCard 3.0, the version every phone contact app imports cleanly.

const escape = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");

// Lines longer than 75 octets are folded with CRLF plus one space (RFC 2426).
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Do not split a multi-byte character.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = 74;
  }
  return parts.join("\r\n ");
}

// Best effort split for the structured N field. FN carries the full name.
function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { family: "", given: parts[0], middle: "" };
  return { family: parts[parts.length - 1], given: parts[0], middle: parts.slice(1, -1).join(" ") };
}

/**
 * The day a visitor saved the contact, from their own phone (YYYY-MM-DD), as
 * "November 23, 2026"; null when missing, malformed, or more than two days
 * from the server's date.
 */
export function savedOnLabel(value: string | null | undefined, now = new Date()): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (day.getUTCDate() !== Number(match[3]) || Math.abs(day.getTime() - now.getTime()) > 2 * 86_400_000) return null;
  return day.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// `cardUrl` is the link back to the card. It goes first among the contact's
// links, labeled, and again in the note with the day it was saved, so after
// a career fair of scans each saved contact says where it came from.
export function buildVCard(card: CardData, cardUrl: string, photoJpegBase64?: string | null, savedOn?: string | null): string {
  const n = splitName(card.name);
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${escape(n.family)};${escape(n.given)};${escape(n.middle)};;`,
    `FN:${escape(card.name)}`,
  ];
  if (card.company) lines.push(`ORG:${escape(card.company)}`);
  if (card.title) lines.push(`TITLE:${escape(card.title)}`);
  if (card.phone) lines.push(`TEL;TYPE=CELL,VOICE:${escape(card.phone)}`);
  if (card.email) lines.push(`EMAIL;TYPE=INTERNET,WORK:${escape(card.email)}`);
  if (card.location) lines.push(`ADR;TYPE=WORK:;;;${escape(card.location)};;;`);
  // The card link first and preferred. The item1 group with X-ABLabel is how
  // iPhone and Google Contacts show a custom label ("Digital card").
  lines.push(`item1.URL;TYPE=pref:${escape(cardUrl)}`, "item1.X-ABLabel:Digital card");
  if (card.website) lines.push(`URL:${escape(card.website)}`);
  for (const link of card.links) {
    lines.push(`URL;TYPE=${link.type === "linkedin" ? "LinkedIn" : "Other"}:${escape(link.url)}`);
  }
  const first = card.name.trim().split(/\s+/)[0] ?? "";
  const origin = `${savedOn ? `Saved ${savedOn} from` : "From"} ${first ? `${first}'s` : "their"} digital card: ${cardUrl}`;
  const about = [card.headline, card.service].filter(Boolean).join(" | ");
  lines.push(`NOTE:${escape([origin, about].filter(Boolean).join("\n"))}`);
  if (photoJpegBase64) lines.push(`PHOTO;ENCODING=b;TYPE=JPEG:${photoJpegBase64}`);
  lines.push("END:VCARD");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function vcardFilename(name: string): string {
  const safe = name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${safe || "contact"}.vcf`;
}
