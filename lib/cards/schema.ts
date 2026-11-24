import { z } from "zod";

// The digital business card. One row in business_cards; everything a visitor
// sees lives in `data`, validated here on every save.

export const MAX_CARDS_PER_USER = 3;
export const MAX_LINKS = 8;

export const LINK_TYPES = ["linkedin", "website", "calendar", "resume", "portfolio", "github", "social", "other"] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export const LINK_TYPE_LABELS: Record<LinkType, string> = {
  linkedin: "LinkedIn",
  website: "Website",
  calendar: "Book a meeting",
  resume: "Resume",
  portfolio: "Portfolio",
  github: "GitHub",
  social: "Social profile",
  other: "Link",
};

export const CARD_STYLES = ["band", "dark", "clean"] as const;
export type CardStyle = (typeof CARD_STYLES)[number];

export const ACCENT_PRESETS = ["#1f6f54", "#1d4e89", "#7a1f2b", "#3b3f8f", "#8a5a12", "#0f172a", "#0e7490", "#6d28d9"];

// Slugs that would collide with routes or mislead a visitor.
const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "apple-pass", "auth", "card", "cards", "event", "google-pass", "help", "lead", "login",
  "milvector", "new", "official", "photo", "privacy", "security", "staff", "support", "va", "vcard", "dod", "usmc",
]);

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export function slugProblem(slug: string): string | null {
  if (!SLUG_RE.test(slug)) return "Use 3 to 40 lowercase letters, numbers, and hyphens. Start and end with a letter or number.";
  if (slug.includes("--")) return "Use single hyphens only.";
  if (RESERVED_SLUGS.has(slug)) return "That address is reserved. Pick another.";
  return null;
}

export function slugFromName(name: string, suffix: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
  return `${base || "card"}-${suffix}`;
}

// Links must be plain https. No javascript:, data:, or bare http.
export function safeHttpsUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const text = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim());

const httpsUrl = z
  .string()
  .max(300)
  .transform((v, ctx) => {
    if (!v.trim()) return "";
    const safe = safeHttpsUrl(v);
    if (!safe) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Links must be full https addresses, like https://example.com." });
      return z.NEVER;
    }
    return safe;
  });

const phone = z
  .string()
  .max(30)
  .transform((v) => v.trim())
  .refine((v) => v === "" || /^[+()\d][\d\s().+\-x]{5,29}$/.test(v), "Enter a phone number using digits, spaces, and + ( ) - only.");

const email = z
  .string()
  .max(120)
  .transform((v) => v.trim())
  .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email address.");

export const CardLinkSchema = z.object({
  type: z.enum(LINK_TYPES),
  label: text(40),
  url: httpsUrl.refine((v) => v !== "", "Each link needs an address."),
});

export const CardDataSchema = z.object({
  name: text(80).refine((v) => v.length >= 2, "Enter your name."),
  title: text(80).default(""),
  company: text(80).default(""),
  service: text(60).default(""),
  headline: text(140).default(""),
  bio: text(500).default(""),
  email: email.default(""),
  phone: phone.default(""),
  website: httpsUrl.default(""),
  location: text(80).default(""),
  links: z.array(CardLinkSchema).max(MAX_LINKS).default([]),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default(ACCENT_PRESETS[0]),
  style: z.enum(CARD_STYLES).default("band"),
  leadCapture: z.boolean().default(true),
  notifyLeads: z.boolean().default(true),
  // Show the phone number on the front of the wallet pass, under the name.
  // Off by default: the front stays name, title, and QR code, and the phone
  // and email are one tap away in the pass details either way.
  passShowPhone: z.boolean().default(false),
});

export type CardData = z.infer<typeof CardDataSchema>;
export type CardLink = z.infer<typeof CardLinkSchema>;

export const EMPTY_CARD: CardData = {
  name: "",
  title: "",
  company: "",
  service: "",
  headline: "",
  bio: "",
  email: "",
  phone: "",
  website: "",
  location: "",
  links: [],
  accent: ACCENT_PRESETS[0],
  style: "band",
  leadCapture: true,
  notifyLeads: true,
  passShowPhone: false,
};

/** A phone number as a dialable tel: target: digits and a leading +, nothing else. */
export const telDigits = (phone: string) => phone.replace(/[^\d+]/g, "");

/** A phone number for reading, the same everywhere it is shown: a US number as +1 (402) 555-0187, anything else as typed. */
export function displayPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (phone.includes("x")) return phone.trim();
  const us = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits.length === 10 && !phone.trim().startsWith("+") ? digits : null;
  return us ? `+1 (${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}` : phone.trim();
}

// Reads whatever is stored and returns a complete card, so an older or partly
// filled row never breaks the public page.
export function readCardData(raw: unknown): CardData {
  const parsed = CardDataSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = { ...EMPTY_CARD };
  for (const key of Object.keys(EMPTY_CARD) as (keyof CardData)[]) {
    const field = CardDataSchema.shape[key].safeParse(source[key]);
    if (field.success && field.data !== undefined) out[key] = field.data;
  }
  return out as CardData;
}

// Photos are resized in the browser and sent as base64: a JPEG for the page
// and contact file, a small PNG for the Apple Wallet pass.
export const PHOTO_JPEG_MAX_CHARS = 220_000;
export const PHOTO_PNG_MAX_CHARS = 320_000;

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/** A JPEG banner upload before the server normalizes it. */
export function validBannerUpload(base64: string): boolean {
  return !!base64 && base64.length <= BANNER_UPLOAD_MAX_CHARS && BASE64_RE.test(base64) && base64.startsWith("/9j/");
}

export function validPhoto(base64: string, kind: "jpeg" | "png"): boolean {
  const max = kind === "jpeg" ? PHOTO_JPEG_MAX_CHARS : PHOTO_PNG_MAX_CHARS;
  if (!base64 || base64.length > max || !BASE64_RE.test(base64)) return false;
  // Magic bytes: JPEG starts FF D8 FF, PNG starts 89 50 4E 47.
  return kind === "jpeg" ? base64.startsWith("/9j/") : base64.startsWith("iVBORw0KGgo");
}

// The banner across the top of the card: LinkedIn's banner size, so a member's
// LinkedIn banner fits with nothing cut off. Stored as JPEG base64.
export const BANNER_WIDTH = 1584;
export const BANNER_HEIGHT = 396;
export const BANNER_JPEG_MAX_CHARS = 400_000;
// What the browser may send before the server re-encodes it (it strips
// EXIF data such as a photo's GPS location and fixes the size).
export const BANNER_UPLOAD_MAX_CHARS = 1_400_000;

export const EVENT_KINDS = ["view", "save", "link", "apple", "google", "resume"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const EVENT_SOURCES = ["direct", "qr", "wallet", "nfc", "sig", "video", "print", "lock", "contact"] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export const SOURCE_LABELS: Record<EventSource, string> = {
  direct: "Shared link",
  qr: "QR code",
  wallet: "Wallet pass",
  nfc: "NFC tap",
  sig: "Email signature",
  video: "Video call background",
  print: "Printed card",
  lock: "Lock screen",
  // Someone who saved the contact, opening the card again from their phone's contacts.
  contact: "Saved contact",
};

// Event mode: contacts that arrive before `until` are tagged with the event.
export const EVENT_NAME_MAX = 80;
export const EVENT_DURATIONS = [
  { hours: 8, label: "8 hours" },
  { hours: 24, label: "1 day" },
  { hours: 48, label: "2 days" },
  { hours: 72, label: "3 days" },
] as const;

export const EventModeSchema = z.object({
  name: text(EVENT_NAME_MAX).refine((v) => v.length >= 2, "Name the event, for example Hiring Our Heroes, Camp Lejeune."),
  hours: z.number().int().refine((h) => EVENT_DURATIONS.some((d) => d.hours === h), "Pick how long event mode stays on."),
});

/** The event a card is tagging contacts with right now, or null. */
export function activeEvent(name: string | null | undefined, until: string | null | undefined, now = new Date()): { name: string; until: string } | null {
  if (!name?.trim() || !until) return null;
  const end = Date.parse(until);
  if (Number.isNaN(end) || end <= now.getTime()) return null;
  return { name: name.trim(), until: new Date(end).toISOString() };
}

// The owner's private note on a contact, and the event tag they can correct.
export const LeadUpdateSchema = z
  .object({
    ownerNote: text(500).optional(),
    eventName: text(EVENT_NAME_MAX).optional(),
  })
  .refine((v) => v.ownerNote !== undefined || v.eventName !== undefined, "Nothing to save.");

export function readSource(value: string | null | undefined): EventSource {
  return (EVENT_SOURCES as readonly string[]).includes(value ?? "") ? (value as EventSource) : "direct";
}

export const LeadSchema = z
  .object({
    name: text(80).refine((v) => v.length >= 2, "Enter your name."),
    email: email.default(""),
    phone: phone.default(""),
    company: text(80).default(""),
    note: text(300).default(""),
  })
  .refine((v) => v.email !== "" || v.phone !== "", "Add an email address or a phone number so they can reach you.");

// Black or white, whichever reads better on the accent color.
export function textOnColor(hex: string): "#ffffff" | "#0b1220" {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  return lum > 0.4 ? "#0b1220" : "#ffffff";
}

// A QR code needs a dark foreground to scan. Use the accent when it is dark
// enough, otherwise fall back to near black.
export function qrColor(hex: string): string {
  return textOnColor(hex) === "#ffffff" ? hex : "#0b1220";
}
