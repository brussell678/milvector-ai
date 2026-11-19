import { z } from "zod";
import { SLUG_RE } from "@/lib/cards/schema";
import { TEMPLATE_IDS } from "@/lib/invites/templates";

// A retirement invitation. One row in retirement_invites; everything a guest
// sees lives in `data`, validated here on every save. Street addresses marked
// "share only after RSVP" are split out into `private_data` before saving and
// never travel to a guest's browser until they RSVP.

export const MAX_EVENTS = 3;

export const BRANCHES = ["USMC", "Army", "Navy", "Air Force", "Coast Guard", "Space Force"] as const;
export type Branch = (typeof BRANCHES)[number];

export const BRANCH_NAMES: Record<Branch, string> = {
  USMC: "United States Marine Corps",
  Army: "United States Army",
  Navy: "United States Navy",
  "Air Force": "United States Air Force",
  "Coast Guard": "United States Coast Guard",
  "Space Force": "United States Space Force",
};

export const DEFAULT_WELCOME = "After a career of service, you are invited to join us in marking this retirement.";

// Time zones offered in the builder. Covers the US and the places the
// military most often holds ceremonies overseas.
export const TIME_ZONES: { id: string; label: string }[] = [
  { id: "America/New_York", label: "Eastern" },
  { id: "America/Chicago", label: "Central" },
  { id: "America/Denver", label: "Mountain" },
  { id: "America/Phoenix", label: "Arizona" },
  { id: "America/Los_Angeles", label: "Pacific" },
  { id: "America/Anchorage", label: "Alaska" },
  { id: "Pacific/Honolulu", label: "Hawaii" },
  { id: "Pacific/Guam", label: "Guam" },
  { id: "Asia/Tokyo", label: "Japan and Okinawa" },
  { id: "Asia/Seoul", label: "Korea" },
  { id: "Europe/London", label: "United Kingdom" },
  { id: "Europe/Berlin", label: "Germany" },
  { id: "Europe/Rome", label: "Italy" },
  { id: "Europe/Madrid", label: "Spain" },
  { id: "Asia/Bahrain", label: "Bahrain" },
];

export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const text = (max: number) =>
  z
    .string()
    .max(max, `Keep this under ${max} characters.`)
    .transform((v) => v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim());

const email = z
  .string()
  .max(120)
  .transform((v) => v.trim())
  .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email address for guest questions.");

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date for each event.")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && v >= "2020-01-01" && v <= "2100-12-31";
  }, "Pick a real date for each event.");

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Set a start time for each event.");

// A date that may be left blank, such as an RSVP deadline.
const optionalDate = (message: string) =>
  z
    .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, message)])
    .default("")
    .refine((v) => v === "" || (!Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v), message);

export const MAX_MEAL_OPTIONS = 6;

// What the RSVP form asks. Meal choices are off unless the host wants counts.
export const RsvpSettingsSchema = z
  .object({
    enabled: z.boolean().default(true),
    deadline: optionalDate("Pick a real RSVP date."),
    dietary: z.boolean().default(true),
    message: z.boolean().default(true),
    meals: z
      .object({
        enabled: z.boolean().default(false),
        // The event the meal is served at
        eventId: z.string().max(12).default(""),
        // Blank rows the host added but never filled are dropped on save.
        options: z
          .array(text(40))
          .max(MAX_MEAL_OPTIONS, `Offer up to ${MAX_MEAL_OPTIONS} meal choices.`)
          .transform((list) => list.filter((option) => option.length > 0))
          .default([]),
      })
      .default({}),
  })
  .default({});

// Instructions for guests who need a visitor pass. Shown only when an event is
// aboard an installation. MilVector never asks guests for an SSN or birth date.
export const BaseAccessSchema = z
  .object({
    // The date the host advertises. Set it before the base's real cutoff.
    passDeadline: optionalDate("Pick a real date for the pass deadline."),
    gate: text(400).default(""),
    bring: text(400).default(""),
    pickup: text(400).default(""),
  })
  .default({});

export const InviteEventSchema = z.object({
  id: z.string().regex(/^[a-z0-9]{4,12}$/),
  name: text(60).refine((v) => v.length >= 2, "Give each event a name."),
  date: isoDate,
  start: clock,
  // Optional. An end at or before the start means the event runs past midnight.
  end: z.union([z.literal(""), clock]).default(""),
  place: text(100).default(""),
  address: text(200).default(""),
  // Shown to everyone when the street address is private, e.g. "North Topsail, NC"
  area: text(80).default(""),
  addressPrivate: z.boolean().default(false),
  onBase: z.boolean().default(false),
  dressMilitary: text(120).default(""),
  dressCivilian: text(120).default(""),
  notes: text(600).default(""),
});

export const InviteDataSchema = z
  .object({
    retiree: z.object({
      rank: text(40).default(""),
      name: text(80).refine((v) => v.length >= 2, "Enter the retiree's name."),
      branch: z.enum(BRANCHES).default("USMC"),
    }),
    welcome: text(300).default(DEFAULT_WELCOME),
    template: z.enum(TEMPLATE_IDS).default("dress-blues"),
    // Empty means the template's own accent
    accent: z.union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/)]).default(""),
    timeFormat: z.enum(["24h", "12h"]).default("24h"),
    timeZone: z.string().max(60).refine(isValidTimeZone, "Pick a time zone.").default("America/New_York"),
    events: z.array(InviteEventSchema).min(1, "Add the ceremony.").max(MAX_EVENTS, `An invitation can have up to ${MAX_EVENTS} events.`),
    contactEmail: email.default(""),
    rsvp: RsvpSettingsSchema,
    base: BaseAccessSchema,
  })
  .superRefine((value, ctx) => {
    const ids = value.events.map((event) => event.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Two events share an id.", path: ["events"] });
    const meals = value.rsvp.meals;
    if (meals.enabled) {
      if (!ids.includes(meals.eventId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pick which event serves the meal, or turn meal choices off.", path: ["rsvp", "meals", "eventId"] });
      }
      if (meals.options.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Name at least one meal choice, or turn meal choices off.", path: ["rsvp", "meals", "options"] });
      }
      const lower = meals.options.map((option) => option.toLowerCase());
      if (new Set(lower).size !== lower.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Two meal choices have the same name.", path: ["rsvp", "meals", "options"] });
      }
    }
  });

export type RsvpSettings = z.infer<typeof RsvpSettingsSchema>;
export type BaseAccess = z.infer<typeof BaseAccessSchema>;
export const DEFAULT_RSVP: RsvpSettings = RsvpSettingsSchema.parse(undefined);
export const DEFAULT_BASE: BaseAccess = BaseAccessSchema.parse(undefined);

export type InviteData = z.infer<typeof InviteDataSchema>;
export type InviteEvent = z.infer<typeof InviteEventSchema>;
export type InvitePrivate = { addresses: Record<string, string> };

export function newEventId(): string {
  return Math.random().toString(36).slice(2, 10).padEnd(6, "0");
}

export function blankEvent(name = ""): InviteEvent {
  return {
    id: newEventId(),
    name,
    date: "",
    start: "",
    end: "",
    place: "",
    address: "",
    area: "",
    addressPrivate: false,
    onBase: false,
    dressMilitary: "",
    dressCivilian: "",
    notes: "",
  };
}

export function starterInvite(defaults: { name?: string; rank?: string; branch?: string; ceremonyDate?: string | null; email?: string; timeZone?: string }): InviteData {
  const ceremony = blankEvent("Retirement Ceremony");
  ceremony.date = defaults.ceremonyDate ?? "";
  ceremony.start = "10:00";
  ceremony.onBase = true;
  return {
    retiree: {
      rank: defaults.rank ?? "",
      name: defaults.name ?? "",
      branch: (BRANCHES as readonly string[]).includes(defaults.branch ?? "") ? (defaults.branch as (typeof BRANCHES)[number]) : "USMC",
    },
    welcome: DEFAULT_WELCOME,
    template: "dress-blues",
    accent: "",
    timeFormat: "24h",
    timeZone: defaults.timeZone && isValidTimeZone(defaults.timeZone) ? defaults.timeZone : "America/New_York",
    events: [ceremony],
    contactEmail: defaults.email ?? "",
    rsvp: DEFAULT_RSVP,
    base: DEFAULT_BASE,
  };
}

/** Events aboard an installation, where guests without a DoD ID need a pass. */
export function hasBaseEvent(data: Pick<InviteData, "events">): boolean {
  return data.events.some((event) => event.onBase);
}

// Reads whatever is stored and returns a usable invitation, so an older or
// partly filled row never breaks the guest page. Events that do not parse are
// dropped rather than shown half-formed.
export function readInviteData(raw: unknown): InviteData {
  const parsed = InviteDataSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const fallback = starterInvite({});
  const pick = <S extends z.ZodTypeAny>(schema: S, value: unknown, otherwise: z.output<S>): z.output<S> => {
    const result = schema.safeParse(value);
    return result.success ? result.data : otherwise;
  };
  const shape = InviteDataSchema.innerType().shape;
  const events = Array.isArray(source.events)
    ? source.events.map((event) => InviteEventSchema.safeParse(event)).flatMap((result) => (result.success ? [result.data] : []))
    : [];
  return {
    retiree: pick(shape.retiree, source.retiree, { ...fallback.retiree, name: "" }),
    welcome: pick(shape.welcome, source.welcome, fallback.welcome),
    template: pick(shape.template, source.template, fallback.template),
    accent: pick(shape.accent, source.accent, fallback.accent),
    timeFormat: pick(shape.timeFormat, source.timeFormat, fallback.timeFormat),
    timeZone: pick(shape.timeZone, source.timeZone, fallback.timeZone),
    events: events.slice(0, MAX_EVENTS),
    contactEmail: pick(shape.contactEmail, source.contactEmail, ""),
    rsvp: pick(shape.rsvp, source.rsvp, DEFAULT_RSVP),
    base: pick(shape.base, source.base, DEFAULT_BASE),
  };
}

// Splits private street addresses out of the invitation before it is saved.
export function splitPrivate(data: InviteData): { publicData: InviteData; privateData: InvitePrivate } {
  const addresses: Record<string, string> = {};
  const events = data.events.map((event) => {
    if (!event.addressPrivate) return event;
    if (event.address) addresses[event.id] = event.address;
    return { ...event, address: "" };
  });
  return { publicData: { ...data, events }, privateData: { addresses } };
}

// Puts private addresses back for the owner's editor.
export function mergePrivate(data: InviteData, raw: unknown): InviteData {
  const addresses = readPrivate(raw).addresses;
  return { ...data, events: data.events.map((event) => (event.addressPrivate ? { ...event, address: addresses[event.id] ?? "" } : event)) };
}

export function readPrivate(raw: unknown): InvitePrivate {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const addresses: Record<string, string> = {};
  if (source.addresses && typeof source.addresses === "object") {
    for (const [id, value] of Object.entries(source.addresses as Record<string, unknown>)) {
      if (typeof value === "string" && /^[a-z0-9]{4,12}$/.test(id)) addresses[id] = value.slice(0, 200);
    }
  }
  return { addresses };
}

// ─── Page address ─────────────────────────────────────────────────────

// Words that would collide with routes or mislead a guest.
const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "auth", "calendar", "cover", "rsvp", "login", "help", "new", "official", "milvector",
  "privacy", "security", "staff", "support", "dod", "usmc", "army", "navy", "usaf", "uscg", "ussf", "va", "retirement",
]);

export function inviteSlugProblem(slug: string): string | null {
  if (!SLUG_RE.test(slug)) return "Use 3 to 40 lowercase letters, numbers, and hyphens. Start and end with a letter or number.";
  if (slug.includes("--")) return "Use single hyphens only.";
  if (RESERVED_SLUGS.has(slug)) return "That address is reserved. Pick another.";
  return null;
}

// "Jordan A. Reyes" becomes "reyes-retirement-4f2a". The random tail keeps a
// page from being found by guessing a name; the member can shorten it.
export function suggestedSlug(name: string, suffix: string): string {
  const words = name
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const last = (words[words.length - 1] ?? "").slice(0, 20);
  return `${last ? `${last}-` : ""}retirement-${suffix}`;
}

// ─── Cover photo ──────────────────────────────────────────────────────

// Resized in the browser to a JPEG about 1600px wide and sent as base64.
export const COVER_MAX_CHARS = 480_000;

export function validCover(base64: string): boolean {
  return !!base64 && base64.length <= COVER_MAX_CHARS && /^[A-Za-z0-9+/]+={0,2}$/.test(base64) && base64.startsWith("/9j/");
}
